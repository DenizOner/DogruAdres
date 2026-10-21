/**
 * Canonical three-mode MFA policy (#230). Pure computation only: this module
 * does not enable, disable or bypass native Medusa MFA, persist a setting,
 * mutate an identity, or grant authorization.
 *
 * "disabled" prevents personal opt-in and must eventually turn off platform
 * MFA. An already enrolled native factor is NOT silently suppressed: keep
 * the native authentication boundary until a separately verified, audited
 * factor-disable/recovery transition has safely completed.
 */
export const MFA_PLATFORM_MODES = Object.freeze(["required", "optional", "disabled"] as const)
export type MfaPlatformMode = (typeof MFA_PLATFORM_MODES)[number]

export const DEFAULT_MFA_PREFERENCES = Object.freeze({
  platform_mode: "required" as MfaPlatformMode,
  user_enabled: false,
})

export type MfaPolicyDecision = Readonly<{
  platform_mode: MfaPlatformMode
  user_enabled: boolean
  native_factor_enabled: boolean
  required: boolean
  user_control_allowed: boolean
  /** Reconciliation prevents false claims of "disabled" before native factors are securely retired. */
  next_step: "allow_primary" | "enroll_mfa" | "verify_mfa" | "reconcile_native_factor"
  enforced_by: readonly ("platform" | "user" | "native_factor")[]
}>

export class InvalidMfaPolicyState extends Error {
  constructor() {
    super("Invalid MFA policy state")
    this.name = "InvalidMfaPolicyState"
  }
}

/**
 * An absent policy/preference row is represented ONLY by undefined.
 * Invalid DB values (including null, number and string booleans), and
 * unavailable native factor state fail closed. Caller MUST obtain the native
 * factor value from the verified, exact AuthIdentity on the Medusa server.
 */
export function resolveMfaPolicy(
  platformMode: unknown,
  userEnabled: unknown,
  nativeFactorEnabled: unknown
): MfaPolicyDecision {
  const mode = platformMode === undefined
    ? DEFAULT_MFA_PREFERENCES.platform_mode : platformMode
  const user = userEnabled === undefined
    ? DEFAULT_MFA_PREFERENCES.user_enabled : userEnabled
  if (!MFA_PLATFORM_MODES.some(candidate => candidate === mode) ||
      typeof user !== "boolean" || typeof nativeFactorEnabled !== "boolean") {
    throw new InvalidMfaPolicyState()
  }
  const platform_mode = mode as MfaPlatformMode
  const native_factor_enabled = nativeFactorEnabled as boolean
  const enforcedBy: ("platform" | "user" | "native_factor")[] = []
  if (platform_mode === "required") enforcedBy.push("platform")
  if (platform_mode === "optional" && user) enforcedBy.push("user")
  if (native_factor_enabled) enforcedBy.push("native_factor")
  const required = enforcedBy.length > 0

  let next_step: MfaPolicyDecision["next_step"]
  if (platform_mode === "disabled" && native_factor_enabled) {
    next_step = "reconcile_native_factor"
  } else if (native_factor_enabled) {
    next_step = "verify_mfa"
  } else {
    next_step = required ? "enroll_mfa" : "allow_primary"
  }

  return Object.freeze({
    platform_mode,
    user_enabled: user,
    native_factor_enabled,
    required,
    user_control_allowed: platform_mode === "optional",
    next_step,
    enforced_by: Object.freeze(enforcedBy),
  })
}
