import {
  PlatformSmtpPersistence,
  assertSmtpCredentialReuse,
  SmtpCredentialScopeChanged,
  SmtpConcurrentUpdateError,
  InvalidSmtpSettingsState,
  type SmtpAuditActor,
  type UpdateSmtpSettingsInput,
} from "../smtp-settings"
import type { SecuritySql } from "../identity-session"

describe("smtp-settings unit tests", () => {
  const originalKey = process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
  const dummyActor: SmtpAuditActor = {
    person_id: "daprs_01TEST_PERSON_A",
    actor_type: "user",
    actor_id: "usr_01TEST_USER_A",
  }

  beforeEach(() => {
    process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  })

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = originalKey
    } else {
      delete process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
    }
  })

  it("reads default bootstrap settings when table is empty", async () => {
    const mockDb: SecuritySql = {
      execute: jest.fn().mockResolvedValue([]),
    }
    const store = new PlatformSmtpPersistence(mockDb)
    const settings = await store.readSettings()

    expect(settings.enabled).toBe(true)
    expect(settings.version).toBe(0)
    expect(settings.has_password).toBe(Boolean(process.env.SMTP_PASSWORD))
  })

  it("rejects private IP / loopback addresses for SSRF protection", async () => {
    const mockDb: SecuritySql = {
      execute: jest.fn().mockResolvedValue([]),
    }
    const store = new PlatformSmtpPersistence(mockDb)

    const input: UpdateSmtpSettingsInput = {
      enabled: true,
      host: "127.0.0.1",
      port: 465,
      security: "ssl",
      from_email: "admin@dogruadres.com",
      expected_version: 0,
    }

    await expect(store.updateSettings(input, dummyActor)).rejects.toThrow(
      InvalidSmtpSettingsState
    )
  })

  it("inserts new settings row when expected_version is 0 and records audit", async () => {
    const executedQueries: Array<{ sql: string; params: any[] }> = []
    const mockDb: SecuritySql = {
      execute: jest.fn().mockImplementation((sql: string, params: any[] = []) => {
        executedQueries.push({ sql, params })
        if (sql.includes("select pg_advisory_xact_lock")) return Promise.resolve([])
        if (/from\s+da_platform_smtp_settings\s+where\s+id='current'/.test(sql)) return Promise.resolve([])
        if (sql.includes("insert into da_platform_smtp_settings")) return Promise.resolve([])
        if (sql.includes("insert into da_audit_event")) return Promise.resolve([])
        if (sql.includes("insert into da_security_outbox")) return Promise.resolve([])
        return Promise.resolve([])
      }),
    }

    const store = new PlatformSmtpPersistence(mockDb)
    const input: UpdateSmtpSettingsInput = {
      enabled: true,
      host: "smtp.sendgrid.net",
      port: 465,
      security: "ssl",
      username: "apikey",
      password: "SG.supersecret",
      from_email: "notifications@dogruadres.com",
      from_name: "DogruAdres Platform",
      expected_version: 0,
    }

    const updated = await store.updateSettings(input, dummyActor)
    expect(updated.version).toBe(1)
    expect(updated.host).toBe("smtp.sendgrid.net")
    expect(updated.has_password).toBe(true)

    const insertSettingQuery = executedQueries.find((q) =>
      q.sql.includes("insert into da_platform_smtp_settings")
    )
    expect(insertSettingQuery).toBeDefined()
    expect(insertSettingQuery?.params[5]).toMatch(/^v1:/) // password_encrypted

    const auditQuery = executedQueries.find((q) =>
      q.sql.includes("insert into da_audit_event")
    )
    expect(auditQuery).toBeDefined()
    expect(auditQuery?.params[4]).toBe("platform.smtp_settings_updated")
    expect(auditQuery?.params[9]).not.toContain("SG.supersecret") // Never leaks plaintext secret in audit!
  })


  it("requires explicit credentials for a changed SMTP connection identity (including env bootstrap)", async () => {
    const old = { host: "smtp-old.example.invalid", port: 465, security: "ssl" as const, username: "old-user" }
    for (const next of [
      { ...old, host: "smtp-new.example.invalid" },
      { ...old, port: 587 },
      { ...old, security: "tls" as const },
      { ...old, username: "other-user" },
    ]) {
      expect(() => assertSmtpCredentialReuse(old, next, true, undefined))
        .toThrow(SmtpCredentialScopeChanged)
      expect(() => assertSmtpCredentialReuse(old, next, true, "explicit-new-credential"))
        .not.toThrow()
      expect(() => assertSmtpCredentialReuse(old, next, true, null))
        .not.toThrow() // Explicit removal is not secret reuse.
      expect(() => assertSmtpCredentialReuse(old, next, false, undefined))
        .not.toThrow() // No secret to disclose.
    }
    expect(() => assertSmtpCredentialReuse(old, old, true, undefined)).not.toThrow()

    const executed: string[] = []
    const persisted = {
      enabled: true, host: old.host, port: old.port, security: old.security,
      username: old.username, password_encrypted: "v1:synthetic-encrypted-only",
      from_email: "sender@example.invalid", from_name: "Synthetic", version: 2,
    }
    const store = new PlatformSmtpPersistence({
      execute: jest.fn(async (sql: string) => {
        executed.push(sql)
        if (sql.includes("select pg_advisory_xact_lock")) return []
        if (sql.includes("from da_platform_smtp_settings")) return [persisted]
        throw Error("No settings, audit, or outbox write may occur on mismatched SMTP endpoint")
      }),
    })
    await expect(store.updateSettings({
      enabled: true, host: "smtp-new.example.invalid", port: old.port,
      security: old.security, username: old.username, from_email: persisted.from_email,
      expected_version: 2,
    }, dummyActor)).rejects.toThrow(SmtpCredentialScopeChanged)
    expect(executed).toHaveLength(2)

    const prior = Object.fromEntries(
      ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURITY", "SMTP_USERNAME", "SMTP_PASSWORD"]
        .map(key => [key, process.env[key]])
    )
    try {
      process.env.SMTP_HOST = old.host
      process.env.SMTP_PORT = String(old.port)
      process.env.SMTP_SECURITY = old.security
      process.env.SMTP_USERNAME = old.username
      process.env.SMTP_PASSWORD = "synthetic-bootstrap-password"
      const bootstrapSql: string[] = []
      const bootstrap = new PlatformSmtpPersistence({
        execute: jest.fn(async (sql: string) => {
          bootstrapSql.push(sql)
          if (sql.includes("select pg_advisory_xact_lock")) return []
          if (sql.includes("from da_platform_smtp_settings")) return []
          throw Error("No first-row write or audit on unsafe env credential reuse")
        }),
      })
      await expect(bootstrap.updateSettings({
        enabled: true, host: "another-relay.example.invalid", port: old.port,
        security: old.security, username: old.username,
        from_email: persisted.from_email, expected_version: 0,
      }, dummyActor)).rejects.toThrow(SmtpCredentialScopeChanged)
      expect(bootstrapSql).toHaveLength(2)
    } finally {
      for (const [key, value] of Object.entries(prior))
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
  })

  it("preserves an encrypted password when only non-connection sender settings change", async () => {
    const encrypted = "v1:synthetic-encrypted-only"
    const row = {
      enabled: true, host: "smtp.example.invalid", port: 465, security: "ssl",
      username: "smtp-user", password_encrypted: encrypted,
      from_email: "old@example.invalid", from_name: "Old", version: 3,
    }
    const updates: Array<{ sql: string; values: any[] }> = []
    const store = new PlatformSmtpPersistence({
      execute: jest.fn(async (sql: string, values: any[] = []) => {
        updates.push({ sql, values })
        if (sql.includes("select pg_advisory_xact_lock")) return []
        if (sql.includes("from da_platform_smtp_settings")) return [row]
        if (sql.includes("returning version")) return [{ version: 4 }]
        return []
      }),
    })
    const result = await store.updateSettings({
      enabled: false, host: row.host, port: row.port, security: "ssl",
      username: row.username, from_email: "new@example.invalid",
      from_name: "New", expected_version: 3,
    }, dummyActor)
    expect(result.version).toBe(4)
    expect(result.has_password).toBe(true)
    const changed = updates.find(u => u.sql.includes("update da_platform_smtp_settings"))
    expect(changed?.values[5]).toBe(encrypted)
    expect(updates.some(u => u.sql.includes("insert into da_security_outbox"))).toBe(true)
    expect(JSON.stringify(updates.filter(u => u.sql.includes("insert into da_audit_event"))))
      .not.toContain(encrypted)
  })

  it("throws SmtpConcurrentUpdateError when version does not match expected_version", async () => {
    let versionRowRead = false
    const executedQueries: string[] = []
    const mockDb: SecuritySql = {
      execute: jest.fn().mockImplementation((sql: string) => {
        executedQueries.push(sql)
        if (sql.includes("select pg_advisory_xact_lock")) return Promise.resolve([])
        if (/from\s+da_platform_smtp_settings\s+where\s+id='current'/.test(sql)) {
          versionRowRead = true
          return Promise.resolve([
            {
              enabled: true,
              host: "smtp.example.com",
              port: 465,
              security: "ssl",
              version: 2,
            },
          ])
        }
        throw new Error("Unexpected SQL: stale SMTP settings must be rejected before any write")
      }),
    }

    const store = new PlatformSmtpPersistence(mockDb)
    const input: UpdateSmtpSettingsInput = {
      enabled: true,
      host: "smtp.example.com",
      port: 465,
      security: "ssl",
      from_email: "test@example.com",
      expected_version: 1, // Stale version!
    }

    await expect(store.updateSettings(input, dummyActor)).rejects.toThrow(
      SmtpConcurrentUpdateError
    )
    expect(versionRowRead).toBe(true)
    expect(executedQueries).toHaveLength(2) // Advisory lock, then the current-version SELECT only.
    expect(
      executedQueries.filter((sql) =>
        /\b(?:update|insert\s+into|delete\s+from)\s+(?:da_platform_smtp_settings|da_audit_event|da_security_outbox)\b/i.test(sql)
      )
    ).toEqual([]) // No settings, audit, or outbox mutation may be attempted.
  })
})
