import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { MfaConcurrentUpdateError, MfaOutboxFailure } from "../../../modules/dogruadres-access/mfa-persistence"

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
  const value = await access(req).personalMfaSettings(sessionToken(req))
  return value ? res.json(value) : res.status(403).json({message:"Access denied"})
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
