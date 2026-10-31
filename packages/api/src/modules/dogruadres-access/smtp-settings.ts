import { randomUUID } from "node:crypto"
import type { SecuritySql } from "./identity-session"
import { encryptSmtpPassword, decryptSmtpPassword } from "./smtp-crypto"
import { isPrivateIp } from "./smtp-client"

const OUTBOX_MODULE = "dogruadres-access"
const OUTBOX_RESOURCE = "platform.smtp"
const MAX_DB_VERSION = 2147483646

export class SmtpConcurrentUpdateError extends Error {
  constructor() {
    super("SMTP settings were modified by another transaction; reload and retry")
    this.name = "SmtpConcurrentUpdateError"
  }
}

export class SmtpOutboxFailure extends Error {
  public readonly cause: unknown
  constructor(cause: unknown) {
    super("da_security_outbox write failed during SMTP settings update")
    this.name = "SmtpOutboxFailure"
    this.cause = cause
  }
}

export class InvalidSmtpSettingsState extends Error {
  constructor(message = "Corrupt or invalid SMTP settings state encountered") {
    super(message)
    this.name = "InvalidSmtpSettingsState"
  }
}

export type SmtpSecurityMode = "ssl" | "tls"

export type SmtpAuditActor = Readonly<{
  person_id: string
  actor_type: "user" | "customer"
  actor_id: string
}>

export type PlatformSmtpSettings = Readonly<{
  enabled: boolean
  host: string
  port: number
  security: SmtpSecurityMode
  username: string | null
  from_email: string
  from_name: string | null
  has_password: boolean
  version: number
  updated_at?: string | Date
}>

export type ResolvedRuntimeSmtpConfig = PlatformSmtpSettings & {
  password: string | null
}

export type UpdateSmtpSettingsInput = Readonly<{
  enabled: boolean
  host: string
  port: number
  security: SmtpSecurityMode
  username?: string | null
  password?: string | null // string => update, null => remove, undefined => preserve existing
  from_email: string
  from_name?: string | null
  expected_version: number
}>

function assertActor(actor: SmtpAuditActor): void {
  if (!actor || !actor.person_id || !actor.actor_id || !actor.actor_type) {
    throw new InvalidSmtpSettingsState("Valid audit actor required")
  }
}

function assertVersion(v: unknown): number {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_DB_VERSION) {
    return v
  }
  throw new InvalidSmtpSettingsState("Invalid settings version")
}

async function writeOutbox(
  db: SecuritySql,
  action: string,
  actor: SmtpAuditActor,
  targetId: string,
  previousValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
): Promise<void> {
  const auditId = `daaud_${randomUUID()}`
  try {
    await db.execute(
      `insert into da_audit_event
        (id,actor_person_id,actor_type,actor_id,action,module,resource,target_id,
         previous_values,new_values,occurred_at,created_at,updated_at)
       values (?,?,?,?,?,?,?,?,?,?,clock_timestamp(),now(),now())`,
      [
        auditId,
        actor.person_id,
        actor.actor_type,
        actor.actor_id,
        action,
        OUTBOX_MODULE,
        OUTBOX_RESOURCE,
        targetId,
        previousValues !== null ? JSON.stringify(previousValues) : null,
        newValues !== null ? JSON.stringify(newValues) : null,
      ]
    )
    await db.execute(
      `insert into da_security_outbox(id,audit_event_id,created_at) values (?,?,now())`,
      [randomUUID(), auditId]
    )
  } catch (err) {
    throw new SmtpOutboxFailure(err)
  }
}

export class PlatformSmtpPersistence {
  constructor(private readonly db: SecuritySql) {}

  /**
   * Reads current platform SMTP settings from DB or returns safe bootstrap defaults.
   * Never leaks decrypted password unless includeSecret is explicitly true.
   */
  async readSettings(includeSecret = false): Promise<ResolvedRuntimeSmtpConfig> {
    const rows = await this.db.execute(
      `select enabled, host, port, security, username, password_encrypted,
              from_email, from_name, version, updated_at
       from da_platform_smtp_settings
       where id='current'`
    )

    if (rows.length === 0) {
      // Safe fallback to environment bootstrap variables
      const envEnabled = process.env.SMTP_ENABLED !== "false"
      const envHost = process.env.SMTP_HOST || "smtp.gmail.com"
      const envPort = parseInt(process.env.SMTP_PORT || "465", 10)
      const envSecRaw = (process.env.SMTP_SECURITY || "ssl").toLowerCase()
      const envSecurity: SmtpSecurityMode = envSecRaw === "tls" ? "tls" : "ssl"
      const envUsername = process.env.SMTP_USERNAME || null
      const envFromEmail = process.env.SMTP_FROM_EMAIL || envUsername || "test@dogruadres.invalid"
      const envFromName = process.env.SMTP_FROM_NAME || "DogruAdres Test"
      const envPassword = process.env.SMTP_PASSWORD || null

      return {
        enabled: envEnabled,
        host: envHost,
        port: envPort,
        security: envSecurity,
        username: envUsername,
        from_email: envFromEmail,
        from_name: envFromName,
        has_password: Boolean(envPassword),
        password: includeSecret ? envPassword : null,
        version: 0,
      }
    }

    const row = rows[0]
    let decryptedPassword: string | null = null
    const hasPassword = Boolean(row.password_encrypted)

    if (includeSecret && hasPassword) {
      try {
        decryptedPassword = decryptSmtpPassword(row.password_encrypted)
      } catch {
        // Corrupted or inaccessible password throws InvalidSmtpSettingsState
        throw new InvalidSmtpSettingsState("Failed to decrypt stored SMTP credentials")
      }
    }

    return {
      enabled: Boolean(row.enabled),
      host: String(row.host),
      port: Number(row.port),
      security: row.security === "tls" ? "tls" : "ssl",
      username: row.username ? String(row.username) : null,
      from_email: String(row.from_email),
      from_name: row.from_name ? String(row.from_name) : null,
      has_password: hasPassword,
      password: decryptedPassword,
      version: assertVersion(row.version),
      updated_at: row.updated_at,
    }
  }

