/**
 * #230: MFA preference/requirement precedence, without persistence or runtime effects.
 *
 * A platform requirement overrides a personal opt-out; a native Medusa factor
 * already enabled for the exact authenticated AuthIdentity cannot be bypassed
 * by changing DoğruAdres preferences. Native MFA enrollment, challenge,
 * disabling, recovery, current sessions, audit/outbox and migrations must be
 * implemented and independently accepted before this is connected to login.
 *
 * This is intentionally not an authorization grant and does not change the
 * existing sensitive-action recent-strong-auth requirement.
 */
export const DEFAULT_MFA_PREFERENCES = Object.freeze({
  platform_required: true,
  user_enabled: false,
})

export type MfaPolicyDecision = Readonly<{
  platform_required: boolean
  user_enabled: boolean
  native_factor_enabled: boolean
  required: boolean
  next_step: "allow_primary" | "enroll_mfa" | "verify_mfa"
  enforced_by: readonly ("platform" | "user" | "native_factor")[]
}>

export class InvalidMfaPolicyState extends Error {
  constructor() {
    super("Invalid MFA policy state")
    this.name = "InvalidMfaPolicyState"
  }
}

/**
 * Undefined means an absent settings row (use the product default).
 * Never coerce untrusted values such as "false", 0, null or an object.
 * A real native factor state MUST be supplied from Medusa server state.
 */
export function resolveMfaPolicy(
  platformRequired: unknown,
  userEnabled: unknown,
  nativeFactorEnabled: unknown
): MfaPolicyDecision {
  const platform = platformRequired === undefined
    ? DEFAULT_MFA_PREFERENCES.platform_required : platformRequired
  const user = userEnabled === undefined
    ? DEFAULT_MFA_PREFERENCES.user_enabled : userEnabled
  if (typeof platform !== "boolean" || typeof user !== "boolean" ||
      typeof nativeFactorEnabled !== "boolean") throw new InvalidMfaPolicyState()

  const enforcedBy: ("platform" | "user" | "native_factor")[] = []
  if (platform) enforcedBy.push("platform")
  if (user) enforcedBy.push("user")
  if (nativeFactorEnabled) enforcedBy.push("native_factor")
  const required = enforcedBy.length > 0

  return Object.freeze({
    platform_required: platform,
    user_enabled: user,
    native_factor_enabled: nativeFactorEnabled,
    required,
    next_step: nativeFactorEnabled ? "verify_mfa" : required ? "enroll_mfa" : "allow_primary",
    enforced_by: Object.freeze(enforcedBy),
  })
}
