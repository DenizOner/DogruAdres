/** B22 central Organization action policy (not a platform Staff or Seller grant).
 * Approved 06.11: the protected Owner group has fixed full Organization-action
 * permissions. Deployment variables, personal grants and ordinary group edits
 * cannot narrow it. This is not a role-label bypass: the caller must still
 * prove a current active protected Owner and an eligible Organization/resource.
 */
export type OrganizationAction = "buyer.purchase" | "products.edit" | "invitation.manage" | "membership.manage" | "membership.list" | "audit.timeline.read" | "organization.read" | "price.group.manage" | "store.follow" | "store.application.draft.manage"

export const DEFAULT_OWNER_ACTIONS: readonly OrganizationAction[] =
  Object.freeze(["buyer.purchase","products.edit","invitation.manage","membership.manage","membership.list","audit.timeline.read","organization.read","price.group.manage","store.follow","store.application.draft.manage"])

/** One central decision, using server-authenticated membership and action
 * proofs. Historic Organization "admin" rows have no inherent management
 * privilege; they are treated as ordinary members only for audited grants
 * until a separately proven, non-escalating membership migration is approved.
 * Store/platform policies and identity/MFA gates are evaluated by callers.
 */
export function organizationActionAllowed(
  role: unknown,
  action: OrganizationAction,
  protectedOwner: boolean,
  auditedMemberGrant: boolean,
): boolean {
  if(role==="owner")return protectedOwner===true && DEFAULT_OWNER_ACTIONS.includes(action)
  // Only an explicit, current audited Person×Organization grant permits
  // a non-Owner to prepare an unfinished draft. Legacy company "admin" is
  // not a role and must never inherit this new permission.
  if(action==="store.application.draft.manage")
    return role==="member" && auditedMemberGrant===true
  if(role==="member" || role==="admin")return !["invitation.manage","membership.manage","membership.list","audit.timeline.read","price.group.manage","store.follow"].includes(action) &&
    auditedMemberGrant===true
  return false
}

/** Checkout receives this same immutable Owner-policy decision and MUST still
 * apply fresh Person, Organization, Store and payment/checkout gates in SQL.
 */
export const ownerRoleAllows=(action:OrganizationAction):boolean =>
  organizationActionAllowed("owner",action,true,false)
