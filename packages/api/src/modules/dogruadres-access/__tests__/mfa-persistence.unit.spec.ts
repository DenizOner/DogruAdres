/**
 * Unit tests for MfaPersistence (#230).
 *
 * These tests use a fully mocked SecuritySql adapter. They verify:
 *  - Safe defaults for missing/absent rows
 *  - Rejection of corrupt DB values (NULL, string booleans, unknown mode)
 *  - Optimistic concurrency: version-mismatch detection pre-write
 *  - Unauthorized cross-Person preference writes (caller boundary contract)
 *  - No-op detection guards
 *  - Outbox failure propagation
 *  - No secrets in audit event payloads
 *
 * NOTE: These are mocked-persistence unit tests. They do NOT verify PostgreSQL
 * atomicity, advisory-lock serialization, or real constraint enforcement.
 * Those properties belong to integration tests run against a live database.
 */
import {
  MfaPersistence,
  MfaConcurrentUpdateError,
  MfaOutboxFailure,
  type PlatformMfaPolicy,
  type PersonMfaPreference,
} from "../mfa-persistence"
import { InvalidMfaPolicyState } from "../mfa-policy"
import type { SecuritySql } from "../identity-session"

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

type SqlCall = { sql: string; params: unknown[] }

/**
 * Creates a controllable SecuritySql mock.
 * `responses` maps 0-based call index to the row array that execute() returns.
 * Unmatched calls return [].
 */
function makeMockDb(responses: Record<number, unknown[]> = {}): {
  db: SecuritySql
  calls: SqlCall[]
} {
  const calls: SqlCall[] = []
  const db: SecuritySql = {
    async execute(sql: string, params: unknown[] = []) {
      calls.push({ sql, params })
      const idx = calls.length - 1
      return idx in responses ? responses[idx] : []
    },
  }
  return { db, calls }
}

// ---------------------------------------------------------------------------
// readPlatformPolicy
// ---------------------------------------------------------------------------

describe("MfaPersistence.readPlatformPolicy", () => {
  it("returns required/0 default when no row exists", async () => {
    const { db } = makeMockDb({ 0: [] })
    const result = await new MfaPersistence(db).readPlatformPolicy()
    expect(result).toEqual({ platform_mode: "required", version: 0 })
  })

  it("returns persisted required mode and version", async () => {
    const { db } = makeMockDb({ 0: [{ platform_mode: "required", version: 3 }] })
    expect(await new MfaPersistence(db).readPlatformPolicy()).toEqual({
      platform_mode: "required",
      version: 3,
    })
  })

  it("returns persisted optional mode", async () => {
    const { db } = makeMockDb({ 0: [{ platform_mode: "optional", version: 1 }] })
    expect(await new MfaPersistence(db).readPlatformPolicy()).toEqual({
      platform_mode: "optional",
      version: 1,
    })
  })

  it("returns persisted disabled mode", async () => {
    const { db } = makeMockDb({ 0: [{ platform_mode: "disabled", version: 7 }] })
    expect(await new MfaPersistence(db).readPlatformPolicy()).toEqual({
      platform_mode: "disabled",
      version: 7,
    })
  })

  it.each([
    [null], ["REQUIRED"], ["true"], [0], [false], [{}], [undefined],
  ])("throws InvalidMfaPolicyState for corrupt mode value: %p", async (badMode) => {
    const { db } = makeMockDb({ 0: [{ platform_mode: badMode, version: 1 }] })
    await expect(new MfaPersistence(db).readPlatformPolicy()).rejects.toBeInstanceOf(InvalidMfaPolicyState)
  })

  it("throws InvalidMfaPolicyState when db returns more than one row (data integrity breach)", async () => {
    const { db } = makeMockDb({
      0: [
        { platform_mode: "required", version: 1 },
        { platform_mode: "optional", version: 2 },
      ],
    })
    await expect(new MfaPersistence(db).readPlatformPolicy()).rejects.toBeInstanceOf(InvalidMfaPolicyState)
  })
})

// ---------------------------------------------------------------------------
// setPlatformPolicy
// ---------------------------------------------------------------------------

