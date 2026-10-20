import { DEFAULT_SESSION_POLICY } from "../../../modules/dogruadres-access/session-policy"
import { parseSessionPolicyRequest, parseSessionPolicyResponse, toSessionPolicyResponse } from "../session-policy-contract"

const request = () => ({ expected_version: 0, policy: { ...DEFAULT_SESSION_POLICY } })

describe("unregistered session policy DTO contract", () => {
  it("parses a strict immutable request and round-trips JSON", () => {
    const parsed = parseSessionPolicyRequest(JSON.parse(JSON.stringify(request())))
    expect(parsed).toEqual(request())
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.policy)).toBe(true)
  })

  it.each(["actor_id", "person_id", "role", "manager", "transactionManager", "generation", "permissions", "__proto__"])("rejects injected %s at both input levels", (key) => {
    expect(() => parseSessionPolicyRequest({ ...request(), [key]: "forged" })).toThrow()
    expect(() => parseSessionPolicyRequest({ ...request(), policy: { ...DEFAULT_SESSION_POLICY, [key]: "forged" } })).toThrow()
  })

  it.each([null, [], true, "request", {}, { policy: DEFAULT_SESSION_POLICY }, { ...request(), expected_version: "0" }].map((input) => [input]))("rejects malformed request %p", (input) => {
    expect(() => parseSessionPolicyRequest(input)).toThrow()
  })

  it("reuses domain numeric and ordering validation", () => {
    for (const value of [0, -1, 0.5, NaN, Infinity, true, "300"]) {
      expect(() => parseSessionPolicyRequest({ ...request(), policy: { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: value } })).toThrow()
    }
    expect(() => parseSessionPolicyRequest({ ...request(), policy: { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 1801 } })).toThrow()
  })

  it("rejects accessors, inherited claims, hidden keys and symbols", () => {
    let reads = 0
    const input = Object.defineProperty(request(), "expected_version", { get() { reads++; return 0 } })
    expect(() => parseSessionPolicyRequest(input)).toThrow()
    expect(reads).toBe(0)
    expect(() => parseSessionPolicyRequest(Object.create(request()))).toThrow()
    expect(() => parseSessionPolicyRequest(Object.defineProperty(request(), "secret", { value: "hidden" }))).toThrow()
    expect(() => parseSessionPolicyRequest({ ...request(), [Symbol("secret")]: true })).toThrow()
  })

  it("allowlists output without serializing secrets, managers or source toJSON", () => {
    const source = { version: 4, policy: { ...DEFAULT_SESSION_POLICY }, token: "private", actor: "private", manager: {}, toJSON() { throw Error("must not run") } }
    const output = toSessionPolicyResponse(source)
    expect(Object.keys(output).sort()).toEqual(["policy", "version"])
    expect(JSON.parse(JSON.stringify(output))).toEqual({ version: 4, policy: DEFAULT_SESSION_POLICY })
    source.policy.idle_timeout_seconds = 1860
    expect(output.policy.idle_timeout_seconds).toBe(1800)
    expect(Object.isFrozen(output)).toBe(true)
  })

  it("never evaluates irrelevant secret getters or public field accessors", () => {
    const source = { version: 1, policy: DEFAULT_SESSION_POLICY }
    Object.defineProperty(source, "token", { get() { throw Error("secret getter") } })
    expect(() => toSessionPolicyResponse(source)).not.toThrow()
    Object.defineProperty(source, "version", { get() { throw Error("public getter") } })
    expect(() => toSessionPolicyResponse(source)).toThrow("Invalid session policy contract")
  })

  it("rejects malformed output and nested hidden data instead of leaking it", () => {
    for (const input of [null, {}, { version: -1, policy: DEFAULT_SESSION_POLICY }, { version: 1, policy: { ...DEFAULT_SESSION_POLICY, token: "secret" } }]) {
      expect(() => toSessionPolicyResponse(input)).toThrow()
    }
  })

  it("strictly parses the serialized response contract", () => {
    const output = toSessionPolicyResponse({ version: 2, policy: DEFAULT_SESSION_POLICY })
    expect(parseSessionPolicyResponse(JSON.parse(JSON.stringify(output)))).toEqual(output)
    expect(() => parseSessionPolicyResponse({ ...output, actor_id: "forged" })).toThrow()
    expect(() => parseSessionPolicyResponse({ ...output, version: Infinity })).toThrow()
  })

  it("inherits inclusive D3 limits without a second DTO validation authority", () => {
    for (const policy of [
      { idle_timeout_seconds: 300, absolute_lifetime_seconds: 3600, recent_auth_seconds: 60 },
      { idle_timeout_seconds: 3600, absolute_lifetime_seconds: 43200, recent_auth_seconds: 600 },
    ]) {
      expect(parseSessionPolicyRequest({ expected_version: 9, policy }).policy).toEqual(policy)
      const response = toSessionPolicyResponse({ version: 10, policy })
      expect(parseSessionPolicyResponse(JSON.parse(JSON.stringify(response))).policy).toEqual(policy)
    }
  })

  it("rejects range, granularity, ordering and unlimited bypasses in both DTO directions", () => {
    for (const policy of [
      { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 240 },
      { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 3660 },
      { ...DEFAULT_SESSION_POLICY, absolute_lifetime_seconds: 3540 },
      { ...DEFAULT_SESSION_POLICY, absolute_lifetime_seconds: 43260 },
      { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 0 },
      { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 660 },
      { ...DEFAULT_SESSION_POLICY, recent_auth_seconds: 61 },
      { ...DEFAULT_SESSION_POLICY, idle_timeout_seconds: 300, recent_auth_seconds: 600 },
      { ...DEFAULT_SESSION_POLICY, absolute_lifetime_seconds: "unlimited" },
    ]) {
      expect(() => parseSessionPolicyRequest({ expected_version: 1, policy })).toThrow()
      expect(() => parseSessionPolicyResponse({ version: 1, policy })).toThrow()
      expect(() => toSessionPolicyResponse({ version: 1, policy })).toThrow()
    }
  })
})
