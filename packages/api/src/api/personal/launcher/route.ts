import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { access, csrf, sessionToken } from "../security"
import DogruAdresAccessModuleService from "../../../modules/dogruadres-access/service"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE = false

/**
 * GET /personal/launcher
 * Returns the caller's launcher preference (ordered app IDs + collapsed IDs)
 * plus the server-side list of app IDs this Person is actually entitled to see.
 * No preference data from other Persons is ever returned.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = access(req)
  const token = sessionToken(req)
  let pref: Awaited<ReturnType<typeof svc.getLauncherPreference>>
  try {
    pref = await svc.getLauncherPreference(token)
  } catch (err) {
    if (err instanceof IdentityAccessDenied) return res.status(401).json({ message: "Session required" })
    return res.status(503).json({ message: "Service unavailable" })
  }
  if (!pref) return res.status(401).json({ message: "Session required" })

  // Determine which apps this Person can actually reach right now.
  // Storefront: always present — public catalog with no personal entitlement.
  // Vendor: only if the Person has an active non-revoked member actor binding
  //   AND the native Seller module confirms: active SellerMember + active Member
  //   + open Seller account. Same triple-check used by /personal/contexts.
  //   Never auto-create entitlements.
  const availableIds: string[] = ["storefront"]
  try {
    const binding = await svc.personalActorBinding(token, "member")
    if (binding && !binding.revoked_at) {
      // Verify live Seller membership — mirrors contexts/route.ts lines 17-19.
      const sellers = req.scope.resolve<{
        listSellerMembers(f: object): Promise<any[]>
        listMembers(f: object): Promise<any[]>
        listSellers(f: object): Promise<any[]>
      }>("seller")
      const [memberships, members] = await Promise.all([
        sellers.listSellerMembers({ member_id: binding.actor_id }),
        sellers.listMembers({ id: binding.actor_id, is_active: true }),
      ])
      if (memberships.length > 0 && members.length > 0) {
        const sellerIds = (memberships as any[]).map(m => m.seller_id).filter(Boolean)
        const accounts = sellerIds.length ? await sellers.listSellers({ id: sellerIds }) : []
        if ((accounts as any[]).some((a: any) => a.status === "open")) availableIds.push("vendor")
      }
    }
  } catch { /* live check failed — omit vendor rather than error */ }

  // Normalise stored order against actually-available apps.
  const known = DogruAdresAccessModuleService.KNOWN_APP_IDS
  const available = new Set(availableIds)
  // Keep only known + available IDs in preferred order, append any missing ones.
  const orderedKnown = pref.app_ids.filter(id => known.has(id) && available.has(id))
  for (const id of availableIds) if (!orderedKnown.includes(id)) orderedKnown.push(id)
  const collapsed = pref.collapsed_ids.filter(id => known.has(id) && available.has(id))

  res.setHeader("Cache-Control", "no-store")
  return res.json({
    app_ids: orderedKnown,
    collapsed_ids: collapsed,
    available_ids: availableIds,
    version: pref.version,
  })
}

/**
 * POST /personal/launcher
 * Save launcher preference for the authenticated Person.
 * Body: { app_ids: string[], collapsed_ids: string[], version: number }
 * Returns the normalised stored result with the new version.
 * Requires CSRF token + same-origin.
 * Forged/unknown app IDs are silently dropped; no entitlement is produced.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  if (!await csrf(req)) return res.status(403).json({ message: "CSRF check failed" })
  const body = req.body as Record<string, unknown>
  if (!body || !Array.isArray(body.app_ids) || !Array.isArray(body.collapsed_ids)) {
    return res.status(400).json({ message: "app_ids and collapsed_ids arrays required" })
  }
  const expectedVersion = typeof body.version === "number" ? body.version : 0
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return res.status(400).json({ message: "version must be a non-negative integer" })
  }
  const svc = access(req)
  const token = sessionToken(req)
  // Express 4 does not automatically propagate async errors to the global
  // error handler. Catch MedusaError types explicitly and map them to the
  // correct HTTP status codes directly, matching the rest of the personal API.
  let result: { app_ids: string[]; collapsed_ids: string[]; version: number }
  try {
    result = await svc.saveLauncherPreference(
      token,
      body.app_ids as string[],
      body.collapsed_ids as string[],
      expectedVersion
    )
  } catch (err) {
    if (err instanceof IdentityAccessDenied || (err instanceof MedusaError && err.type === MedusaError.Types.UNAUTHORIZED)) {
      return res.status(401).json({ message: "Session required" })
    }
    if (err instanceof MedusaError) {
      if (err.type === MedusaError.Types.CONFLICT) {
        return res.status(409).json({ message: err.message })
      }
      if (err.type === MedusaError.Types.INVALID_DATA) {
        return res.status(400).json({ message: err.message })
      }
    }
    return res.status(503).json({ message: "Service unavailable" })
  }
  res.setHeader("Cache-Control", "no-store")
  return res.json(result)
}