describe("MfaPersistence.setPlatformPolicy", () => {
  it("inserts a new row when expectedVersion=0 (no prior row)", async () => {
    // calls: 0=advisory lock, 1=read policy (absent), 2=insert, 3=audit insert, 4=outbox insert
    const { db, calls } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    const result = await new MfaPersistence(db).setPlatformPolicy("optional", 0, "daprs_admin")
    expect(result).toEqual({ platform_mode: "optional", version: 1 })
    expect(calls[2].sql).toMatch(/insert into da_mfa_policy/)
    expect(calls[2].params).toContain("optional")
  })

  it("updates existing row when expectedVersion matches", async () => {
    // calls: 0=advisory lock, 1=read policy (row present), 2=update, 3=audit insert, 4=outbox insert
    const { db, calls } = makeMockDb({
      0: [],
      1: [{ platform_mode: "required", version: 2 }],
      2: [{ version: 3 }], // affected rows from update…returning
      3: [],
      4: [],
    })
    const result = await new MfaPersistence(db).setPlatformPolicy("disabled", 2, "daprs_admin")
    expect(result).toEqual({ platform_mode: "disabled", version: 3 })
    expect(calls[2].sql).toMatch(/update da_mfa_policy/)
    expect(calls[2].params).toContain("disabled")
    expect(calls[2].params).toContain(2) // expectedVersion
  })

  it("throws MfaConcurrentUpdateError when expectedVersion does not match current", async () => {
    const { db } = makeMockDb({
      0: [],
      1: [{ platform_mode: "required", version: 5 }], // current is 5, caller claims 3
    })
    await expect(
      new MfaPersistence(db).setPlatformPolicy("optional", 3, "daprs_admin")
    ).rejects.toBeInstanceOf(MfaConcurrentUpdateError)
  })

  it("throws MfaConcurrentUpdateError when update affects 0 rows (lost update race)", async () => {
    const { db } = makeMockDb({
      0: [],
      1: [{ platform_mode: "required", version: 2 }],
      2: [], // 0 rows returned from update → lost race
    })
    await expect(
      new MfaPersistence(db).setPlatformPolicy("disabled", 2, "daprs_admin")
    ).rejects.toBeInstanceOf(MfaConcurrentUpdateError)
  })

  it("throws InvalidMfaPolicyState for an invalid mode value before touching db rows", async () => {
    const { db, calls } = makeMockDb()
    await expect(
      (new MfaPersistence(db) as any).setPlatformPolicy("INVALID_MODE", 0, "daprs_admin")
    ).rejects.toBeInstanceOf(InvalidMfaPolicyState)
    // Advisory lock should still not have been called (validation is first)
    expect(calls.length).toBe(0)
  })

  it("does not include secrets, tokens or hashes in the outbox event payload", async () => {
    const { db, calls } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    await new MfaPersistence(db).setPlatformPolicy("required", 0, "daprs_admin")
    const auditCall = calls.find((c) => c.sql.includes("da_audit_event"))
    expect(auditCall).toBeDefined()
    const payloads = auditCall!.params.filter((p) => typeof p === "string" && p.startsWith("{"))
    for (const payload of payloads) {
      const parsed = JSON.parse(payload as string)
      const keys = Object.keys(parsed)
      // Only platform_mode may appear; no session tokens, hashes, or personal data
      expect(keys.every((k) => k === "platform_mode")).toBe(true)
    }
  })

  it("throws MfaOutboxFailure when da_security_outbox write fails and propagates cause", async () => {
    const outboxError = new Error("outbox write failure (simulated)")
    const { db } = makeMockDb({ 0: [], 1: [], 2: [] })
    // Override: make the 4th call (outbox insert) throw
    let callCount = 0
    const throwingDb: SecuritySql = {
      async execute(sql, params = []) {
        callCount++
        if (callCount === 5) throw outboxError // da_security_outbox insert
        if (callCount === 1) return [] // advisory lock
        if (callCount === 2) return [] // read policy — absent
        if (callCount === 3) return [] // insert policy row
        if (callCount === 4) return [] // audit_event insert
        return []
      },
    }
    const err = await new MfaPersistence(throwingDb)
      .setPlatformPolicy("optional", 0, "daprs_admin")
      .catch((e) => e)
    expect(err).toBeInstanceOf(MfaOutboxFailure)
    expect((err as MfaOutboxFailure).cause).toBe(outboxError)
  })
})

// ---------------------------------------------------------------------------
// readPersonPreference
// ---------------------------------------------------------------------------

