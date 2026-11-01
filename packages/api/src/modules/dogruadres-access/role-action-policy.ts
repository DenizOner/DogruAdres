/** B22 canonical, reviewable defaults for Organization *business* actions.
 * This is NOT a platform Staff grant, native Mercur Seller membership,
 * application entitlement or global Person permission.
 * Owner's full default within the current B22 action catalog is a ROLE
 * policy outcome, never an unconditional Owner authorization bypass.
 * Editing the default list changes role policy at one audited source; a
 * future persisted policy editor must replace this source atomically, not
 * introduce another role-only bypass or grant implicit Store approval.
 */
export type OrganizationAction = "buyer.purchase" | "products.edit"
export const DEFAULT_OWNER_ACTIONS: readonly OrganizationAction[] =
  Object.freeze(["buyer.purchase","products.edit"])

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
  ownerActions: readonly OrganizationAction[] = DEFAULT_OWNER_ACTIONS
): boolean {
  if(role==="owner") return protectedOwner===true && ownerActions.includes(action)
  if(role==="member" || role==="admin") return auditedMemberGrant===true
  return false
}

/** Final checkout runs a single SQL observation. Its owner-policy predicate
 * uses the same immutable default rather than independently bypassing it.
 */
export const ownerRoleAllows = (action: OrganizationAction): boolean =>
  organizationActionAllowed("owner",action,true,false)
