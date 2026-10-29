import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from "./identity-session"

/**
 * Foundation read of platform-approved Organization→Seller association. Never creates a grant.
 * The returned IDs are INTERNAL CANDIDATES, not client entitlements. A caller
 * must still verify native Member/SellerMember + live Seller for each ID.
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
  const rows = await db.execute(
    `select seller_id from da_organization_seller_ownership
       where organization_id=? and revoked_at is null
       order by seller_id`, [organizationId]
  ) as { seller_id: unknown }[]
  // A broken projection or unbounded platform association fails closed, not truncated.
  if (rows.length > 50 || rows.some(r => typeof r.seller_id !== "string" ||
        !/^sel_[A-Za-z0-9_-]+$/.test(r.seller_id as string)) ||
      new Set(rows.map(r => r.seller_id)).size !== rows.length)
    throw new IdentityAccessDenied()
  return { person_id: result.person_id, organization_id: organizationId,
    seller_ids: rows.map(r => r.seller_id as string) }
}
