/**
 * #369 / M0 MFA E — source-scoped, synthetic fail-first transition probes.
 *
 * These SQL-mock tests do NOT run Medusa native factor verification, a real
 * PostgreSQL transaction, HTTP, Chrome or the full three-mode acceptance.
 * A previously issued one-time challenge must not become a new full login
 * after the underlying policy, Person preference or security epoch changes.
 * Exercises actual IdentitySessions production functions through synthetic SQL.
 * Jest pass alone cannot prove native Medusa/HTTP/PG16 acceptance.
 */
import { IdentitySessions, digest } from "../identity-session"

type Challenge = { identity: string; challengeId: string; consumed: boolean }
function syntheticTransition() {
  const state = {
    platformMode: "required" as "required" | "optional" | "disabled",
    platformVersion: 4,
    personVersion: 2,
    epoch: 3,
    personId: "daprs_synthetic",
  }
  const challenges = new Map<string, Challenge>()
  const mintedSessions: unknown[][] = []
  const auditActions: string[] = []
  let securityOutboxCount = 0
  const execute = jest.fn(async (sql: string, parameters: unknown[] = []): Promise<any[]> => {
    if (sql.startsWith("insert into da_login_challenge")) {
      const [tokenHash, identity, challengeId] = parameters as string[]
      challenges.set(tokenHash, { identity, challengeId, consumed: false })
      return []
    }
    if (sql.startsWith("update da_login_challenge set consumed_at")) {
      const challenge = challenges.get(parameters[0] as string)
      if (!challenge || challenge.consumed) return []
      challenge.consumed = true
      return [{ auth_identity_id: challenge.identity, challenge_id: challenge.challengeId }]
    }
    if (sql.startsWith("select pg_advisory_xact_lock")) return []
    if (sql.includes("as mfa_activated") && !sql.includes("as platform,")) {
      return [{ mfa_activated: "true" }]
    }
    if (sql.startsWith("select auth_identity_id,challenge_id from da_login_challenge")) {
      const challenge = challenges.get(parameters[0] as string)
      return challenge && !challenge.consumed ? [{ auth_identity_id: challenge.identity, challenge_id: challenge.challengeId }] : []
    }
    if (sql.startsWith("select b.*,p.disabled_at from da_login_binding")) {
      return [{
        person_id: state.personId, actor_type: "user",
        actor_id: "user_synthetic", disabled_at: null,
      }]
    }
    if (sql.startsWith("insert into da_person_security")) return []
    if (sql.startsWith("select epoch from da_person_security")) {
      return [{ epoch: state.epoch }]
    }
    if (sql.includes("as platform,") && sql.includes("as person")) {
      return [{
        platform: state.platformVersion, person: state.personVersion,
        mfa_activated: "true",
      }]
    }
    if (sql.startsWith("insert into da_browser_session")) {
      mintedSessions.push([...parameters])
      return []
    }
    if (sql.startsWith("insert into da_audit_event")) {
      auditActions.push(parameters[4] as string)
      return []
    }
    if (sql.startsWith("insert into da_security_outbox")) {
      securityOutboxCount++
      return []
    }
    throw new Error("Unexpected synthetic SQL boundary")
  })
  return {
    sessions: new IdentitySessions({ execute }), state, execute,
    mintedSessions, auditActions,
    outboxes: () => securityOutboxCount,
    changeChallenge: (token: string, id: string) => {
      const row = challenges.get(digest(token))
      if (row) row.challengeId = id
    },
  }
}

