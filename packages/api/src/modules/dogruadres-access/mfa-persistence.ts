/**
 * MFA persistence contract (#230). Foundation-owned singleton platform policy
 * and per-Person preference. Pure SQL via the task-module transaction manager.
 *
 * Boundaries:
 *  - Does NOT read, write, enable, disable or bypass native Medusa MFA factors.
 *  - Does NOT perform authentication or grant authorization.
 *  - Does NOT embed secrets, tokens, hashes or personal data in outbox events.
 *  - Callers MUST supply the active module transaction manager (securitySql).
 *  - Absent rows => safe defaults; corrupt column values => InvalidMfaPolicyState.
 *  - Every mutable operation writes a da_security_outbox row in the same tx.
 *  - Optimistic concurrency: callers MUST supply current version; mismatch
 *    throws MfaConcurrentUpdateError before any write.
 */
import { randomUUID } from "node:crypto"
import {
  DEFAULT_MFA_PREFERENCES,
  InvalidMfaPolicyState,
  MFA_PLATFORM_MODES,
  type MfaPlatformMode,
} from "./mfa-policy"
import type { SecuritySql } from "./identity-session"

// ---------------------------------------------------------------------------
// Exported value-types
// ---------------------------------------------------------------------------

export type PlatformMfaPolicy = Readonly<{
  platform_mode: MfaPlatformMode
  version: number
}>

export type PersonMfaPreference = Readonly<{
  person_id: string
  user_enabled: boolean
  version: number
}>

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class MfaConcurrentUpdateError extends Error {
  constructor() {
    super("MFA policy was modified by a concurrent writer; re-read and retry")
    this.name = "MfaConcurrentUpdateError"
  }
}