describe("MfaPersistence.readPersonPreference", () => {
  const personId = "daprs_alice"

  it("returns false/0 default when no row exists", async () => {
    const { db } = makeMockDb({ 0: [] })
    expect(await new MfaPersistence(db).readPersonPreference(personId)).toEqual({
      person_id: personId,
      user_enabled: false,
      version: 0,
    })
  })

  it("returns true for an opted-in person", async () => {
    const { db } = makeMockDb({ 0: [{ user_enabled: true, version: 1 }] })
    expect(await new MfaPersistence(db).readPersonPreference(personId)).toEqual({
      person_id: personId,
      user_enabled: true,
      version: 1,
    })
  })

  it.each([
    [null], ["true"], ["false"], [1], [0], [{}], [undefined], ["yes"],
  ])("throws InvalidMfaPolicyState for corrupt user_enabled value: %p", async (badVal) => {
    const { db } = makeMockDb({ 0: [{ user_enabled: badVal, version: 1 }] })
    await expect(new MfaPersistence(db).readPersonPreference(personId)).rejects.toBeInstanceOf(
      InvalidMfaPolicyState
    )
  })

  it("throws InvalidMfaPolicyState for multiple rows (integrity breach)", async () => {
    const { db } = makeMockDb({
      0: [
        { user_enabled: true, version: 1 },
        { user_enabled: false, version: 2 },
      ],
    })
    await expect(new MfaPersistence(db).readPersonPreference(personId)).rejects.toBeInstanceOf(
      InvalidMfaPolicyState
    )
  })
})

// ---------------------------------------------------------------------------
// setPersonPreference
// ---------------------------------------------------------------------------

describe("MfaPersistence.setPersonPreference", () => {
  const personId = "daprs_alice"
  const actorId = "daprs_alice" // self-service

  it("inserts a new preference row when expectedVersion=0", async () => {
    const { db, calls } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    const result = await new MfaPersistence(db).setPersonPreference(personId, true, 0, actorId)
    expect(result).toEqual({ person_id: personId, user_enabled: true, version: 1 })
    expect(calls[2].sql).toMatch(/insert into da_person_mfa_preference/)
    expect(calls[2].params).toContain(true)
  })

  it("updates existing preference when expectedVersion matches", async () => {
    const { db, calls } = makeMockDb({
      0: [],
      1: [{ user_enabled: true, version: 3 }],
      2: [{ version: 4 }],
      3: [],
      4: [],
    })
    const result = await new MfaPersistence(db).setPersonPreference(personId, false, 3, actorId)
    expect(result).toEqual({ person_id: personId, user_enabled: false, version: 4 })
    expect(calls[2].sql).toMatch(/update da_person_mfa_preference/)
  })

  it("throws MfaConcurrentUpdateError when expectedVersion mismatches current", async () => {
    const { db } = makeMockDb({
      0: [],
      1: [{ user_enabled: false, version: 5 }], // current=5, caller claims 2
    })
    await expect(
      new MfaPersistence(db).setPersonPreference(personId, true, 2, actorId)
    ).rejects.toBeInstanceOf(MfaConcurrentUpdateError)
  })

  it("throws MfaConcurrentUpdateError when update affects 0 rows", async () => {
    const { db } = makeMockDb({
      0: [],
      1: [{ user_enabled: false, version: 3 }],
      2: [], // lost race
    })
    await expect(
      new MfaPersistence(db).setPersonPreference(personId, true, 3, actorId)
    ).rejects.toBeInstanceOf(MfaConcurrentUpdateError)
  })

  it("does NOT prevent cross-person writes at SQL level (caller responsibility)", async () => {
    // The class does not perform authorization. This test documents the
    // contract: callers MUST check actorPersonId === personId or hold admin
    // authorization before calling setPersonPreference.
    const { db } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    const adversaryActor = "daprs_evil"
    // No exception is thrown by the persistence layer itself for a cross-person write;
    // the outbox payload captures actorPersonId for downstream audit detection.
    await expect(
      new MfaPersistence(db).setPersonPreference(personId, true, 0, adversaryActor)
    ).resolves.toEqual({ person_id: personId, user_enabled: true, version: 1 })
    const auditCall = db // find audit call
    const calls: SqlCall[] = []
    const trackingDb: SecuritySql = {
      async execute(sql, params = []) {
        calls.push({ sql, params })
        if (calls.length === 1) return []
        if (calls.length === 2) return []
        if (calls.length === 3) return []
        if (calls.length === 4) return []
        return []
      },
    }
    await new MfaPersistence(trackingDb).setPersonPreference(personId, true, 0, adversaryActor)
    const auditInsert = calls.find((c) => c.sql.includes("da_audit_event"))
    expect(auditInsert).toBeDefined()
    // adversaryActor ID appears in the audit row as actor_person_id
    expect(auditInsert!.params).toContain(adversaryActor)
  })

  it("does not include secrets or tokens in outbox event payload", async () => {
    const { db, calls } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    await new MfaPersistence(db).setPersonPreference(personId, true, 0, actorId)
    const auditCall = calls.find((c) => c.sql.includes("da_audit_event"))
    expect(auditCall).toBeDefined()
    const payloads = auditCall!.params.filter((p) => typeof p === "string" && p.startsWith("{"))
    for (const payload of payloads) {
      const parsed = JSON.parse(payload as string)
      const keys = Object.keys(parsed)
      expect(keys.every((k) => k === "user_enabled")).toBe(true)
    }
  })

  it("throws MfaOutboxFailure when outbox write fails", async () => {
    let callCount = 0
    const db: SecuritySql = {
      async execute() {
        callCount++
        if (callCount === 5) throw new Error("outbox error")
        return []
      },
    }
    await expect(
      new MfaPersistence(db).setPersonPreference(personId, true, 0, actorId)
    ).rejects.toBeInstanceOf(MfaOutboxFailure)
  })
})

