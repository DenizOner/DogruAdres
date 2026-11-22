import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import VehicleModuleService from "../../modules/dogruadres-vehicle/service"
import { DOGRUADRES_VEHICLE_MODULE } from "../../modules/dogruadres-vehicle"
import { withVehicleUnitOfWork } from "./vehicle-uow"

export type CreateVehicleInput = Readonly<{
  organization_id: string
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

export const createVehicleStep = createStep(
  "dogruadres-create-vehicle",
  async (input: CreateVehicleInput, { container }) => {
    const service = container.resolve<VehicleModuleService>(DOGRUADRES_VEHICLE_MODULE)
    const result = await withVehicleUnitOfWork(service, async (context) => {
      return await service.createVehicle(input.organization_id, input.data, {
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

export const createVehicleWorkflow = createWorkflow(
  "dogruadres-create-vehicle",
  function (input: CreateVehicleInput) {
    const result = createVehicleStep(input)
    return new WorkflowResponse(result)
  }
)
