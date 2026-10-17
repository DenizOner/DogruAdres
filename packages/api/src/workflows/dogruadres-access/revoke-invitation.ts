import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import DogruAdresAccessModuleService from "../../modules/dogruadres-access/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

type Input = Readonly<{
  organization_id: string
  invitation_id: string
  actor_person_id: string
  actor_type: string
  actor_id: string
}>

const revokeInvitationStep = createStep(
  "dogruadres-revoke-organization-invitation",
  async (input: Input, { container }) => {
    const service = container.resolve<DogruAdresAccessModuleService>(DOGRUADRES_ACCESS_MODULE)
    return new StepResponse(await service.revokeOrganizationInvitation(input))
  }
)

export const revokeInvitationWorkflow = createWorkflow(
  "dogruadres-revoke-organization-invitation",
  function (input: Input) {
    const result = revokeInvitationStep(input)
    return new WorkflowResponse(result)
  }
)
