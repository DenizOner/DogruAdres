import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE = false

/**
 * B22 initial read-only legal Organization -> marketplace Seller view.
 * No native JWT leaves the server. Never use a native SellerMember join as
 * proof of legal ownership. No purchase, Store mutation or grant is exposed.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  const organization = req.query.organization
  if (Object.keys(req.query).some(k => k !== "organization") ||
      typeof organization !== "string" ||
      !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(organization) ||
      req.headers["x-seller-id"] !== undefined)
    return res.status(400).json({ message: "Invalid context" })
  const svc = access(req), token = sessionToken(req)
  try {
    const decision = await svc.personalLegalSellerIds(token, organization)
    if (!decision) return res.status(403).json({ message: "Access denied" })
    const binding = await svc.personalActorBinding(token, "member")
    if (!binding || binding.revoked_at || binding.person_id !== decision.person_id)
      return res.status(403).json({ message: "Access denied" })

    // No early disclosure: all native reads use project-owned candidate IDs
    // and fresh module service, rather than cached vendor Query authorization.
    const native = req.scope.resolve<{
      listMembers(filters: object): Promise<any[]>
      listSellerMembers(filters: object): Promise<any[]>
      listSellers(filters: object): Promise<any[]>
    }>("seller")
    const members = await native.listMembers({ id: binding.actor_id, is_active: true })
    if (members.length !== 1) return res.status(403).json({ message: "Access denied" })
    const sellers: { id: string; name: string }[] = []
    for (const id of decision.seller_ids) {
      const [relations, accounts] = await Promise.all([
        native.listSellerMembers({ member_id: binding.actor_id, seller_id: id }),
        native.listSellers({ id })
      ])
      // A current native SellerMember is technical access, not legal owner proof.
      if (relations.length !== 1 || accounts.length !== 1 ||
          accounts[0].id !== id || accounts[0].status !== "open") continue
      sellers.push({ id, name: String(accounts[0].name ?? "") })
    }
    // Revocation, Organization switch, ownership reassignment and session
    // expiry between module reads must not reveal a stale scope.
    const final = await svc.personalLegalSellerIds(token, organization)
    if (!final || final.person_id !== decision.person_id ||
        final.seller_ids.length !== decision.seller_ids.length ||
        final.seller_ids.some((id,i) => id !== decision.seller_ids[i]))
      return res.status(403).json({ message: "Access denied" })
    return res.status(200).json({ organization_id: organization, stores: sellers })
  } catch (e) {
    if (e instanceof IdentityAccessDenied) return res.status(403).json({ message: "Access denied" })
    return res.status(503).json({ message: "Unavailable" })
  }
}
