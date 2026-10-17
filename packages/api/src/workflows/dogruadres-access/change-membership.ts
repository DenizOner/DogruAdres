import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import DogruAdresAccessModuleService from "../../modules/dogruadres-access/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

type Input = Readonly<{
  organization_id: string
  membership_id: string
  actor_person_id: string
  actor_type: string
  actor_id: string
  role?: "owner" | "admin" | "member"
  status?: "active" | "revoked"
}>

const changeMembershipStep = createStep(
  "dogruadres-change-membership",
  async (input: Input, { container }) => {
    const service = container.resolve<DogruAdresAccessModuleService>(DOGRUADRES_ACCESS_MODULE)
    return new StepResponse(await service.changeMembership(input))
  }
)

export const changeMembershipWorkflow = createWorkflow(
  "dogruadres-change-membership",
  function (input: Input) {
    const result = changeMembershipStep(input)
    return new WorkflowResponse(result)
  }
)