export class MfaOutboxFailure extends Error {
  // Explicit cause field for ES2021 target compatibility (Error.cause is ES2022).
  readonly cause: unknown
  constructor(cause: unknown) {
    super("MFA audit outbox write failed; transaction will be rolled back")
    this.name = "MfaOutboxFailure"
    this.cause = cause
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const OUTBOX_MODULE = "dogruadres-access"
const OUTBOX_RESOURCE = "mfa-policy"

async function writeOutbox(
  db: SecuritySql,
  action: string,
  actorPersonId: string,
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
       values (?,?,'system','mfa-persistence',?,?,?,?,?,clock_timestamp(),now(),now())`,
      [
        auditId,
        actorPersonId,
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
    throw new MfaOutboxFailure(err)
  }
}

function assertValidMode(value: unknown): MfaPlatformMode {
  if (MFA_PLATFORM_MODES.some((m) => m === value)) return value as MfaPlatformMode
  throw new InvalidMfaPolicyState()
}

function assertValidBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  throw new InvalidMfaPolicyState()
}

// ---------------------------------------------------------------------------
// MfaPersistence
// ---------------------------------------------------------------------------

/**
 * All methods MUST be called from within an active Medusa module transaction
 * that owns the da_mfa_policy and da_person_mfa_preference tables.
 */
export class MfaPersistence {
  constructor(private readonly db: SecuritySql) {}

  // -------------------------------------------------------------------------
  // Platform policy — singleton row (id = 'current')
  // -------------------------------------------------------------------------

  /**
   * Returns the singleton platform policy or a safe default when the row is
   * absent. A corrupt platform_mode value throws InvalidMfaPolicyState.
   */
  async readPlatformPolicy(): Promise<PlatformMfaPolicy> {
    const rows = await this.db.execute(
      `select platform_mode, version from da_mfa_policy where id='current'`
    )
    if (rows.length === 0) {
      return { platform_mode: DEFAULT_MFA_PREFERENCES.platform_mode, version: 0 }
    }
    if (rows.length !== 1) throw new InvalidMfaPolicyState()
    const row = rows[0]
    return {
      platform_mode: assertValidMode(row.platform_mode),
      version: Number(row.version),
    }
  }

  /**
   * Upserts the singleton platform policy.
   *
   * - actorPersonId: the platform administrator performing the change.
   * - expectedVersion: 0 for initial creation, otherwise the version the
   *   caller last read. A mismatch throws MfaConcurrentUpdateError.
   * - Emits a da_security_outbox event. If that write fails the whole
   *   transaction is poisoned and must be rolled back by the caller.
   */
  async setPlatformPolicy(
    newMode: MfaPlatformMode,
    expectedVersion: number,
    actorPersonId: string
  ): Promise<PlatformMfaPolicy> {
    assertValidMode(newMode)

    // Optimistic concurrency: advisory lock serialises concurrent writers.
    await this.db.execute(
      `select pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))`,
      []
    )
    const current = await this.readPlatformPolicy()
    if (current.version !== expectedVersion) throw new MfaConcurrentUpdateError()

    const nextVersion = expectedVersion + 1
    const previous: Record<string, unknown> | null =
      expectedVersion === 0 ? null : { platform_mode: current.platform_mode }
    const next: Record<string, unknown> = { platform_mode: newMode }

    if (expectedVersion === 0) {
      await this.db.execute(
        `insert into da_mfa_policy(id,platform_mode,version,created_at,updated_at)
         values ('current',?,?,now(),now())`,
        [newMode, nextVersion]
      )
    } else {
      const affected = await this.db.execute(
        `update da_mfa_policy set platform_mode=?,version=?,updated_at=now()
         where id='current' and version=?
         returning version`,
        [newMode, nextVersion, expectedVersion]
      )
      if (affected.length !== 1) throw new MfaConcurrentUpdateError()
    }

    await writeOutbox(this.db, "mfa.platform_policy.set", actorPersonId, "current", previous, next)
    return { platform_mode: newMode, version: nextVersion }
  }

  // -------------------------------------------------------------------------
  // Person preference
  // -------------------------------------------------------------------------

  /**
   * Returns the personal MFA preference or a safe default when the row is
   * absent. A corrupt user_enabled column throws InvalidMfaPolicyState.
   */
  async readPersonPreference(personId: string): Promise<PersonMfaPreference> {
    const rows = await this.db.execute(
      `select user_enabled, version from da_person_mfa_preference where person_id=?`,
      [personId]
    )
    if (rows.length === 0) {
      return { person_id: personId, user_enabled: DEFAULT_MFA_PREFERENCES.user_enabled, version: 0 }
    }
    if (rows.length !== 1) throw new InvalidMfaPolicyState()
    const row = rows[0]
    return {
      person_id: personId,
      user_enabled: assertValidBool(row.user_enabled),
      version: Number(row.version),
    }
  }

  /**
   * Upserts a Person's personal MFA preference.
   *
   * Authorization boundary: callers MUST verify that actorPersonId === personId
   * (self-service) OR that the actor holds platform-administrator authorization
   * BEFORE calling this method. This class does not perform authorization.
   */
  async setPersonPreference(
    personId: string,
    newUserEnabled: boolean,
    expectedVersion: number,
    actorPersonId: string
  ): Promise<PersonMfaPreference> {
    assertValidBool(newUserEnabled)

    await this.db.execute(
      `select pg_advisory_xact_lock(hashtext('dogruadres-mfa-person'),hashtext(?))`,
      [personId]
    )
    const current = await this.readPersonPreference(personId)
    if (current.version !== expectedVersion) throw new MfaConcurrentUpdateError()

    const nextVersion = expectedVersion + 1
    const previous: Record<string, unknown> | null =
      expectedVersion === 0 ? null : { user_enabled: current.user_enabled }
    const next: Record<string, unknown> = { user_enabled: newUserEnabled }

    if (expectedVersion === 0) {
      await this.db.execute(
        `insert into da_person_mfa_preference(person_id,user_enabled,version,created_at,updated_at)
         values (?,?,?,now(),now())`,
        [personId, newUserEnabled, nextVersion]
      )
    } else {
      const affected = await this.db.execute(
        `update da_person_mfa_preference set user_enabled=?,version=?,updated_at=now()
         where person_id=? and version=?
         returning version`,
        [newUserEnabled, nextVersion, personId, expectedVersion]
      )
      if (affected.length !== 1) throw new MfaConcurrentUpdateError()
    }

    await writeOutbox(this.db, "mfa.person_preference.set", actorPersonId, personId, previous, next)
    return { person_id: personId, user_enabled: newUserEnabled, version: nextVersion }
  }

  // -------------------------------------------------------------------------
  // No-op guards
  // -------------------------------------------------------------------------

  /** True when the persisted platform mode already equals the requested value. */
  async isPlatformPolicyNoOp(newMode: MfaPlatformMode): Promise<boolean> {
    const current = await this.readPlatformPolicy()
    return current.platform_mode === newMode
  }

  /** True when the persisted preference already equals the requested value. */
  async isPersonPreferenceNoOp(personId: string, newUserEnabled: boolean): Promise<boolean> {
    const current = await this.readPersonPreference(personId)
    return current.user_enabled === newUserEnabled
  }
}
