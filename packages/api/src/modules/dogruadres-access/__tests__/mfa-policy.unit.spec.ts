import {
  DEFAULT_MFA_PREFERENCES,
  MFA_PLATFORM_MODES,
  InvalidMfaPolicyState,
  resolveMfaPolicy,
} from "../mfa-policy"

describe("M0 MFA three-mode platform and personal policy (#230)", () => {
  it("defaults to required for everyone, personal opt-in off, without changing native state", () => {
    expect(DEFAULT_MFA_PREFERENCES).toEqual({ platform_mode: "required", user_enabled: false })
    expect(MFA_PLATFORM_MODES).toEqual(["required", "optional", "disabled"])
    expect(Object.isFrozen(DEFAULT_MFA_PREFERENCES)).toBe(true)
    expect(resolveMfaPolicy(undefined, undefined, false)).toEqual({
      platform_mode: "required",
      user_enabled: false,
      native_factor_enabled: false,
      required: true,
      user_control_allowed: false,
      next_step: "enroll_mfa",
      enforced_by: ["platform"],
    })
  })

  // The full platform (3) × personal choice (2) × real native-factor state (2)
  // matrix. The native challenge is not bypassed by a preference write.
  const matrix = [
    { mode: "required", user: false, native: false, required: true, control: false, step: "enroll_mfa", by: ["platform"] },
    { mode: "required", user: true, native: false, required: true, control: false, step: "enroll_mfa", by: ["platform"] },
    { mode: "required", user: false, native: true, required: true, control: false, step: "verify_mfa", by: ["platform", "native_factor"] },
    { mode: "required", user: true, native: true, required: true, control: false, step: "verify_mfa", by: ["platform", "native_factor"] },
    { mode: "optional", user: false, native: false, required: false, control: true, step: "allow_primary", by: [] },
    { mode: "optional", user: true, native: false, required: true, control: true, step: "enroll_mfa", by: ["user"] },
    { mode: "optional", user: false, native: true, required: true, control: true, step: "verify_mfa", by: ["native_factor"] },
    { mode: "optional", user: true, native: true, required: true, control: true, step: "verify_mfa", by: ["user", "native_factor"] },
    { mode: "disabled", user: false, native: false, required: false, control: false, step: "allow_primary", by: [] },
    { mode: "disabled", user: true, native: false, required: false, control: false, step: "allow_primary", by: [] },
    { mode: "disabled", user: false, native: true, required: true, control: false, step: "reconcile_native_factor", by: ["native_factor"] },
    { mode: "disabled", user: true, native: true, required: true, control: false, step: "reconcile_native_factor", by: ["native_factor"] },
  ] as const

  it.each(matrix)("enforces $mode user=$user native=$native without implicit bypass", ({mode,user,native,required,control,step,by}) => {
    const decision = resolveMfaPolicy(mode,user,native)
    expect(decision).toEqual({
      platform_mode: mode,
      user_enabled: user,
      native_factor_enabled: native,
      required,
      user_control_allowed: control,
      next_step: step,
      enforced_by: [...by],
    })
  })

  it("does not let users disable mandatory MFA or enable platform-disabled MFA", () => {
    expect(resolveMfaPolicy("required",false,false).next_step).toBe("enroll_mfa")
    expect(resolveMfaPolicy("required",false,false).user_control_allowed).toBe(false)
    expect(resolveMfaPolicy("disabled",true,false).required).toBe(false)
    expect(resolveMfaPolicy("disabled",true,false).user_control_allowed).toBe(false)
  })

  it("requires secure native factor reconciliation before a disabled platform stops a live challenge", () => {
    const pending = resolveMfaPolicy("disabled",false,true)
    expect(pending.required).toBe(true)
    expect(pending.next_step).toBe("reconcile_native_factor")
    // Safely retiring a factor is a separate Medusa operation; only then can
    // the platform be considered disabled with no effective MFA.
    expect(resolveMfaPolicy("disabled",false,false).next_step).toBe("allow_primary")
  })

  it.each([
    ["true",false,false], [true,false,false], [false,false,false],
    [null,false,false], [0,false,false], [{},false,false],
    ["REQUIRED",false,false], ["unknown",false,false],
    ["required","false",false], ["optional",1,false], ["disabled",null,false],
    ["required",false,undefined], ["optional",false,null],
    ["disabled",true,"false"], ["required",false,0],
  ])("rejects invalid or corrupt setting / unknown native factor: %p", (mode,user,native) => {
    expect(() => resolveMfaPolicy(mode,user,native)).toThrow(InvalidMfaPolicyState)
  })

  it("returns an immutable, authorization-neutral policy decision", () => {
    const result = resolveMfaPolicy("optional",true,true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.enforced_by)).toBe(true)
  })
})
