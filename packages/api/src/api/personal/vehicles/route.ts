import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { DOGRUADRES_VEHICLE_MODULE } from "../../../modules/dogruadres-vehicle"
import type VehicleModuleService from "../../../modules/dogruadres-vehicle/service"
import { createVehicleWorkflow } from "../../../workflows/dogruadres-vehicle/create-vehicle"
import { updateVehicleWorkflow } from "../../../workflows/dogruadres-vehicle/update-vehicle"
import { deleteVehicleWorkflow } from "../../../workflows/dogruadres-vehicle/delete-vehicle"

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
  if (activeOrg.status !== "active") {
    return res.status(403).json({ message: "Organization is not active" })
  }

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

async function handleMutation(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })

  let validCsrf = false
  try {
    validCsrf = await csrf(req)
  } catch {}
  if (!validCsrf) return res.status(403).json({ message: "Access denied" })

  const token = sessionToken(req)
  const svc = access(req)
  const body = (req.body as any) || {}
  const action = body.action || (req.method === "DELETE" ? "delete" : req.method === "PATCH" ? "update" : "create")

  const orgId = body.organization_id || req.query.organization
  if (typeof orgId !== "string" || !orgIdSchema.safeParse(orgId).success) {
    return res.status(400).json({ message: "Invalid organization ID" })
  }

  const orgDecision = await svc.personalOrganizations(token, orgId)
  if (!orgDecision || !orgDecision.organizations || orgDecision.organizations.length === 0) {
    return res.status(403).json({ message: "Access denied" })
  }
  const membership = orgDecision.organizations[0]
  if (membership.status !== "active") {
    return res.status(403).json({ message: "Organization is not active" })
  }

  const principal = await svc.personalLinkPrimary(token)
  if (!principal) return res.status(403).json({ message: "Access denied" })

  if (action === "delete") {
    if (membership.role !== "owner" && membership.role !== "admin") {
      return res.status(403).json({ message: "Only organization owner or admin can delete customer vehicles" })
    }
    const vehicleId = body.vehicle_id || body.id
    if (!vehicleId || typeof vehicleId !== "string") {
      return res.status(400).json({ message: "Vehicle ID is required" })
    }

    try {
      await deleteVehicleWorkflow(req.scope).run({
        input: {
          organization_id: orgId,
          vehicle_id: vehicleId,
          actor_person_id: orgDecision.person_id,
          actor_type: principal.actor_type as "user" | "member" | "customer",
          actor_id: principal.actor_id,
          role: membership.role as "owner" | "admin",
        },
      })
      return res.json({ deleted: true, id: vehicleId })
    } catch (error: any) {
      if (error?.message?.includes("VEHICLE_NOT_FOUND")) {
        return res.status(404).json({ message: "Vehicle not found" })
      }
      if (error?.message?.includes("VEHICLE_ACCESS_DENIED")) {
        return res.status(403).json({ message: "Vehicle delete access denied" })
      }
      return res.status(500).json({ message: error.message || "Failed to delete vehicle" })
    }
  }

  if (action === "update") {
    const vehicleId = body.vehicle_id || body.id
    if (!vehicleId || typeof vehicleId !== "string") {
      return res.status(400).json({ message: "Vehicle ID is required" })
    }

    try {
      const { result: vehicle } = await updateVehicleWorkflow(req.scope).run({
        input: {
          organization_id: orgId,
          vehicle_id: vehicleId,
          actor_person_id: orgDecision.person_id,
          actor_type: principal.actor_type as "user" | "member" | "customer",
          actor_id: principal.actor_id,
          role: membership.role as "owner" | "admin" | "member",
          data: {
            plate: body.plate,
            vin: body.vin,
            label: body.label,
            make: body.make,
            model: body.model,
            model_year: body.model_year,
          },
        },
      })
      return res.json({ vehicle })
    } catch (error: any) {
      if (error?.message?.includes("VEHICLE_NOT_FOUND")) {
        return res.status(404).json({ message: "Vehicle not found" })
      }
      if (
        error?.message?.includes("INVALID_PLATE_P1") ||
        error?.message?.includes("INVALID_VIN_C1") ||
        error?.message?.includes("VEHICLE_IDENTIFIER_REQUIRED") ||
        error?.message?.includes("INVALID_VEHICLE_INPUT") ||
        error?.message?.includes("VEHICLE_NO_CHANGE")
      ) {
        return res.status(400).json({ message: error.message })
      }
      if (
        error?.message?.includes("IDX_da_vehicle_org_plate_live") ||
        error?.message?.includes("IDX_da_vehicle_org_vin_live")
      ) {
        return res.status(409).json({ message: "Vehicle with this identifier already exists in this organization" })
      }
      return res.status(500).json({ message: error.message || "Failed to update vehicle" })
    }
  }

  // action === "create"
  try {
    const { result: vehicle } = await createVehicleWorkflow(req.scope).run({
      input: {
        organization_id: orgId,
        actor_person_id: orgDecision.person_id,
        actor_type: principal.actor_type as "user" | "member" | "customer",
        actor_id: principal.actor_id,
        role: membership.role as "owner" | "admin" | "member",
        data: {
          plate: body.plate,
          vin: body.vin,
          label: body.label,
          make: body.make,
          model: body.model,
          model_year: body.model_year,
        },
      },
    })
    return res.status(201).json({ vehicle })
  } catch (error: any) {
    if (
      error?.message?.includes("INVALID_PLATE_P1") ||
      error?.message?.includes("INVALID_VIN_C1") ||
      error?.message?.includes("VEHICLE_IDENTIFIER_REQUIRED") ||
      error?.message?.includes("INVALID_VEHICLE_INPUT")
    ) {
      return res.status(400).json({ message: error.message })
    }
    if (
      error?.message?.includes("IDX_da_vehicle_org_plate_live") ||
      error?.message?.includes("IDX_da_vehicle_org_vin_live")
    ) {
      return res.status(409).json({ message: "Vehicle with this identifier already exists in this organization" })
    }
    return res.status(500).json({ message: error.message || "Failed to create vehicle" })
  }
}

export const POST = handleMutation
export const PATCH = handleMutation
export const DELETE = handleMutation
