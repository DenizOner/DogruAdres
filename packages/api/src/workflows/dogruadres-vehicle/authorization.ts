/** Application-layer Query resolver ONLY; no Vehicle/UOW/HTTP integration.
 * Principal must come exclusively from verified Medusa auth_context. This type
 * and this function do not authenticate a caller or mint request capabilities.
 *
 * INTEGRATION BLOCKED: sequential observations are NOT one Foundation snapshot.
 * Person disable or Organization suspension AFTER their reads can invalidate an
 * earlier condition before the membership read. Membership revocation visible to
 * the last query is denied; a commit after that query's snapshot may not be seen,
 * even if it precedes Promise settlement/function return. No aggregate final-check
 * linearization point is proven. Never use allowed below as a final mutation grant
 * until a reviewed coherent authorization boundary resolves this limitation.
 */
export const FOUNDATION_AUTHORIZATION_INTEGRATION = "BLOCKED_NON_ATOMIC_FOUNDATION_OBSERVATIONS" as const
export type VehicleAction = "vehicle.read" | "vehicle.create" | "vehicle.update" | "vehicle.delete"
type ActorType = "user" | "member" | "customer"
export type VerifiedVehiclePrincipal = Readonly<{ actorType: ActorType; actorId: string }>
type Entity = "da_actor_mapping" | "da_person" | "da_organization" | "da_organization_membership"
export type FoundationQueryInput = {
  entity: Entity; fields: string[]; filters: Record<string, string>; pagination: { take: 2 }
}
export type FoundationQueryPort = {
  graph(input: FoundationQueryInput, options: { cache: { enable: false } }): Promise<unknown>
}
export type VehicleAttribution = Readonly<{ organizationId: string; personId: string; membershipId: string;
  actorType: ActorType; actorId: string; role: "owner" | "admin" | "member"; action: VehicleAction }>
export type VehicleAuthorizationObservation =
  | { status: "allowed"; attribution: VehicleAttribution; consistency: "non_atomic" }
  | { status: "denied" }
  | { status: "unavailable" }
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,254}$/.test(value)
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const denied = (): VehicleAuthorizationObservation => ({ status: "denied" })
function one(result: unknown): Record<string, unknown> | null {
  if (!record(result) || !Array.isArray(result.data) || result.data.length !== 1 || !record(result.data[0])) return null
  return result.data[0]
}

export async function observeVehicleAuthorization(query: FoundationQueryPort, principal: VerifiedVehiclePrincipal,
  organizationId: string, action: VehicleAction): Promise<VehicleAuthorizationObservation> {
  if (!record(principal) || !["user", "member", "customer"].includes(principal.actorType) || !identifier(principal.actorId) ||
    !identifier(organizationId) || !["vehicle.read", "vehicle.create", "vehicle.update", "vehicle.delete"].includes(action)) return denied()
  if (!query || typeof query.graph !== "function") return { status: "unavailable" }
  // Copy authority before awaits. No caller filters, options, context or managers.
  const actorType = principal.actorType, actorId = principal.actorId
  const read = async (entity: Entity, fields: string[], filters: Record<string, string>) =>
    one(await query.graph({ entity, fields, filters, pagination: { take: 2 } }, { cache: { enable: false } }))
  try {
    const mapping = await read("da_actor_mapping", ["id", "actor_type", "actor_id", "person_id"], { actor_type: actorType, actor_id: actorId })
    if (!mapping || !identifier(mapping.id) || mapping.actor_type !== actorType || mapping.actor_id !== actorId || !identifier(mapping.person_id)) return denied()
    const personId = mapping.person_id
    const person = await read("da_person", ["id", "disabled_at"], { id: personId })
    if (!person || person.id !== personId || person.disabled_at !== null) return denied()
    const organization = await read("da_organization", ["id", "status"], { id: organizationId })
    if (!organization || organization.id !== organizationId || organization.status !== "active") return denied()
    const membership = await read("da_organization_membership", ["id", "person_id", "organization_id", "status", "role"],
      { person_id: personId, organization_id: organizationId, status: "active" })
    if (!membership || !identifier(membership.id) || membership.person_id !== personId || membership.organization_id !== organizationId ||
      membership.status !== "active" || typeof membership.role !== "string" || !["owner", "admin", "member"].includes(membership.role)) return denied()
    const role = membership.role as VehicleAttribution["role"]
    if (action === "vehicle.delete" && role === "member") return denied()
    return { status: "allowed", consistency: "non_atomic", attribution: { organizationId, personId, membershipId: membership.id, actorType, actorId, role, action } }
  } catch {
    // Infrastructure exceptions never leak their messages/SQL or produce a grant.
    return { status: "unavailable" }
  }
}
