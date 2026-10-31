import { IdentityAccessDenied, IdentitySessions, isCurrentProtectedOwner, type SecuritySql } from "./identity-session"

/** Explicit non-Owner Organization buyer permission with its
 * canonical audit/outbox. Protected Owner is verified separately.
 * Buyer checkout MUST still validate native Customer, cart, every Store block
 * and final revocation separately. No checkout writes in this module.
 */
export async function verifiedBuyerPurchaseGrant(
  db:SecuritySql,personId:string,organizationId:string
):Promise<boolean>{
  if(!/^daprs_[A-Za-z0-9_-]+$/.test(personId)||
     !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId))throw new IdentityAccessDenied()
  const rows=await db.execute(`select g.id from da_organization_buyer_permission g
    join da_audit_event e on e.id=g.source_audit_event_id
      and e.deleted_at is null and e.module='dogruadres-access'
      and e.actor_person_id=g.issued_by_person_id
      and e.organization_id=g.organization_id
      and e.target_id=g.person_id
      and e.action='organization.buyer_permission_granted'
      and e.resource='buyer-permission'
      and e.new_values->>'grant_id'=g.id
      and e.new_values->>'person_id'=g.person_id
      and e.new_values->>'permission'=g.permission
    where g.person_id=? and g.organization_id=?
      and g.permission='buyer.purchase' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at>statement_timestamp())
      and exists(select 1 from da_audit_outbox x
         where x.source_audit_event_id=e.id
           and x.source_module='dogruadres-access' and x.deleted_at is null)`,
    [personId,organizationId]) as {id:unknown}[]
  if(rows.length>1||rows.some(row=>typeof row.id!=="string"||
     !/^dabpg_[A-Za-z0-9_-]+$/.test(row.id as string)))throw new IdentityAccessDenied()
  return rows.length===1
}

/** Foundation-only candidate. NOT permission to complete a Mercur cart. */
export async function authorizedBuyerOrganization(
  db:SecuritySql,token:string,organizationId:string
):Promise<{person_id:string;organization_id:string}|null>{
  if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId))
    throw new IdentityAccessDenied()
  const membership=await new IdentitySessions(db).organizations(token,organizationId,false)
  if(!membership||membership.organizations.length!==1||
     membership.organizations[0].id!==organizationId)return null
  const owner=membership.organizations[0].role==="owner" &&
    await isCurrentProtectedOwner(db,membership.person_id,organizationId)
  if(!owner&&!await verifiedBuyerPurchaseGrant(db,membership.person_id,organizationId))return null
  return {person_id:membership.person_id,organization_id:organizationId}
}
