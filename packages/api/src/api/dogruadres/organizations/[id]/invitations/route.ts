import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { CreateInvitationBody } from "../../../validators"
import { deriveInvitationToken } from "../../../../../modules/dogruadres-access/security"
import { createInvitationWorkflow } from "../../../../../workflows/dogruadres-access/create-invitation"
import { requireOrganizationAccess } from "../../../authorization"

export const POST = async (req: AuthenticatedMedusaRequest<CreateInvitationBody>, res: MedusaResponse) => {
  const access = await requireOrganizationAccess(req, req.params.id, "invitation.manage")
  const { result: invitation } = await createInvitationWorkflow(req.scope).run({
    input: {
      organization_id: req.params.id,
      actor_person_id: access.personId,
      actor_type: req.auth_context.actor_type,
      actor_id: req.auth_context.actor_id,
      ...req.validatedBody,
    },
  })
  // The token is derived only for this response; the workflow and database contain its hash only.
  res.status(201).json({
    invitation: { id: invitation.id, role: invitation.role, status: invitation.status, expires_at: invitation.expires_at },
    invitation_token: deriveInvitationToken(invitation.id),
  })
}
