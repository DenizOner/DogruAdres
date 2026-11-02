import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type AccessService from "../../modules/dogruadres-access/service"
import type IndexService from "../../modules/dogruadres-audit-index/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"
import { DOGRUADRES_AUDIT_INDEX_MODULE } from "../../modules/dogruadres-audit-index"
import { relayOneFoundationAudit } from "./relay"

// Server-side integration only: no public ingestion input, route or scheduler.
// No compensation deletes canonical evidence/projections or rewinds attempts.
const relayStep = createStep("dogruadres-relay-one-foundation-audit", async (_input: undefined, { container }) => {
  const source = container.resolve<AccessService>(DOGRUADRES_ACCESS_MODULE)
  const index = container.resolve<IndexService>(DOGRUADRES_AUDIT_INDEX_MODULE)
  return new StepResponse(await relayOneFoundationAudit(source, index))
})
export const relayFoundationAuditWorkflow = createWorkflow("dogruadres-relay-foundation-audit", function () {
  return new WorkflowResponse(relayStep())
})
