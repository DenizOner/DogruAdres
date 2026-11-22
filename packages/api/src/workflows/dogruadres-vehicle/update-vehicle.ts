import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import VehicleModuleService from "../../modules/dogruadres-vehicle/service"
import { DOGRUADRES_VEHICLE_MODULE } from "../../modules/dogruadres-vehicle"
import { withVehicleUnitOfWork } from "./vehicle-uow"

export type UpdateVehicleInput = Readonly<{
  organization_id: string
  vehicle_id: string
  actor_person_id: string
  actor_type: "user" | "member" | "customer"
  actor_id: string
  role: "owner" | "admin" | "member"
  data: {
    plate?: string | null
    vin?: string | null
    label?: string | null
    make?: string | null
    model?: string | null
    model_year?: number | null
  }
}>

export const updateVehicleStep = createStep(
  "dogruadres-update-vehicle",
  async (input: UpdateVehicleInput, { container }) => {
    const service = container.resolve<VehicleModuleService>(DOGRUADRES_VEHICLE_MODULE)
    const result = await withVehicleUnitOfWork(service, async (context) => {
      return await service.updateVehicle(input.organization_id, input.vehicle_id, input.data, {
        ...context,
        mutationActor: {
          organizationId: input.organization_id,
          personId: input.actor_person_id,
          actorType: input.actor_type,
          actorId: input.actor_id,
          role: input.role,
        },
      } as any)
    })
    return new StepResponse(result)
  }
)

export const updateVehicleWorkflow = createWorkflow(
  "dogruadres-update-vehicle",
  function (input: UpdateVehicleInput) {
    const result = updateVehicleStep(input)
    return new WorkflowResponse(result)
  }
)
