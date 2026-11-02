import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { MfaConcurrentUpdateError, MfaOutboxFailure } from "../../../modules/dogruadres-access/mfa-persistence"
import { resolveMfaPolicy } from "../../../modules/dogruadres-access/mfa-policy"
import { readNativeMfaSummary } from "../../../modules/dogruadres-access/native-mfa-summary"
import { mfaRuntimeEnforced } from "../../../modules/dogruadres-access/identity-session"

// Explicit rollout gate. No runtime read/write before the canonical migration,
// current-actor authorization and native MFA enrollment/disable reconciliation
// have been independently accepted. NOT enabled by default.
export const mfaSettingsEnabled = () =>
  enabled() && process.env.DOGRUADRES_MFA_SETTINGS_ENABLED === "true"
export const AUTHENTICATE = false

const expectedVersion = z.number().int().min(0).max(2147483646)
const form = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("personal"),
    user_enabled: z.boolean(),
    expected_version: expectedVersion,
  }).strict(),
  z.object({
    action: z.literal("platform"),
    platform_mode: z.enum(["required", "optional", "disabled"]),
    expected_version: expectedVersion,
  }).strict(),
])

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!mfaSettingsEnabled()) return res.status(503).json({ message: "MFA settings unavailable" })
  if (Object.keys(req.query || {}).length) return res.status(400).json({message:"Invalid input"})
  const service = access(req)
  const token = sessionToken(req)
  // Factor listing is tied ONLY to the exact AuthIdentity from the live
  // server-side browser session, never an ID supplied by the caller.
  let session
  try { session = await service.personalSession(token) }
  catch { return res.status(503).json({message:"Service unavailable"}) }
  if (!session) return res.status(403).json({message:"Access denied"})
  let value
  try { value = await service.personalMfaSettings(token) }
  catch { return res.status(503).json({message:"Service unavailable"}) }
  if (!value || value.personal.person_id !== session.person_id)
    return res.status(403).json({message:"Access denied"})
  try {
    const auth: IAuthModuleService = req.scope.resolve("auth")
    const native = await readNativeMfaSummary(auth, session.auth_identity_id)
    const decision = resolveMfaPolicy(
      value.platform.platform_mode, value.personal.user_enabled, native.enabled
    )
    // This is a READ-ONLY target policy decision, not proof that runtime
    // enrollment/enforcement has been enabled. No factor IDs or metadata.
    return res.json({
      ...value,
      native_factor_state: native.state,
      effective_mfa_target: {
        required: decision.required,
        next_step: decision.next_step,
        user_control_allowed: decision.user_control_allowed,
      },
      // personalSession has already checked the DB activation latch against
      // all rollout flags; a mismatched/invalid latch denies this read.
      runtime_enforcement: mfaRuntimeEnforced() ? "enforced" : "not_yet_enabled",
    })
  } catch {
    // A missing, malformed, cross-identity or truncated native factor result
    // must never be rendered as MFA off.
    return res.status(503).json({message:"Native MFA state unavailable"})
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!mfaSettingsEnabled()) return res.status(503).json({ message: "MFA settings unavailable" })
  let csrfValid = false
  try { csrfValid = await csrf(req) } catch {}
  if (!csrfValid) return res.status(403).json({message:"Access denied"})
  const input = form.safeParse(req.body)
  if (!input.success) return res.status(400).json({message:"Invalid input"})

  const token = sessionToken(req)
  const service = access(req)
  // Factor lifecycle still requires native enrollment/recovery and session
  // invalidation. Never write a preference that falsely claims a native
  // factor was enrolled or safely disabled.
  let session
  try { session = await service.personalSession(token) }
  catch { return res.status(503).json({message:"Service unavailable"}) }
  if (!session) return res.status(403).json({message:"Access denied"})
  let native
  try {
    const auth: IAuthModuleService = req.scope.resolve("auth")
    native = await readNativeMfaSummary(auth,session.auth_identity_id)
  } catch {
    return res.status(503).json({message:"Native MFA state unavailable"})
  }
  if (input.data.action === "personal" && input.data.user_enabled !== native.enabled)
    return res.status(409).json({message:"Complete native MFA enrollment or verified factor removal before changing preference"})
  try {
    if (input.data.action === "personal") {
      const saved = await service.personalSetMfaPreference(token,input.data.user_enabled,input.data.expected_version)
      return saved ? res.json({personal:saved,native_factor_state:"unverified"}) :
        res.status(403).json({message:"Not permitted or strong authentication required"})
    }
    const saved = await service.personalSetPlatformMfaMode(token,input.data.platform_mode,input.data.expected_version)
    return saved ? res.json({platform:saved,native_factor_transition:"pending_reconciliation"}) :
      res.status(403).json({message:"Platform MFA management permission and strong authentication required"})
  } catch (err) {
    if (err instanceof MfaConcurrentUpdateError)
      return res.status(409).json({message:"Settings changed; refresh before retry"})
    // An outbox failure poisons the owning module transaction; never return
    // a success or attempt an independent compensating write.
    if (err instanceof MfaOutboxFailure) throw err
    throw err
  }
}
