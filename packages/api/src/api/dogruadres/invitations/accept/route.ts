import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { AcceptInvitationBody } from "../../validators"
import { acceptInvitationWorkflow } from "../../../../workflows/dogruadres-access/accept-invitation"
import { verifiedEmailForActor, type AuthVerificationRecord } from "../../../../modules/dogruadres-access/security"

type AuthModuleVerificationReader = Readonly<{
  listAuthVerifications: (filters: { auth_identity_id: string }) => Promise<AuthVerificationRecord[]>
  listAuthIdentities: (
    filters: { id: string },
    config: { relations: string[] }
  ) => Promise<ReadonlyArray<{ id: string; provider_identities?: ReadonlyArray<{ provider: string; entity_id: string }> }>>
}>

const verifiedEmailFor = async (req: AuthenticatedMedusaRequest) => {
  const email = req.auth_context.user_metadata?.email
  const identityId = req.auth_context.auth_identity_id
  const authProvider = req.auth_context.auth_provider
  if (typeof email !== "string" || !identityId || !authProvider) return null
  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const configuredVerifications = config.projectConfig.http.authVerificationsPerActor?.[req.auth_context.actor_type]
  const matchingConfigurations = configuredVerifications?.filter((verification) => verification.auth_provider === authProvider) ?? []
  // Medusa's verification type is configured per actor/provider; absence or
  // ambiguity must never turn an unrelated verification into email proof.
  if (matchingConfigurations.length !== 1 || matchingConfigurations[0].entity_type !== "email") return null
  const authModule = req.scope.resolve(Modules.AUTH) as unknown as AuthModuleVerificationReader
  const identities = await authModule.listAuthIdentities({ id: identityId }, { relations: ["provider_identities"] })
  if (identities.length !== 1 || identities[0].id !== identityId) return null
  const providerIdentities = identities[0].provider_identities?.filter((identity) => identity.provider === authProvider) ?? []
  if (providerIdentities.length !== 1) return null
  const verifications = await authModule.listAuthVerifications({ auth_identity_id: identityId })
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
