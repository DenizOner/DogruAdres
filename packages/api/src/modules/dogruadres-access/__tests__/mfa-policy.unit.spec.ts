import {
  DEFAULT_MFA_PREFERENCES,
  InvalidMfaPolicyState,
  resolveMfaPolicy,
} from "../mfa-policy"

describe("M0 MFA platform and user preference precedence (#230)", () => {
  it("defaults to platform ON and personal OFF without changing native factor state", () => {
    expect(DEFAULT_MFA_PREFERENCES).toEqual({ platform_required: true, user_enabled: false })
    expect(Object.isFrozen(DEFAULT_MFA_PREFERENCES)).toBe(true)
    expect(resolveMfaPolicy(undefined, undefined, false)).toEqual({
      platform_required: true,
      user_enabled: false,
      native_factor_enabled: false,
      required: true,
      next_step: "enroll_mfa",
      enforced_by: ["platform"],
    })
  })

  it.each([
    { platform: true, user: false, required: true, step: "enroll_mfa", enforced: ["platform"] },
    { platform: true, user: true, required: true, step: "enroll_mfa", enforced: ["platform", "user"] },
    { platform: false, user: true, required: true, step: "enroll_mfa", enforced: ["user"] },
    { platform: false, user: false, required: false, step: "allow_primary", enforced: [] },
  ] as const)("honors the four product preference cases: %p", ({platform, user, required, step, enforced}) => {
    const decision = resolveMfaPolicy(platform, user, false)
    expect(decision.required).toBe(required)
    expect(decision.next_step).toBe(step)
    expect(decision.enforced_by).toEqual(enforced)
  })

  it.each([
    { platform: true, user: false },
    { platform: true, user: true },
    { platform: false, user: true },
    { platform: false, user: false },
  ])("cannot bypass a currently enabled native factor by disabling preferences: %p", ({platform,user}) => {
    const result = resolveMfaPolicy(platform, user, true)
    expect(result.required).toBe(true)
    expect(result.next_step).toBe("verify_mfa")
    expect(result.enforced_by).toContain("native_factor")
    expect(result.native_factor_enabled).toBe(true)
  })

  it("never allows user opt-out to defeat platform enforcement", () => {
    expect(resolveMfaPolicy(true, false, false).next_step).toBe("enroll_mfa")
    expect(resolveMfaPolicy(true, false, true).next_step).toBe("verify_mfa")
  })

  it.each([
    ["false", false, false],
    [0, false, false],
    [null, false, false],
    [false, "true", false],
    [false, {}, false],
    [false, null, false],
    [false, false, undefined],
    [false, false, null],
    [false, false, "false"],
    [false, false, 0],
  ])("fails closed instead of coercing corrupt or untrusted settings: %p", (platform,user,native) => {
    expect(() => resolveMfaPolicy(platform,user,native)).toThrow(InvalidMfaPolicyState)
  })

  it("returns immutable evaluation results; no mutation is permitted", () => {
    const result = resolveMfaPolicy(false,true,true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.enforced_by)).toBe(true)
  })
})
