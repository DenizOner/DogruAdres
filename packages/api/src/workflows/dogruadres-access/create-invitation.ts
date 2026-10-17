import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import DogruAdresAccessModuleService from "../../modules/dogruadres-access/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

type Input = Readonly<{
  organization_id: string
  actor_person_id: string
  actor_type: string
  actor_id: string
  email: string
  role: "admin" | "member"
}>

const createInvitationStep = createStep(
  "dogruadres-create-organization-invitation",
  async (input: Input, { container }) => {
    const service = container.resolve<DogruAdresAccessModuleService>(DOGRUADRES_ACCESS_MODULE)
    return new StepResponse(await service.createOrganizationInvitation(input))
  }
)

export const createInvitationWorkflow = createWorkflow(
  "dogruadres-create-organization-invitation",
  function (input: Input) {
    const result = createInvitationStep(input)
    return new WorkflowResponse(result)
  }
)
