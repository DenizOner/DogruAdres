import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { AcceptInvitationBody } from "../../validators"
import { acceptInvitationWorkflow } from "../../../../workflows/dogruadres-access/accept-invitation"

type AuthVerification = Readonly<{ entity_id?: string; verified_at?: string | Date | null }>
type AuthModuleVerificationReader = Readonly<{
  listAuthVerifications: (filters: { auth_identity_id: string }) => Promise<AuthVerification[]>
}>

const verifiedEmailFor = async (req: AuthenticatedMedusaRequest) => {
  const email = req.auth_context.user_metadata?.email
  const identityId = req.auth_context.auth_identity_id
  if (typeof email !== "string" || !identityId) return null
  const authModule = req.scope.resolve(Modules.AUTH) as unknown as AuthModuleVerificationReader
  const verifications = await authModule.listAuthVerifications({ auth_identity_id: identityId })
  const normalized = email.trim().toLowerCase()
  const verified = verifications.some((item) =>
    item.verified_at && typeof item.entity_id === "string" && item.entity_id.trim().toLowerCase() === normalized
  )
  return verified ? normalized : null
}

export const POST = async (req: AuthenticatedMedusaRequest<AcceptInvitationBody>, res: MedusaResponse) => {
  const email = await verifiedEmailFor(req)
  const { result } = await acceptInvitationWorkflow(req.scope).run({
    input: {
      token: req.validatedBody.token,
      email: email ?? "",
      email_verified: email !== null,
      actor: { actor_type: req.auth_context.actor_type, actor_id: req.auth_context.actor_id },
    },
  })
  res.json({ membership: { id: result.membership.id, organization_id: result.membership.organization_id, role: result.membership.role, status: result.membership.status } })
}
