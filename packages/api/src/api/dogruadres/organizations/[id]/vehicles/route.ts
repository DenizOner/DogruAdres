import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { requireOrganizationAccess } from "../../../authorization"
import { DOGRUADRES_VEHICLE_MODULE } from "../../../../../modules/dogruadres-vehicle/constants"
import type VehicleModuleService from "../../../../../modules/dogruadres-vehicle/service"
import { createVehicleWorkflow } from "../../../../../workflows/dogruadres-vehicle/create-vehicle"
import type { CreateVehicleBody } from "../../../validators"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  const { organizationId } = await requireOrganizationAccess(req, req.params.id, "vehicle.read")
  const vehicleService = req.scope.resolve<VehicleModuleService>(DOGRUADRES_VEHICLE_MODULE)
  const vehicles = await vehicleService.listLiveVehicles(organizationId)
  res.json({
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

export const POST = async (req: AuthenticatedMedusaRequest<CreateVehicleBody>, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  const access = await requireOrganizationAccess(req, req.params.id, "vehicle.create")
  const body = req.validatedBody || req.body
  try {
    const { result: vehicle } = await createVehicleWorkflow(req.scope).run({
      input: {
        organization_id: access.organizationId,
        actor_person_id: access.personId,
        actor_type: req.auth_context.actor_type as "user" | "member" | "customer",
        actor_id: req.auth_context.actor_id,
        role: access.role,
        data: body,
      },
    })
    res.status(201).json({
      vehicle: {
        id: vehicle.id,
        organization_id: vehicle.organization_id,
        plate: vehicle.plate,
        plate_key: vehicle.plate_key,
        vin: vehicle.vin,
        vin_key: vehicle.vin_key,
        label: vehicle.label,
        make: vehicle.make,
        model: vehicle.model,
        model_year: vehicle.model_year,
        created_at: vehicle.created_at,
        updated_at: vehicle.updated_at,
      },
    })
  } catch (error: any) {
    if (
      error?.message?.includes("INVALID_PLATE_P1") ||
      error?.message?.includes("INVALID_VIN_C1") ||
      error?.message?.includes("VEHICLE_IDENTIFIER_REQUIRED") ||
      error?.message?.includes("INVALID_VEHICLE_INPUT")
    ) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, error.message)
    }
    if (
      error?.message?.includes("IDX_da_vehicle_org_plate_live") ||
      error?.message?.includes("IDX_da_vehicle_org_vin_live")
    ) {
      throw new MedusaError(MedusaError.Types.CONFLICT, "Vehicle with this identifier already exists in this organization")
    }
    throw error
  }
}