  /**
   * Updates platform SMTP configuration with optimistic concurrency control (CAS)
   * and transactional audit/outbox event emission.
   */
  async updateSettings(
    input: UpdateSmtpSettingsInput,
    actor: SmtpAuditActor
  ): Promise<PlatformSmtpSettings> {
    assertActor(actor)
    assertVersion(input.expected_version)
    if (input.expected_version === MAX_DB_VERSION) {
      throw new SmtpConcurrentUpdateError()
    }

    // SSRF validation
    if (!input.host || isPrivateIp(input.host)) {
      throw new InvalidSmtpSettingsState(`Target host is disallowed: ${input.host}`)
    }

    if (input.security !== "ssl" && input.security !== "tls") {
      throw new InvalidSmtpSettingsState("Insecure TLS settings disallowed; must be 'ssl' or 'tls'")
    }

    if (input.port <= 0 || input.port > 65535) {
      throw new InvalidSmtpSettingsState("Invalid port number")
    }

    // Advisory transaction lock serializes concurrent platform SMTP configuration updates
    await this.db.execute(`select pg_advisory_xact_lock(hashtext('dogruadres-smtp-platform'))`, [])

    const existingRows = await this.db.execute(
      `select enabled, host, port, security, username, password_encrypted,
              from_email, from_name, version
       from da_platform_smtp_settings
       where id='current'`
    )

    const exists = existingRows.length > 0
    const currentVersion = exists ? assertVersion(existingRows[0].version) : 0

    if (currentVersion !== input.expected_version) {
      throw new SmtpConcurrentUpdateError()
    }

    const nextVersion = currentVersion + 1

    // Determine encrypted password
    let nextEncryptedPassword: string | null = null
    let passwordAuditEventDiff = "[PRESERVED]"

    if (input.password !== undefined) {
      if (input.password === null || input.password === "") {
        nextEncryptedPassword = null
        passwordAuditEventDiff = "[REMOVED]"
      } else {
        nextEncryptedPassword = encryptSmtpPassword(input.password)
        passwordAuditEventDiff = "[UPDATED]"
      }
    } else if (exists) {
      // Preserve existing encrypted password
      nextEncryptedPassword = existingRows[0].password_encrypted
      passwordAuditEventDiff = "[PRESERVED]"
    } else if (process.env.SMTP_PASSWORD) {
      // Bootstrapping from env into database
      nextEncryptedPassword = encryptSmtpPassword(process.env.SMTP_PASSWORD)
      passwordAuditEventDiff = "[INITIALIZED_FROM_ENV]"
    }

    const previousValues: Record<string, unknown> | null = exists
      ? {
          enabled: existingRows[0].enabled,
          host: existingRows[0].host,
          port: existingRows[0].port,
          security: existingRows[0].security,
          username: existingRows[0].username,
          from_email: existingRows[0].from_email,
          from_name: existingRows[0].from_name,
          has_password: Boolean(existingRows[0].password_encrypted),
          version: existingRows[0].version,
        }
      : null

    const newValues: Record<string, unknown> = {
      enabled: input.enabled,
      host: input.host,
      port: input.port,
      security: input.security,
      username: input.username ?? null,
      from_email: input.from_email,
      from_name: input.from_name ?? null,
      has_password: Boolean(nextEncryptedPassword),
      password_change: passwordAuditEventDiff,
      version: nextVersion,
    }

    if (!exists) {
      await this.db.execute(
        `insert into da_platform_smtp_settings
          (id, enabled, host, port, security, username, password_encrypted,
           from_email, from_name, version, updated_by_person_id, created_at, updated_at)
         values ('current', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
        [
          input.enabled,
          input.host,
          input.port,
          input.security,
          input.username ?? null,
          nextEncryptedPassword,
          input.from_email,
          input.from_name ?? null,
          nextVersion,
          actor.person_id,
        ]
      )
    } else {
      const affected = await this.db.execute(
        `update da_platform_smtp_settings
         set enabled = ?, host = ?, port = ?, security = ?, username = ?,
             password_encrypted = ?, from_email = ?, from_name = ?,
             version = ?, updated_by_person_id = ?, updated_at = now()
         where id = 'current' and version = ?
         returning version`,
        [
          input.enabled,
          input.host,
          input.port,
          input.security,
          input.username ?? null,
          nextEncryptedPassword,
          input.from_email,
          input.from_name ?? null,
          nextVersion,
          actor.person_id,
          input.expected_version,
        ]
      )
      if (affected.length !== 1) {
        throw new SmtpConcurrentUpdateError()
      }
    }

    // Record audit event in the same transaction
    await writeOutbox(
      this.db,
      "platform.smtp_settings_updated",
      actor,
      "current",
      previousValues,
      newValues
    )

    return {
      enabled: input.enabled,
      host: input.host,
      port: input.port,
      security: input.security,
      username: input.username ?? null,
      from_email: input.from_email,
      from_name: input.from_name ?? null,
      has_password: Boolean(nextEncryptedPassword),
      version: nextVersion,
    }
  }
}
