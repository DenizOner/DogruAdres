import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type VehicleModuleService from "../../modules/dogruadres-vehicle/service"
import { DOGRUADRES_VEHICLE_MODULE } from "../../modules/dogruadres-vehicle/constants"
import { withVehicleUnitOfWork } from "./vehicle-uow"

export type DeleteVehicleInput = Readonly<{
  organization_id: string
  vehicle_id: string
  actor_person_id: string
  actor_type: "user" | "member" | "customer"
  actor_id: string
  role: "owner" | "admin" | "member"
}>

export const deleteVehicleStep = createStep(
  "dogruadres-delete-vehicle",
  async (input: DeleteVehicleInput, { container }) => {
    const service = container.resolve<VehicleModuleService>(DOGRUADRES_VEHICLE_MODULE)
    const result = await withVehicleUnitOfWork(service, async (context) => {
      return await service.deleteVehicle(input.organization_id, input.vehicle_id, {
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

export const deleteVehicleWorkflow = createWorkflow(
  "dogruadres-delete-vehicle",
  function (input: DeleteVehicleInput) {
    const result = deleteVehicleStep(input)
    return new WorkflowResponse(result)
  }
)
