import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { ChangeMembershipBody } from "../../../../validators"
import { changeMembershipWorkflow } from "../../../../../../workflows/dogruadres-access/change-membership"
import { requireOrganizationAccess } from "../../../../authorization"

export const POST = async (req: AuthenticatedMedusaRequest<ChangeMembershipBody>, res: MedusaResponse) => {
  const access = await requireOrganizationAccess(req, req.params.id, "membership.manage")
  const target = await access.service.getMembershipInOrganization(req.params.membership_id, req.params.id)
  if (!target) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Membership not found")
  const { result } = await changeMembershipWorkflow(req.scope).run({
    input: {
      organization_id: req.params.id,
      membership_id: target.id,
      actor_person_id: access.personId,
      actor_type: req.auth_context.actor_type,
      actor_id: req.auth_context.actor_id,
      ...req.validatedBody,
    },
  })
  res.json({ membership: { id: result.id, person_id: result.person_id, role: result.role, status: result.status, protected_owner: result.protected_owner } })
}
