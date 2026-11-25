import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { requireOrganizationAccess } from "../../../../authorization"
import { DOGRUADRES_VEHICLE_MODULE } from "../../../../../../modules/dogruadres-vehicle"
import type VehicleModuleService from "../../../../../../modules/dogruadres-vehicle/service"
import { updateVehicleWorkflow } from "../../../../../../workflows/dogruadres-vehicle/update-vehicle"
import { deleteVehicleWorkflow } from "../../../../../../workflows/dogruadres-vehicle/delete-vehicle"
import type { UpdateVehicleBody } from "../../../../validators"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  const { organizationId } = await requireOrganizationAccess(req, req.params.id, "vehicle.read")
  const vehicleService = req.scope.resolve<VehicleModuleService>(DOGRUADRES_VEHICLE_MODULE)
  const vehicle = await vehicleService.getLiveVehicle(organizationId, req.params.vehicle_id)
  if (!vehicle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
  }
  res.json({
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
}

export const PATCH = async (req: AuthenticatedMedusaRequest<UpdateVehicleBody>, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  const access = await requireOrganizationAccess(req, req.params.id, "vehicle.update")
  const body = req.validatedBody || req.body
  try {
    const { result: vehicle } = await updateVehicleWorkflow(req.scope).run({
      input: {
        organization_id: access.organizationId,
        vehicle_id: req.params.vehicle_id,
        actor_person_id: access.personId,
        actor_type: req.auth_context.actor_type as "user" | "member" | "customer",
        actor_id: req.auth_context.actor_id,
        role: access.role,
        data: body,
      },
    })
    res.json({
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
    if (error?.message?.includes("VEHICLE_NOT_FOUND")) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
    }
    if (
      error?.message?.includes("INVALID_PLATE_P1") ||
      error?.message?.includes("INVALID_VIN_C1") ||
      error?.message?.includes("VEHICLE_IDENTIFIER_REQUIRED") ||
      error?.message?.includes("INVALID_VEHICLE_INPUT") ||
      error?.message?.includes("VEHICLE_NO_CHANGE")
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

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  const access = await requireOrganizationAccess(req, req.params.id, "vehicle.delete")
  try {
    await deleteVehicleWorkflow(req.scope).run({
      input: {
        organization_id: access.organizationId,
        vehicle_id: req.params.vehicle_id,
        actor_person_id: access.personId,
        actor_type: req.auth_context.actor_type as "user" | "member" | "customer",
        actor_id: req.auth_context.actor_id,
        role: access.role,
      },
    })
    res.json({
      deleted: true,
      id: req.params.vehicle_id,
    })
  } catch (error: any) {
    if (error?.message?.includes("VEHICLE_NOT_FOUND")) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
    }
    if (error?.message?.includes("VEHICLE_ACCESS_DENIED")) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Vehicle delete access denied")
    }
    throw error
  }
}
