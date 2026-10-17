import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type { ActorReference } from "../../modules/dogruadres-access/service"
import DogruAdresAccessModuleService from "../../modules/dogruadres-access/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

type Input = Readonly<{ name: string; provisioned_by: ActorReference; initial_owners: ActorReference[] }>

const provisionOrganizationStep = createStep(
  "dogruadres-provision-organization",
  async (input: Input, { container }) => {
    const service = container.resolve<DogruAdresAccessModuleService>(DOGRUADRES_ACCESS_MODULE)
    return new StepResponse(await service.provisionOrganization(input))
  }
)

export const provisionOrganizationWorkflow = createWorkflow(
  "dogruadres-provision-organization",
  function (input: Input) {
    const result = provisionOrganizationStep(input)
    return new WorkflowResponse(result)
  }
)
