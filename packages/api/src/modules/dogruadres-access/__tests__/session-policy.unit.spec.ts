import {
  assertSessionStateTransition,
  DEFAULT_SESSION_POLICY,
  parseSessionPolicy,
  proposePolicyRevision,
  SessionPolicyContractError,
} from "../session-policy"

describe("inactive session policy domain contract", () => {
  it("preserves approved defaults and returns an independent frozen value", () => {
    const input = { ...DEFAULT_SESSION_POLICY }
    const result = parseSessionPolicy(input)
    expect(result).toEqual({ idle_timeout_seconds: 1800, absolute_lifetime_seconds: 28800, recent_auth_seconds: 300 })
    input.idle_timeout_seconds = 1900
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

  it("does not invent product minimum or maximum durations", () => {
    expect(parseSessionPolicy({ idle_timeout_seconds: 1, absolute_lifetime_seconds: 1, recent_auth_seconds: 1 }).idle_timeout_seconds).toBe(1)
    const maximum = Number.MAX_SAFE_INTEGER
    expect(parseSessionPolicy({ idle_timeout_seconds: maximum, absolute_lifetime_seconds: maximum, recent_auth_seconds: maximum }).absolute_lifetime_seconds).toBe(maximum)
  })

  it("requires recent-auth <= idle <= absolute", () => {
    expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 1801 })).toThrow()
    expect(() => parseSessionPolicy({ ...DEFAULT_SESSION_POLICY, absolute_lifetime_seconds: 1799 })).toThrow()
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
    const result = proposePolicyRevision(DEFAULT_SESSION_POLICY, { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 1900 }, 7)
    expect(result.version).toBe(8)
    expect(result.changed).toBe(true)
    expect(Object.keys(result).sort()).toEqual(["changed", "policy", "version"])
  })

  it("keeps no-op version including the safe integer boundary", () => {
    expect(proposePolicyRevision(DEFAULT_SESSION_POLICY, { ...DEFAULT_SESSION_POLICY }, 7).version).toBe(7)
    expect(proposePolicyRevision(DEFAULT_SESSION_POLICY, DEFAULT_SESSION_POLICY, Number.MAX_SAFE_INTEGER).changed).toBe(false)
  })

  it("rejects version overflow and malformed counters", () => {
    expect(() => proposePolicyRevision(DEFAULT_SESSION_POLICY, { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 1900 }, Number.MAX_SAFE_INTEGER)).toThrow()
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
