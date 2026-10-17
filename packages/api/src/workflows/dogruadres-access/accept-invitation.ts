import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type { ActorReference } from "../../modules/dogruadres-access/service"
import DogruAdresAccessModuleService from "../../modules/dogruadres-access/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

type Input = Readonly<{ token: string; email: string; email_verified: boolean; actor: ActorReference }>

const acceptInvitationStep = createStep(
  "dogruadres-accept-organization-invitation",
  async (input: Input, { container }) => {
    const service = container.resolve<DogruAdresAccessModuleService>(DOGRUADRES_ACCESS_MODULE)
    return new StepResponse(await service.acceptOrganizationInvitation(input))
  }
)

export const acceptInvitationWorkflow = createWorkflow(
  "dogruadres-accept-organization-invitation",
  function (input: Input) {
    const result = acceptInvitationStep(input)
    return new WorkflowResponse(result)
  }
)
