import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, enabled, sessionToken } from "../security"
import { timelinePage, TimelineError } from "../../dogruadres/audit-timeline"
import { DOGRUADRES_AUDIT_INDEX_MODULE } from "../../../modules/dogruadres-audit-index"
import type AuditIndexModuleService from "../../../modules/dogruadres-audit-index/service"

export const AUTHENTICATE = false

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  const orgId = typeof req.query.organization === "string" ? req.query.organization : undefined
  if (!orgId || !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(orgId)) {
    return res.status(400).json({ message: "Invalid input" })
  }
  // Check for any unauthorized query parameters other than organization, limit, cursor
  if (Object.keys(req.query).some(k => k !== "organization" && k !== "limit" && k !== "cursor")) {
    return res.status(400).json({ message: "Invalid input" })
  }
  try {
    const { limit, cursor } = req.query
    const paginationQuery: Record<string, unknown> = {}
    if (limit !== undefined) paginationQuery.limit = limit
    if (cursor !== undefined) paginationQuery.cursor = cursor

    const result = await timelinePage(paginationQuery, async () => {
      const decision = await access(req).personalOrganizations(sessionToken(req), orgId)
      if (!decision || !decision.organizations.length || !["owner", "admin"].includes(decision.organizations[0].role)) {
        throw new TimelineError(403)
      }
      return { personId: decision.person_id, organizationId: orgId }
    }, async (organizationId, limitCount, boundary) => {
      const index = req.scope.resolve<AuditIndexModuleService>(DOGRUADRES_AUDIT_INDEX_MODULE)
      return index.readOrganizationTimeline(organizationId, limitCount, boundary)
    }, () => process.env.DOGRUADRES_AUDIT_CURSOR_KEY)
    return res.json(result)
  } catch (error) {
    if (error instanceof TimelineError) {
      const msg = error.status === 403 ? "Access denied" : error.message
      return res.status(error.status).json({ message: msg })
    }
    return res.status(503).json({ message: "Service unavailable" })
  }
}