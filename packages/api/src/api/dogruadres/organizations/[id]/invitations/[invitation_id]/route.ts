import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { revokeInvitationWorkflow } from "../../../../../../workflows/dogruadres-access/revoke-invitation"
import { requireOrganizationAccess } from "../../../../authorization"

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const access = await requireOrganizationAccess(req, req.params.id, "invitation.manage")
  const invitation = await access.service.getInvitationInOrganization(req.params.invitation_id, req.params.id)
  if (!invitation) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Invitation not found")
  const { result } = await revokeInvitationWorkflow(req.scope).run({
    input: {
      organization_id: req.params.id,
      invitation_id: invitation.id,
      actor_person_id: access.personId,
      actor_type: req.auth_context.actor_type,
      actor_id: req.auth_context.actor_id,
    },
  })
  res.json({ invitation: { id: result.id, status: result.status, revoked_at: result.revoked_at } })
}
