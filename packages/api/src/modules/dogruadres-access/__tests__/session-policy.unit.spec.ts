import {
  assertSessionStateTransition,
  DEFAULT_SESSION_POLICY,
  parseSessionPolicy,
  proposePolicyRevision,
  SessionPolicyContractError,
  SESSION_POLICY_LIMITS,
  evaluateSessionEligibility,
} from "../session-policy"

describe("inactive session policy domain contract", () => {
  it("preserves approved defaults and returns an independent frozen value", () => {
    const input = { ...DEFAULT_SESSION_POLICY }
    const result = parseSessionPolicy(input)
    expect(result).toEqual({ idle_timeout_seconds: 1800, absolute_lifetime_seconds: 28800, recent_auth_seconds: 300 })
    input.idle_timeout_seconds = 1860
    expect(result.idle_timeout_seconds).toBe(1800)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(DEFAULT_SESSION_POLICY)).toBe(true)
  })

  it.each([0, -0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "1800", true, null, undefined])(
    "rejects invalid duration %p without coercion", (value) => {
      for (const field of Object.keys(DEFAULT_SESSION_POLICY)) {
        expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, [field]: value })).toThrow(SessionPolicyContractError)
      }
    }
  )

  // P1 deliberately had no product ranges; #217/6292478831 now approves them.
  it("enforces approved inclusive limits instead of P1's range-agnostic contract", () => {
    const minimum = { idle_timeout_seconds: 300, absolute_lifetime_seconds: 3600, recent_auth_seconds: 60 }
    const maximum = { idle_timeout_seconds: 3600, absolute_lifetime_seconds: 43200, recent_auth_seconds: 600 }
    expect(parseSessionPolicy(minimum)).toEqual(minimum)
    expect(parseSessionPolicy(maximum)).toEqual(maximum)
    for (const field of Object.keys(SESSION_POLICY_LIMITS) as Array<keyof typeof SESSION_POLICY_LIMITS>) {
      const { minimum: min, maximum: max } = SESSION_POLICY_LIMITS[field]
      expect(() => parseSessionPolicy({ ...minimum, [field]: min - 60 })).toThrow()
      expect(() => parseSessionPolicy({ ...maximum, [field]: max + 60 })).toThrow()
      expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, [field]: Number.MAX_SAFE_INTEGER })).toThrow()
      expect(Object.isFrozen(SESSION_POLICY_LIMITS[field])).toBe(true)
    }
    expect(Object.isFrozen(SESSION_POLICY_LIMITS)).toBe(true)
  })

  it.each([301, 359, 1801, "unlimited", "never"])("rejects non-minute or unlimited durations %p", (value) => {
    expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: value })).toThrow()
  })

  it("requires recent-auth <= idle <= absolute", () => {
    expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 300, recent_auth_seconds: 600 })).toThrow()
    expect(parseSessionPolicy({ idle_timeout_seconds: 3600, absolute_lifetime_seconds: 3600, recent_auth_seconds: 600 }).idle_timeout_seconds).toBe(3600)
  })

  it.each([null, undefined, [], "policy", new Date(), Object.create(DEFAULT_SESSION_POLICY)].map((input) => [input]))("rejects malformed policy %p", (input) => {
    expect(() => parseSessionPolicy(input)).toThrow(SessionPolicyContractError)
  })

  it("rejects missing, unknown, symbol and hidden properties", () => {
    expect(() => parseSessionPolicy({ idle_timeout_seconds: 1800 })).toThrow()
    expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, actor_id: "forged" })).toThrow()
    expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, [Symbol("role")]: "admin" })).toThrow()
    const hidden = Object.defineProperty({ ...DEFAULT_SESSION_POLICY }, "role", { value: "admin" })
    expect(() => parseSessionPolicy(hidden)).toThrow()
  })

  it("rejects accessors without executing them", () => {
    let reads = 0
    const input = { ...DEFAULT_SESSION_POLICY }
    Object.defineProperty(input, "idle_timeout_seconds", { enumerable: true, get() { reads++; return 1800 } })
    expect(() => parseSessionPolicy(input)).toThrow()
    expect(reads).toBe(0)
  })

  it("accepts null-prototype data records without retaining input references", () => {
    const input = Object.assign(Object.create(null), DEFAULT_SESSION_POLICY)
    expect(parseSessionPolicy(input)).toEqual(DEFAULT_SESSION_POLICY)
  })

  it("increments only a changed revision and never chooses logout effects", () => {
    const result = proposePolicyRevision(DEFAULT_SESSION_POLICY, { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 1860 }, 7)
    expect(result.version).toBe(8)
    expect(result.changed).toBe(true)
    expect(Object.keys(result).sort()).toEqual(["changed", "policy", "version"])
  })

  it("keeps no-op version including the safe integer boundary", () => {
    expect(proposePolicyRevision(DEFAULT_SESSION_POLICY, { ...DEFAULT_SESSION_POLICY }, 7).version).toBe(7)
    expect(proposePolicyRevision(DEFAULT_SESSION_POLICY, DEFAULT_SESSION_POLICY, Number.MAX_SAFE_INTEGER).changed).toBe(false)
  })

  it("rejects version overflow and malformed counters", () => {
    expect(() => proposePolicyRevision(DEFAULT_SESSION_POLICY, { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 1860 }, Number.MAX_SAFE_INTEGER)).toThrow()
    for (const version of [-1, -0, 0.5, "1", NaN, Infinity]) {
      expect(() => proposePolicyRevision(DEFAULT_SESSION_POLICY, DEFAULT_SESSION_POLICY, version)).toThrow()
    }
  })

  it("allows no-op and monotonic state transitions only", () => {
    const active = { version: 1, generation: 2, status: "active" }
    expect(() => assertSessionStateTransition(active, active)).not.toThrow()
    expect(() => assertSessionStateTransition(active, { version: 2, generation: 3, status: "revoked" })).not.toThrow()
    expect(() => assertSessionStateTransition(active, { ...active, version: 0 })).toThrow()
    expect(() => assertSessionStateTransition(active, { ...active, version: 2, generation: 1 })).toThrow()
    expect(() => assertSessionStateTransition(active, { ...active, generation: 3 })).toThrow()
    expect(() => assertSessionStateTransition(active, { ...active, status: "revoked" })).toThrow()
  })

  it.each(["revoked", "expired"])("makes %s terminal even at a newer version/generation", (status) => {
    const previous = { version: 4, generation: 2, status }
    expect(() => assertSessionStateTransition(previous, { version: 5, generation: 3, status: "active" })).toThrow()
    expect(() => assertSessionStateTransition(previous, { version: 5, generation: 3, status })).not.toThrow()
  })

  it("rejects malformed consistency states without trusting typed callers", () => {
    const active = { version: 1, generation: 0, status: "active" }
    for (const invalid of [null, { ...active, status: "unknown" }, { ...active, generation: "0" }, { ...active, actor: "admin" }]) {
      expect(() => assertSessionStateTransition(active, invalid)).toThrow()
      expect(() => assertSessionStateTransition(invalid, active)).toThrow()
    }
  })
})

