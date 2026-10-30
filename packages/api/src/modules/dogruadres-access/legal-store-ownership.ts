import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from "./identity-session"

/**
 * Store-to-Organization origin read. New applications are connected during
 * Owner submission, NEVER via an extra staff approval. Native Seller approval
 * remains separate. Preserve historical already-recorded association events
 * without backfilling or widening access. All events need source outbox.
 * This read is NOT a Person permission grant or a legal ownership judgment.
 */
export async function platformApprovedSellerIds(db: SecuritySql, organizationId: string): Promise<string[]> {
  const rows = await db.execute(
    `select o.seller_id
       from da_organization_seller_ownership o
       join da_audit_event e
         on e.id=o.verification_audit_event_id
         and e.deleted_at is null
         and e.organization_id=o.organization_id and e.target_id=o.seller_id
         and e.module='dogruadres-access'
         and ((e.action='organization.store_application_created'
           and e.resource='store-application'
           and exists (select 1 from da_store_application a
             where a.id=(e.new_values->>'application_id')
               and a.organization_id=o.organization_id and a.seller_id=o.seller_id
               and a.status='created' and a.person_id=e.actor_person_id))
          or (e.action='organization.store_association_approved'
           and e.resource='store-association'))
       where o.organization_id=? and o.revoked_at is null
         and exists (select 1 from da_audit_outbox x
           where x.source_audit_event_id=e.id
             and x.source_module='dogruadres-access' and x.deleted_at is null)
       order by o.seller_id`, [organizationId]
  ) as { seller_id: unknown }[]
  if (rows.length>50 || rows.some(r=>typeof r.seller_id!=="string" ||
      !/^sel_[A-Za-z0-9_-]+$/.test(r.seller_id as string)) ||
      new Set(rows.map(r=>r.seller_id)).size!==rows.length)
    throw new IdentityAccessDenied()
  return rows.map(r=>r.seller_id as string)
}

/**
 * Foundation Person/Organization authority THEN direct Store origin.
 * These are INTERNAL CANDIDATES, not native Seller operation permissions.
 * A caller must additionally verify live native Member/SellerMember + Seller.
 */
export async function authorizedLegalSellerIds(
  db: SecuritySql,
  token: string,
  organizationId: string
): Promise<{ person_id: string; organization_id: string; seller_ids: string[] } | null> {
  if (!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId)) throw new IdentityAccessDenied()
  const result = await new IdentitySessions(db).organizations(token, organizationId)
  if (!result || result.organizations.length !== 1 ||
      !["owner","admin"].includes(result.organizations[0].role)) return null
  const seller_ids = await platformApprovedSellerIds(db, organizationId)
  return { person_id: result.person_id, organization_id: organizationId, seller_ids }
}

/** B22 native-product authorization prerequisite: the only positive action
 * proof is an explicitly assigned, current Foundation record WITH its matching
 * canonical audit/outbox. A Store association, native owner flag or role alone
 * must never become products.edit. This function does NOT run native workflows.
 */
export async function verifiedStoreProductEditGrant(
  db: SecuritySql, personId: string, organizationId: string, sellerId: string
): Promise<boolean> {
  if (!/^daprs_[A-Za-z0-9_-]+$/.test(personId) ||
      !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId) ||
      !/^sel_[A-Za-z0-9_-]+$/.test(sellerId)) throw new IdentityAccessDenied()
  const rows=await db.execute(`
    select g.id from da_store_product_permission g
    join da_audit_event e on e.id=g.source_audit_event_id
      and e.deleted_at is null
      and e.actor_person_id=g.issued_by_person_id
      and e.organization_id=g.organization_id and e.target_id=g.seller_id
      and e.module='dogruadres-access'
      and e.action='organization.store_product_permission_granted'
      and e.resource='store-product-permission'
      and e.new_values->>'grant_id'=g.id
      and e.new_values->>'person_id'=g.person_id
      and e.new_values->>'permission'=g.permission
    where g.person_id=? and g.organization_id=? and g.seller_id=?
      and g.permission='products.edit' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at>statement_timestamp())
      and exists (select 1 from da_audit_outbox x
        where x.source_audit_event_id=e.id
          and x.source_module='dogruadres-access' and x.deleted_at is null)
  `,[personId,organizationId,sellerId]) as {id:unknown}[]
  if(rows.length>1 || rows.some(r=>typeof r.id!=="string" ||
    !/^daspg_[A-Za-z0-9_-]+$/.test(r.id as string)))throw new IdentityAccessDenied()
  return rows.length===1
}

/** Fresh Person -> active Organization -> verified Store origin -> explicit
 * action grant. A caller MUST separately check live native Member/SellerMember
 * and approved Seller status immediately before a protected product workflow.
 * Do not treat this read as permission for a browser/native Vendor route.
 */
export async function authorizedProductEditScope(
  db:SecuritySql,token:string,organizationId:string,sellerId:string
):Promise<{person_id:string;organization_id:string;seller_id:string}|null>{
  if(!/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organizationId) ||
     !/^sel_[A-Za-z0-9_-]+$/.test(sellerId))throw new IdentityAccessDenied()
  const member=await new IdentitySessions(db).organizations(token,organizationId)
  if(!member || member.organizations.length!==1 ||
     member.organizations[0].id!==organizationId)return null
  const stores=await platformApprovedSellerIds(db,organizationId)
  if(!stores.includes(sellerId))return null
  if(!await verifiedStoreProductEditGrant(db,member.person_id,organizationId,sellerId))return null
  return {person_id:member.person_id,organization_id:organizationId,seller_id:sellerId}
}
