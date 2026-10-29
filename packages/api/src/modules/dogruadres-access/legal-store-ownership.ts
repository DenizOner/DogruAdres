import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from "./identity-session"

/**
 * Physical approval read only. Do not trust a row's "verified_at" or an arbitrary
 * audit FK as platform approval: the canonical event must match the SAME
 * Organization, Seller and approved action, with an atomic source outbox row.
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
         and e.action='organization.store_association_approved'
         and e.module='dogruadres-access' and e.resource='store-association'
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
 * Foundation Person/Organization authority THEN physical platform approval.
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
