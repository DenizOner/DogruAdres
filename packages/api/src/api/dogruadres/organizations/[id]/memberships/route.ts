import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireOrganizationAccess } from "../../../authorization"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { service } = await requireOrganizationAccess(req, req.params.id, "membership.list")
  const memberships = await service.listOrganizationMemberships(req.params.id)
  res.json({
    memberships: memberships.map((membership) => ({
      id: membership.id,
      person_id: membership.person_id,
      role: membership.role,
      status: membership.status,
      protected_owner: membership.protected_owner,
    })),
  })
}
