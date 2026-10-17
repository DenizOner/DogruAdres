import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { AcceptInvitationBody } from "../../validators"
import { acceptInvitationWorkflow } from "../../../../workflows/dogruadres-access/accept-invitation"
import { normalizeEmail, verifiedEmailForActor } from "../../../../modules/dogruadres-access/security"

const verifiedEmailFor = async (req: AuthenticatedMedusaRequest) => {
  const claimedEmail = req.auth_context.user_metadata?.email
  const identityId = req.auth_context.auth_identity_id
  const authProvider = req.auth_context.auth_provider
  const actorType = req.auth_context.actor_type
  const actorId = req.auth_context.actor_id
  if (!identityId || !authProvider || !actorId || !["user", "member", "customer"].includes(actorType)) return null
  // Normal emailpass JWTs do not include an email claim. Resolve the actual
  // authenticated actor on the server rather than accepting a client email.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: actors } = await query.graph({ entity: actorType, fields: ["id", "email"], filters: { id: actorId } })
  if (actors.length !== 1 || typeof actors[0].email !== "string") return null
  const email = actors[0].email
  if (claimedEmail !== undefined && (typeof claimedEmail !== "string" || normalizeEmail(claimedEmail) !== normalizeEmail(email))) return null
  const authModule = req.scope.resolve<IAuthModuleService>(Modules.AUTH)
  const identities = await authModule.listAuthIdentities({ id: [identityId] }, { relations: ["provider_identities"] })
  if (identities.length !== 1 || identities[0].id !== identityId) return null
  const providerIdentities = identities[0].provider_identities?.filter((identity) => identity.provider === authProvider) ?? []
  if (providerIdentities.length !== 1) return null
  // Medusa's default list query excludes soft-deleted records. This proof is
  // local to invitation acceptance and does not change global login policy.
  const verifications = await authModule.listAuthVerifications({
    auth_identity_id: identityId,
    entity_type: "email",
  }, { take: null })
  // Match entity IDs only after canonical normalization. Exact raw filtering
  // would discard valid case/whitespace variants before the proof is checked.
  // Read all email proofs for this identity, rather than a default first page.
  return verifiedEmailForActor({
    actorType: req.auth_context.actor_type,
    actorId: req.auth_context.actor_id,
    authIdentityId: identityId,
    authProvider,
    authenticatedEmail: email,
    providerIdentityEmail: providerIdentities[0].entity_id,
    verifications,
  })
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
