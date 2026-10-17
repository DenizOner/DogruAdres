import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  authorizeOrganizationAccess,
  type OrganizationAuthorizationResolver,
} from "../../utils/organization-authorization"
import DogruAdresAccessModuleService from "../../modules/dogruadres-access/service"
import { DOGRUADRES_ACCESS_MODULE } from "../../modules/dogruadres-access"

export async function requireOrganizationAccess(
  req: AuthenticatedMedusaRequest,
  organizationId: string,
  action: "organization.read" | "membership.list" | "membership.manage" | "invitation.manage"
) {
  const principal = {
    actorId: req.auth_context.actor_id,
    actorType: req.auth_context.actor_type,
  }
  let service: DogruAdresAccessModuleService
  try {
    service = req.scope.resolve<DogruAdresAccessModuleService>(DOGRUADRES_ACCESS_MODULE)
  } catch {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "Organization access denied")
  }
  const resolver: OrganizationAuthorizationResolver = {
    resolvePrincipalIdentity: async ({ actorId, actorType }) => {
      const person = await service.resolvePersonForActor({ actor_id: actorId, actor_type: actorType })
      return person ? { actorId, actorType, personId: person.id } : null
    },
    resolveMembership: async (personId, selectedOrganizationId) => {
      const membership = await service.getActiveMembership(personId, selectedOrganizationId)
      return membership
        ? {
            organizationId: selectedOrganizationId,
            personId,
            status: membership.status,
            role: membership.role,
            protectedOwner: membership.protected_owner,
          }
        : null
    },
    resolveResourceOrganization: async (resourceId) => {
      const organization = await service.getOrganization(resourceId)
      return organization?.status === "active" ? organization.id : null
    },
    resolvePolicy: async ({ personId, organizationId: orgId, action: requestedAction }) => {
      const membership = await service.getActiveMembership(personId, orgId)
      if (!membership || membership.status !== "active") return false
      if (requestedAction === "organization.read") return true
      if (["membership.list", "membership.manage", "invitation.manage"].includes(requestedAction)) {
        return membership.role === "owner" || membership.role === "admin"
      }
      return false
    },
  }

  const decision = await authorizeOrganizationAccess({
    principal,
    organizationId,
    action,
    operation: "read",
    resourceId: organizationId,
  }, resolver)
  if (!decision.allowed) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "Organization access denied")
  }
  return { personId: decision.personId, organizationId: decision.organizationId, service }
}

export function requirePlatformAdministrator(req: AuthenticatedMedusaRequest) {
  if (req.auth_context?.actor_type !== "user" || !req.auth_context?.actor_id) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "Platform administrator authentication is required")
  }
  return { actor_id: req.auth_context.actor_id, actor_type: req.auth_context.actor_type }
}
