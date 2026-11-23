import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, enabled, sessionToken } from "../../personal/security"
import { DOGRUADRES_VEHICLE_MODULE } from "../../../modules/dogruadres-vehicle"
import type VehicleModuleService from "../../../modules/dogruadres-vehicle/service"

export const AUTHENTICATE = false

const orgIdSchema = z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })

  const token = sessionToken(req)
  const orgParam = req.query.organization
  if (typeof orgParam !== "string" || !orgIdSchema.safeParse(orgParam).success) {
    return res.status(400).json({ message: "Invalid organization ID" })
  }

  const svc = access(req)
  const orgDecision = await svc.personalOrganizations(token, orgParam)
  if (!orgDecision || !orgDecision.organizations || orgDecision.organizations.length === 0) {
    return res.status(403).json({ message: "Access denied" })
  }
  const activeOrg = orgDecision.organizations[0]
  // Active-status enforcement: personalOrganizations() SQL (identity-session.ts:244,247) enforces
  //   o.status='active' AND m.status='active' as immutable WHERE conditions.
  // Inactive org/member rows are excluded at the query level and never reach this handler.
  // 'status' is NOT included in the SELECT list (identity-session.ts:236) — an application-layer
  // field check would read 'undefined' and would incorrectly block all valid users.
  // SQL contract reference: packages/api/src/modules/dogruadres-access/identity-session.ts:232-249

  const vehicleService = req.scope.resolve<VehicleModuleService>(DOGRUADRES_VEHICLE_MODULE)
  const vehicles = await vehicleService.listLiveVehicles(activeOrg.id)
  return res.json({
    vehicles: vehicles.map((v: any) => ({
      id: v.id,
      organization_id: v.organization_id,
      plate: v.plate,
      plate_key: v.plate_key,
      vin: v.vin,
      vin_key: v.vin_key,
      label: v.label,
      make: v.make,
      model: v.model,
      model_year: v.model_year,
      created_at: v.created_at,
      updated_at: v.updated_at,
    })),
  })
}

/**
 * Vehicle mutation gate remains closed until Foundation Policy A
 * post-lock coherent authorization decision integration is completed
 * and independently reviewed. (#482 Aşama 1 — route taşındı, gate kapalı kalıyor)
 */
export const POST = async (_req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  return res.status(503).json({
    message: "Vehicle mutation operations are temporarily closed pending Foundation Policy A integration",
  })
}

export const PATCH = POST
export const DELETE = POST
