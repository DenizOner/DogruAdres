/** A principal copied from Medusa's verified request auth_context. */
export type AuthenticatedPrincipal = Readonly<{
  actorId: string
  actorType: string
}>

export type OrganizationAction = "create" | "read" | "update" | "delete"

export type OrganizationAuthorizationInput = Readonly<{
  principal: AuthenticatedPrincipal | null | undefined
  organizationId: string | null | undefined
  action: string | null | undefined
  /** Client-selected identifier only; ownership is resolved server-side. */
  resourceId?: string | null
  operation: OrganizationAction
}>

export type PrincipalIdentity = Readonly<{
  actorId: string
  actorType: string
  personId: string
}>

export type OrganizationMembership = Readonly<{
  organizationId: string
  personId: string
  status: "active" | "revoked"
  role: "owner" | "admin" | "member"
  protectedOwner: boolean
}>

export type OrganizationAuthorizationResolver = Readonly<{
  resolvePrincipalIdentity: (
    principal: AuthenticatedPrincipal
  ) => Promise<PrincipalIdentity | null>
  resolveMembership: (
    personId: string,
    organizationId: string
  ) => Promise<OrganizationMembership | null>
  resolveResourceOrganization: (
    resourceId: string
  ) => Promise<string | null>
  resolvePolicy: (input: {
    personId: string
    organizationId: string
    action: string
  }) => Promise<boolean>
}>

export type OrganizationAuthorizationDecision =
  | Readonly<{
      allowed: true
      personId: string
      organizationId: string
    }>
  | Readonly<{ allowed: false }>

const denied: OrganizationAuthorizationDecision = { allowed: false }

/**
 * Central fail-closed gate for future Organization-scoped routes and workflows.
 * Callers must pass only Medusa's verified auth_context, then use the returned
 * organizationId as the server-side query/write scope. A client-provided
 * organization identifier is a selector only; it grants no authority.
 */
export async function authorizeOrganizationAccess(
  input: OrganizationAuthorizationInput,
  resolver?: OrganizationAuthorizationResolver | null
): Promise<OrganizationAuthorizationDecision> {
  const { principal, organizationId, action, operation, resourceId } = input

  if (
    !principal?.actorId ||
    !principal.actorType ||
    !organizationId ||
    !action ||
    !resolver ||
    typeof resolver.resolvePrincipalIdentity !== "function" ||
    typeof resolver.resolveMembership !== "function" ||
    typeof resolver.resolveResourceOrganization !== "function" ||
    typeof resolver.resolvePolicy !== "function"
  ) {
    return denied
  }

  if (operation !== "create") {
    if (!resourceId) return denied
  } else if (resourceId) {
    return denied
  }

  try {
    const identity = await resolver.resolvePrincipalIdentity(principal)
    if (
      !identity?.personId ||
      identity.actorId !== principal.actorId ||
      identity.actorType !== principal.actorType
    ) {
      return denied
    }

    const membership = await resolver.resolveMembership(
      identity.personId,
      organizationId
    )
    if (
      !membership ||
      membership.personId !== identity.personId ||
      membership.organizationId !== organizationId ||
      membership.status !== "active"
    ) {
      return denied
    }

    if (operation !== "create") {
      const resourceOrganizationId = await resolver.resolveResourceOrganization(
        resourceId!
      )
      if (!resourceOrganizationId || resourceOrganizationId !== organizationId) {
        return denied
      }
    }

    if (
      (await resolver.resolvePolicy({
        personId: identity.personId,
        organizationId,
        action,
      })) !== true
    ) {
      return denied
    }

    return {
      allowed: true,
      personId: identity.personId,
      organizationId,
    }
  } catch {
    // Resolver outages and malformed resolver behavior never grant access.
    return denied
  }
}