describe("#369 MFA transition: pre-existing native challenge cannot cross revision or revocation", () => {
  const flags = [
    "DOGRUADRES_IDENTITY_ENABLED",
    "DOGRUADRES_MFA_SETTINGS_ENABLED",
    "DOGRUADRES_MFA_ENROLLMENT_ENABLED",
    "DOGRUADRES_MFA_RUNTIME_ENABLED",
  ] as const
  const before: Record<string, string | undefined> = {}

  beforeAll(() => {
    for (const flag of flags) {
      before[flag] = process.env[flag]
      process.env[flag] = "true"
    }
    before.COOKIE_SECRET = process.env.COOKIE_SECRET
    process.env.COOKIE_SECRET = "synthetic-369-" + "x".repeat(48)
  })
  afterAll(() => {
    for (const flag of [...flags, "COOKIE_SECRET"]) {
      const previous = before[flag]
      if (previous === undefined) delete process.env[flag]
      else process.env[flag] = previous
    }
  })

  const freshProof = () => new Date(Date.now() - 1000)

  it("positive control: matching current challenge completes once with a strong full session", async () => {
    const h = syntheticTransition()
    const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
    expect(pending.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await expect(h.sessions.challenge(pending.token)).resolves.toEqual({
      auth_identity_id: "auth_synthetic", challenge_id: "native_synthetic",
    })
    await expect(h.sessions.complete(pending.token, freshProof()))
      .resolves.toEqual({ token: expect.any(String), csrf: expect.any(String) })
    expect(h.mintedSessions).toHaveLength(1)
    expect(h.auditActions).toEqual(["session.created"])
    expect(h.outboxes()).toBe(1)
    await expect(h.sessions.complete(pending.token, freshProof()))
      .rejects.toThrow("Access denied")
    expect(h.mintedSessions).toHaveLength(1)
    expect(h.outboxes()).toBe(1)
  })

  it.each(["optional", "disabled"] as const)(
    "must reject required-mode pending challenge after platform changes to %s", async nextMode => {
      const h = syntheticTransition()
      const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
      // Simulate a separately committed, authorized mode/version transition;
      // the SQL mock never grants real platform Staff authority.
      h.state.platformMode = nextMode
      h.state.platformVersion++
      await expect(h.sessions.complete(pending.token, freshProof()))
        .rejects.toThrow("Access denied")
      expect(h.mintedSessions).toHaveLength(0)
      expect(h.auditActions).toHaveLength(0)
      expect(h.outboxes()).toBe(0)
    }
  )

  it("must reject pending challenge after the same Person preference revision changes", async () => {
    const h = syntheticTransition()
    h.state.platformMode = "optional"
    const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
    h.state.personVersion++
    await expect(h.sessions.complete(pending.token, freshProof()))
      .rejects.toThrow("Access denied")
    expect(h.mintedSessions).toHaveLength(0)
    expect(h.outboxes()).toBe(0)
  })

  it("must not resurrect a pending challenge after logout-all advances Person security epoch", async () => {
    const h = syntheticTransition()
    const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
    h.state.epoch++
    await expect(h.sessions.complete(pending.token, freshProof()))
      .rejects.toThrow("Access denied")
    expect(h.mintedSessions).toHaveLength(0)
    expect(h.outboxes()).toBe(0)
  })

  it("rejects a previously issued challenge after its AuthIdentity is rebound to another Person", async () => {
    const h = syntheticTransition()
    const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
    h.state.personId = "daprs_rebound"
    await expect(h.sessions.challenge(pending.token)).resolves.toBeNull()
    await expect(h.sessions.complete(pending.token, freshProof()))
      .rejects.toThrow("Access denied")
    expect(h.mintedSessions).toHaveLength(0)
    expect(h.outboxes()).toBe(0)
  })

  it("rejects an altered native challenge reference before issuing a full session", async () => {
    const h = syntheticTransition()
    const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
    h.changeChallenge(pending.token, "native_different")
    await expect(h.sessions.challenge(pending.token)).resolves.toBeNull()
    await expect(h.sessions.complete(pending.token, freshProof()))
      .rejects.toThrow("Access denied")
    expect(h.mintedSessions).toHaveLength(0)
    expect(h.auditActions).toHaveLength(0)
  })

  it("positive control: a newly issued challenge under the new policy may complete", async () => {
    const h = syntheticTransition()
    h.state.platformMode = "optional"
    h.state.platformVersion++
    const pending = await h.sessions.pending("auth_synthetic", "native_synthetic")
    await expect(h.sessions.complete(pending.token, freshProof()))
      .resolves.toEqual({ token: expect.any(String), csrf: expect.any(String) })
    expect(h.mintedSessions).toHaveLength(1)
    expect(h.outboxes()).toBe(1)
  })
})