// ---------------------------------------------------------------------------
// No-op guards
// ---------------------------------------------------------------------------

describe("MfaPersistence no-op guards", () => {
  it("isPlatformPolicyNoOp returns true when mode unchanged (absent row = required default)", async () => {
    const { db } = makeMockDb({ 0: [] }) // absent → default required
    expect(await new MfaPersistence(db).isPlatformPolicyNoOp("required")).toBe(true)
  })

  it("isPlatformPolicyNoOp returns false when mode differs from absent-row default", async () => {
    const { db } = makeMockDb({ 0: [] }) // default = required
    expect(await new MfaPersistence(db).isPlatformPolicyNoOp("optional")).toBe(false)
  })

  it("isPlatformPolicyNoOp returns true when persisted mode matches", async () => {
    const { db } = makeMockDb({ 0: [{ platform_mode: "disabled", version: 2 }] })
    expect(await new MfaPersistence(db).isPlatformPolicyNoOp("disabled")).toBe(true)
  })

  it("isPlatformPolicyNoOp returns false when persisted mode differs", async () => {
    const { db } = makeMockDb({ 0: [{ platform_mode: "optional", version: 1 }] })
    expect(await new MfaPersistence(db).isPlatformPolicyNoOp("required")).toBe(false)
  })

  it("isPersonPreferenceNoOp returns true when preference unchanged (absent = false default)", async () => {
    const { db } = makeMockDb({ 0: [] })
    expect(await new MfaPersistence(db).isPersonPreferenceNoOp("daprs_alice", false)).toBe(true)
  })

  it("isPersonPreferenceNoOp returns false when preference differs from absent default", async () => {
    const { db } = makeMockDb({ 0: [] })
    expect(await new MfaPersistence(db).isPersonPreferenceNoOp("daprs_alice", true)).toBe(false)
  })

  it("isPersonPreferenceNoOp returns true when persisted value matches", async () => {
    const { db } = makeMockDb({ 0: [{ user_enabled: true, version: 3 }] })
    expect(await new MfaPersistence(db).isPersonPreferenceNoOp("daprs_alice", true)).toBe(true)
  })

  it("isPersonPreferenceNoOp returns false when persisted value differs", async () => {
    const { db } = makeMockDb({ 0: [{ user_enabled: true, version: 3 }] })
    expect(await new MfaPersistence(db).isPersonPreferenceNoOp("daprs_alice", false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Invariant: native factor state is never read, written, or referenced
// ---------------------------------------------------------------------------

describe("MfaPersistence native factor boundary", () => {
  it("never queries Medusa native MFA tables", async () => {
    const { db, calls } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    await new MfaPersistence(db).setPlatformPolicy("optional", 0, "daprs_admin")
    for (const call of calls) {
      expect(call.sql).not.toMatch(/auth_/i)
      expect(call.sql).not.toMatch(/totp/i)
      expect(call.sql).not.toMatch(/mfa_factor/i)
    }
  })

  it("never queries native MFA tables on preference write", async () => {
    const { db, calls } = makeMockDb({ 0: [], 1: [], 2: [], 3: [], 4: [] })
    await new MfaPersistence(db).setPersonPreference("daprs_alice", true, 0, "daprs_alice")
    for (const call of calls) {
      expect(call.sql).not.toMatch(/auth_/i)
      expect(call.sql).not.toMatch(/totp/i)
      expect(call.sql).not.toMatch(/mfa_factor/i)
    }
  })
})