describe("pure selective session eligibility", () => {
  const now = 100_000_000
  const facts = () => ({
    created_at_ms: now - 3600_000,
    last_activity_at_ms: now - 1000,
    last_strong_auth_at_ms: now - 1000,
    status: "active",
  })
  const evaluate = (session: unknown = facts(), policy: unknown = DEFAULT_SESSION_POLICY, sensitive: unknown = false, at: unknown = now) =>
    evaluateSessionEligibility(session, policy, at, sensitive)

  it("keeps a valid session active without mutating facts or consulting live time", () => {
    const session = Object.freeze(facts())
    const policy = Object.freeze({ ...DEFAULT_SESSION_POLICY })
    const result = evaluate(session, policy)
    expect(result).toEqual({ outcome: "permitted", permitted: true, session_status: "active" })
    expect(evaluate(session, policy)).toEqual(result)
    expect(Object.isFrozen(result)).toBe(true)
    expect(session).toEqual(facts())
  })

  it("selectively expires 7-hour X but preserves 5-hour Y after 8 -> 6 hours", () => {
    const sevenHours = { ...facts(), created_at_ms: now - 7 * 3600_000 }
    const fiveHours = { ...facts(), created_at_ms: now - 5 * 3600_000 }
    const tightened = { ...DEFAULT_SESSION_POLICY, absolute_lifetime_seconds: 6 * 3600 }
    expect(evaluate(sevenHours).outcome).toBe("permitted")
    expect(evaluate(sevenHours, tightened).outcome).toBe("expired_absolute")
    expect(evaluate(fiveHours, tightened).outcome).toBe("permitted")
    const revision = proposePolicyRevision(DEFAULT_SESSION_POLICY, tightened, 10)
    expect(revision.version).toBe(11)
    expect(evaluate(fiveHours, revision.policy).permitted).toBe(true)
    expect(Object.keys(revision).sort()).toEqual(["changed", "policy", "version"])
  })

  it.each([-1, 0, 1])("applies absolute boundary at threshold plus %p ms", (offset) => {
    const session = { ...facts(), created_at_ms: now - DEFAULT_SESSION_POLICY.absolute_lifetime_seconds * 1000 - offset }
    expect(evaluate(session).outcome).toBe(offset < 0 ? "permitted" : "expired_absolute")
  })

  it.each([-1, 0, 1])("applies idle boundary at threshold plus %p ms", (offset) => {
    const session = { ...facts(), last_activity_at_ms: now - DEFAULT_SESSION_POLICY.idle_timeout_seconds * 1000 - offset }
    expect(evaluate(session).outcome).toBe(offset < 0 ? "permitted" : "expired_idle")
  })

  it.each([-1, 0, 1])("requires step-up at recent-auth boundary plus %p ms only for sensitive work", (offset) => {
    const session = { ...facts(), last_strong_auth_at_ms: now - DEFAULT_SESSION_POLICY.recent_auth_seconds * 1000 - offset }
    const sensitive = evaluate(session, DEFAULT_SESSION_POLICY, true)
    expect(sensitive.outcome).toBe(offset < 0 ? "permitted" : "reauthentication_required")
    expect(sensitive.session_status).toBe("active")
    expect(evaluate(session).outcome).toBe("permitted")
  })

  it("allows ordinary work without completed step-up and requires it for sensitive work", () => {
    const session = { ...facts(), last_strong_auth_at_ms: null }
    expect(evaluate(session)).toEqual({ outcome: "permitted", permitted: true, session_status: "active" })
    expect(evaluate(session, DEFAULT_SESSION_POLICY, true)).toEqual({
      outcome: "reauthentication_required", permitted: false, session_status: "active",
    })
  })

  it("accepts a recent verified step-up and rejects future or pre-session evidence", () => {
    const recent = { ...facts(), last_strong_auth_at_ms: now - 60_000 }
    expect(evaluate(recent, DEFAULT_SESSION_POLICY, true).outcome).toBe("permitted")
    expect(evaluate({ ...recent, last_strong_auth_at_ms: now + 1 }, DEFAULT_SESSION_POLICY, true).outcome).toBe("invalid_input")
    expect(evaluate({ ...recent, last_strong_auth_at_ms: recent.created_at_ms - 1 }, DEFAULT_SESSION_POLICY, true).outcome).toBe("invalid_input")
  })

  it.each(["revoked", "expired"])("denies terminal %s sessions regardless of step-up state", (status) => {
    for (const last_strong_auth_at_ms of [null, now - 1000]) {
      const result = evaluate({ ...facts(), status, last_strong_auth_at_ms }, DEFAULT_SESSION_POLICY, false)
      expect(result.outcome).toBe(status === "revoked" ? "already_revoked" : "already_expired")
      expect(result.permitted).toBe(false)
    }
  })

  it("rejects missing, undefined and forged step-up values instead of treating them as null", () => {
    const { last_strong_auth_at_ms: _omitted, ...missing } = facts()
    expect(evaluate(missing).outcome).toBe("invalid_input")
    for (const value of [undefined, "verified", false, Number.NaN, 0]) {
      expect(evaluate({ ...facts(), last_strong_auth_at_ms: value }).outcome).toBe("invalid_input")
    }
  })

  it("expires idle and absolute sessions even when no step-up has occurred", () => {
    const session = { ...facts(), last_strong_auth_at_ms: null }
    expect(evaluate({ ...session, created_at_ms: now - DEFAULT_SESSION_POLICY.absolute_lifetime_seconds * 1000 }).outcome).toBe("expired_absolute")
    expect(evaluate({ ...session, last_activity_at_ms: now - DEFAULT_SESSION_POLICY.idle_timeout_seconds * 1000 }).outcome).toBe("expired_idle")
  })

  it("uses the original creation time across policy changes, and absolute expiry wins", () => {
    const session = { ...facts(), created_at_ms: now - 9 * 3600_000, last_activity_at_ms: now - 3600_000 }
    expect(evaluate(session).outcome).toBe("expired_absolute")
    expect(session.created_at_ms).toBe(now - 9 * 3600_000)
  })

  it("applies tighter idle policy selectively", () => {
    const oldActivity = { ...facts(), last_activity_at_ms: now - 10 * 60_000 }
    expect(evaluate(oldActivity).permitted).toBe(true)
    expect(evaluate(oldActivity, { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 300 }).outcome).toBe("expired_idle")
    expect(evaluate(facts(), { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 300 }).permitted).toBe(true)
  })

  it("does not reset strong authentication age when the policy changes", () => {
    const session = { ...facts(), last_strong_auth_at_ms: now - 120_000 }
    expect(evaluate(session, DEFAULT_SESSION_POLICY, true).permitted).toBe(true)
    expect(evaluate(session, { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 60 }, true).outcome).toBe("reauthentication_required")
    expect(evaluate(session, { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 60 }, false).permitted).toBe(true)
  })

  it.each(["revoked", "expired"])("never revives terminal %s after relaxation", (status) => {
    const relaxed = { idle_timeout_seconds: 3600, absolute_lifetime_seconds: 43200, recent_auth_seconds: 600 }
    const result = evaluate({ ...facts(), status }, relaxed, true)
    expect(result).toEqual({ outcome: status === "revoked" ? "already_revoked" : "already_expired", permitted: false, session_status: status })
  })

  it("requires caller-persisted terminal expiry to prevent revival under relaxation", () => {
    const session = { ...facts(), created_at_ms: now - 7 * 3600_000 }
    const expired = evaluate(session, { ...DEFAULT_SESSION_POLICY, absolute_lifetime_seconds: 21600 })
    expect(expired.session_status).toBe("expired")
    const persisted = { ...session, status: expired.session_status }
    expect(evaluate(persisted).outcome).toBe("already_expired")
    // Stateless input still claiming active cannot reveal a historical expiry.
    // This explicitly exposes the runtime persistence/history dependency.
    expect(evaluate(session).permitted).toBe(true)
  })

  it("allows relaxed recent-auth for a still-active session without reviving terminal state", () => {
    const session = { ...facts(), last_strong_auth_at_ms: now - 400_000 }
    expect(evaluate(session, DEFAULT_SESSION_POLICY, true).outcome).toBe("reauthentication_required")
    expect(evaluate(session, { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 600 }, true).permitted).toBe(true)
  })

  it.each([NaN, Infinity, -Infinity, -1, -0, 1.5, Number.MAX_SAFE_INTEGER + 1, "100000000", null, new Date()])("rejects invalid timestamp %p", (value) => {
    expect(evaluate(facts(), DEFAULT_SESSION_POLICY, false, value).outcome).toBe("invalid_input")
    for (const field of ["created_at_ms", "last_activity_at_ms"]) {
      expect(evaluate({ ...facts(), [field]: value }).outcome).toBe("invalid_input")
    }
    if (value !== null) expect(evaluate({ ...facts(), last_strong_auth_at_ms: value }).outcome).toBe("invalid_input")
  })

  it("rejects future timestamps and activity/auth before original creation", () => {
    for (const field of ["created_at_ms", "last_activity_at_ms"]) {
      expect(evaluate({ ...facts(), [field]: now + 1 }).outcome).toBe("invalid_input")
    }
    expect(evaluate({ ...facts(), last_strong_auth_at_ms: now + 1 }).outcome).toBe("invalid_input")
    for (const field of ["last_activity_at_ms"]) {
      expect(evaluate({ ...facts(), [field]: facts().created_at_ms - 1 }).permitted).toBe(false)
    }
    expect(evaluate({ ...facts(), last_strong_auth_at_ms: facts().created_at_ms - 1 }).outcome).toBe("invalid_input")
  })

  it("rejects malformed facts, policy and sensitive flag without exposing input", () => {
    for (const invalid of [null, [], {}, { ...facts(), status: "unknown" }, { ...facts(), actor: "forged" }]) {
      expect(evaluate(invalid)).toEqual({ outcome: "invalid_input", permitted: false, session_status: "invalid" })
    }
    expect(evaluate(facts(), { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 0 }).outcome).toBe("invalid_input")
    for (const invalid of [undefined, null, 0, "false"]) {
      expect(evaluateSessionEligibility(facts(), DEFAULT_SESSION_POLICY, now, invalid).outcome).toBe("invalid_input")
    }
  })

  it("rejects accessors without reading them and has no unsafe serialized output", () => {
    let reads = 0
    const session = Object.defineProperty(facts(), "created_at_ms", { get() { reads++; throw Error("secret") } })
    const result = evaluate(session)
    expect(reads).toBe(0)
    expect(JSON.parse(JSON.stringify(result))).toEqual({ outcome: "invalid_input", permitted: false, session_status: "invalid" })
  })
})
