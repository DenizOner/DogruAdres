/** B22 canonical, reviewable defaults for Organization actions.
 * This is NOT a platform Staff grant, native Mercur Seller membership,
 * application entitlement or global Person permission.
 * Owner's full default within the current B22 action catalog is a ROLE
 * policy outcome, never an unconditional Owner authorization bypass.
 * Editing the default list changes role policy at one audited source; a
 * future persisted policy editor must replace this source atomically, not
 * introduce another role-only bypass or grant implicit Store approval.
 */
export type OrganizationAction = "buyer.purchase" | "products.edit" | "invitation.manage" | "membership.manage" | "membership.list" | "audit.timeline.read" | "organization.read" | "price.group.manage"
export const DEFAULT_OWNER_ACTIONS: readonly OrganizationAction[] =
  Object.freeze(["buyer.purchase","products.edit","invitation.manage","membership.manage","membership.list","audit.timeline.read","organization.read","price.group.manage"])
const DENY_ALL_OWNER_ACTIONS: readonly OrganizationAction[] = Object.freeze([])

/** Optional trusted deployment setting for the Organization Owner ROLE,
 * NOT client, session, Person, Store or platform Staff input.
 * Omitted => current approved full B22 defaults. An explicit empty value
 * denies every B22 Owner action. Only these exact strings are accepted; malformed,
 * duplicate and unknown entries fail closed rather than restoring defaults.
 * No database schema, new service or per-Organization override is created.
 * Operational changes must be reviewed and rolled out consistently.
 */
export function configuredOwnerActions(
  source: Readonly<{DOGRUADRES_OWNER_ROLE_ACTIONS?:string}> = process.env
): readonly OrganizationAction[] {
  const raw=source.DOGRUADRES_OWNER_ROLE_ACTIONS
  if(raw===undefined)return DEFAULT_OWNER_ACTIONS
  if(raw==="")return DENY_ALL_OWNER_ACTIONS
  if(raw.length>DEFAULT_OWNER_ACTIONS.join(",").length)return DENY_ALL_OWNER_ACTIONS
  const parts=raw.split(",")
  if(parts.length>DEFAULT_OWNER_ACTIONS.length ||
     new Set(parts).size!==parts.length ||
     parts.some(action=>!DEFAULT_OWNER_ACTIONS.includes(action as OrganizationAction)))
    return DENY_ALL_OWNER_ACTIONS
  return parts as OrganizationAction[]
}

/** Pure policy decision: callers provide server-authoritative active role
 * and a separate current protected-Owner or audited member-grant proof.
 * A policy-narrowed Owner remains denied even if a person grant exists.
 * No actor/role/action value from an HTTP request may be used as proof.
 */
export function organizationActionAllowed(
  role: unknown,
  action: OrganizationAction,
  protectedOwner: boolean,
  auditedMemberGrant: boolean,
  ownerActions: readonly OrganizationAction[] = configuredOwnerActions()
): boolean {
  if(role==="owner") return protectedOwner===true && ownerActions.includes(action)
  if(role==="member" || role==="admin") return !["invitation.manage","membership.manage","membership.list","audit.timeline.read","price.group.manage"].includes(action) && auditedMemberGrant===true
  return false
}

/** Final checkout runs a single SQL observation. Its owner-policy predicate
 * uses the same immutable default rather than independently bypassing it.
 */
export const ownerRoleAllows = (action: OrganizationAction): boolean =>
  organizationActionAllowed("owner",action,true,false)
