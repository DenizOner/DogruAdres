import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireOrganizationAccess } from "../../../authorization"
import { timelinePage, TimelineError } from "../../../audit-timeline"
import { DOGRUADRES_AUDIT_INDEX_MODULE } from "../../../../../modules/dogruadres-audit-index"
import type AuditIndexModuleService from "../../../../../modules/dogruadres-audit-index/service"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  try {
    const result = await timelinePage(req.query, async () => {
      const allowed = await requireOrganizationAccess(req, req.params.id, "audit.timeline.read")
      return { personId: allowed.personId, organizationId: allowed.organizationId }
    }, async (organizationId, limit, boundary) => {
      const index = req.scope.resolve<AuditIndexModuleService>(DOGRUADRES_AUDIT_INDEX_MODULE)
      return index.readOrganizationTimeline(organizationId, limit, boundary)
    }, () => process.env.DOGRUADRES_AUDIT_CURSOR_KEY)
    res.json(result)
  } catch (error) {
    if (error instanceof TimelineError) { res.status(error.status).json({ message: error.message }); return }
    // Authorization errors retain the existing uniform Foundation 403 contract.
    throw error
  }
}
