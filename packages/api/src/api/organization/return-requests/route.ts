import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, enabled, sessionToken } from "../../personal/security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import { nativeSellerTradingAt } from "../../../modules/dogruadres-access/native-seller-trading"

/**
 * #377 Buyer Organization Returns read (source-only phase).
 *
 * Mercur 2.4.1 vendor returns use Medusa 2.22.3's native `return`
 * entity with an `order_id`. The historical storefront's loose
 * `returnRequest` SDK type is NOT an approved backend route or join.
 *
 * Never query a Return before verifying that its native Order belongs to
 * this Customer, has an unambiguous Store, a completed Cart and the
 * current immutable Buyer Organization attribution.
 */
export const AUTHENTICATE = false

const selection = z.object({
  organization_id: z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  seller_id: z.string().regex(/^sel_[A-Za-z0-9_-]+$/),
  page: z.enum(["0", "1", "2", "3", "4"]).optional(),
}).strict()

const personId = /^daprs_[A-Za-z0-9_-]+$/
const customerIdPattern = /^cus_[A-Za-z0-9_-]+$/
const orderId = /^order_[A-Za-z0-9_-]+$/
const cartIdPattern = /^cart_[A-Za-z0-9_-]+$/
const returnId = /^return_[A-Za-z0-9_-]+$/
const validReturnStatus = new Set([
  "open", "requested", "received", "partially_received", "canceled",
])
const MAX_ORDERS = 20
const MAX_RETURNS_PER_ORDER = 20

type OrderRow = { id: string; customer_id?: string | null; status: string }
type LinkRow = { order_id?: string; seller_id?: string; cart_id?: string }
type ReturnRow = {
  id: string; order_id: string; status: string; created_at?: string | Date | null
}
type ReturnSummary = { id: string; status: string; created_at: string }

type QueryGraph = {
  graph(input: object): Promise<{ data: unknown; metadata?: { count?: number } }>
}

const exactlyOne = <T>(rows: T[] | unknown): rows is T[] =>
  Array.isArray(rows) && rows.length === 1

const validDate = (value: unknown): string | null => {
  if (!(value instanceof Date) && typeof value !== "string") return null
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return value instanceof Date ? value.toISOString() : value
}

/** Never accept authorization or seller identity through a native bearer header. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("Vary", "Cookie")
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Content-Type-Options", "nosniff")

  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  const parsed = selection.safeParse(req.query)
  if (!parsed.success || req.headers.authorization !== undefined ||
      req.headers["x-seller-id"] !== undefined)
    return res.status(400).json({ message: "Invalid context" })

  const token = sessionToken(req)
  const denied = () => res.status(403).json({ message: "Access denied" })
  if (!token) return denied()

  const { organization_id: organizationId, seller_id: sellerId } = parsed.data
  const page = Number(parsed.data.page ?? "0")

  try {
    const foundation = access(req)
    const buyer = await foundation.personalBuyerOrganization(token, organizationId)
    if (!buyer || buyer.organization_id !== organizationId ||
        typeof buyer.person_id !== "string" || !personId.test(buyer.person_id))
      return denied()

    // A native Customer is only the verified adapter to the canonical Person.
    const binding = await foundation.personalActorBinding(token, "customer")
    const customerId = binding?.actor_id
    if (!binding || binding.revoked_at || binding.person_id !== buyer.person_id ||
        typeof customerId !== "string" || !customerIdPattern.test(customerId))
      return denied()

    const customers = req.scope.resolve<{
      listCustomers(input: object): Promise<Array<{ id: string }>>
    }>("customer")
    const firstCustomer = await customers.listCustomers({ id: customerId })
    if (!exactlyOne<{ id: string }>(firstCustomer) ||
        firstCustomer[0]?.id !== customerId) return denied()

    const seller = req.scope.resolve<{
      listSellers(input: object, config?: object): Promise<Array<{
        id: string; status: unknown; approved_at?: Date | string | null
        closed_from?: Date | string | null; closed_to?: Date | string | null
      }>>
    }>("seller")
    const nativeSellers = await seller.listSellers({ id: sellerId }, { take: 2 })
    if (!exactlyOne(nativeSellers) || nativeSellers[0]?.id !== sellerId ||
        !nativeSellerTradingAt(nativeSellers[0]) ||
        !await foundation.storeOwnerPauseAcceptingOrders([sellerId]))
      return denied()

    // Foundation checks the legal Organization→Store association and the
    // Store's current buyer block. Neither native Seller nor Customer alone
    // is an authorization grant.
    const storeDecision = await foundation.personalStoreBuyerBlockDecision(
      token, organizationId, [sellerId])
    if (storeDecision?.ownership_verified !== true ||
        storeDecision.blocked !== false) return denied()

    const carts = req.scope.resolve<{
      listCarts(input: object): Promise<Array<{
        id: string; customer_id?: string | null
        completed_at?: Date | string | null
      }>>
    }>("cart")
    const query = req.scope.resolve<QueryGraph>("query")

    // Inspect at most a single bounded, stable Customer-order window.
    // No global Return/other Customer list or client-controlled native fields.
    const orderResult = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "status"],
      filters: { customer_id: customerId },
      pagination: { take: MAX_ORDERS, skip: page * MAX_ORDERS, order: { id: "ASC" } },
    })
    const orderRows = orderResult.data as OrderRow[]
    if (!Array.isArray(orderRows) || orderRows.length > MAX_ORDERS ||
        new Set(orderRows.map(o => o?.id)).size !== orderRows.length)
      return denied()

    const summaries: ReturnSummary[] = []
    const seen = new Set<string>()
    const attributedCarts = new Set<string>()
    const verifiedOrderCarts = new Map<string, string>()
    // Snapshot exactly which Return rows were authorized for each native Order.
    const verifiedOrderReturns = new Map<string, ReturnSummary[]>()
    for (const order of orderRows) {
      if (!order || !orderId.test(order.id) ||
          order.customer_id !== customerId ||
          !["completed", "pending"].includes(order.status))
        return denied()

      const sellerLinks = (await query.graph({
        entity: "order_seller", fields: ["order_id", "seller_id"],
        filters: { order_id: order.id },
      })).data as LinkRow[]
      // A Return belonging to an ambiguously multi-Seller order is not
      // attributable to one Store until the actual line mapping is proved.
      if (!exactlyOne<LinkRow>(sellerLinks) ||
          sellerLinks[0].order_id !== order.id ||
          typeof sellerLinks[0].seller_id !== "string")
        return denied()
      if (sellerLinks[0].seller_id !== sellerId) continue

      const cartLinks = (await query.graph({
        entity: "order_cart", fields: ["order_id", "cart_id"],
        filters: { order_id: order.id },
      })).data as LinkRow[]
      if (!exactlyOne<LinkRow>(cartLinks) ||
          cartLinks[0].order_id !== order.id ||
          typeof cartLinks[0].cart_id !== "string" ||
          !cartIdPattern.test(cartLinks[0].cart_id)) return denied()
      const cartId = cartLinks[0].cart_id
      const nativeCarts = await carts.listCarts({ id: cartId, customer_id: customerId })
      if (!exactlyOne(nativeCarts) || nativeCarts[0].id !== cartId ||
          nativeCarts[0].customer_id !== customerId ||
          nativeCarts[0].completed_at == null) return denied()

      if (await foundation.personalBuyerCartAttribution(
        token, organizationId, cartId, customerId) !== true) continue
      attributedCarts.add(cartId)
      verifiedOrderCarts.set(order.id, cartId)

      // Only now read returns of this verified Customer+Store+Org order.
      const result = await query.graph({
        entity: "return",
        fields: ["id", "order_id", "status", "created_at"],
        filters: { order_id: order.id },
        pagination: { take: MAX_RETURNS_PER_ORDER + 1 },
      })
      const rows = result.data as ReturnRow[]
      if (!Array.isArray(rows) || rows.length > MAX_RETURNS_PER_ORDER ||
          (typeof result.metadata?.count === "number" &&
           result.metadata.count > MAX_RETURNS_PER_ORDER)) return denied()
      const projectedRows: ReturnSummary[] = []
      for (const row of rows) {
        const createdAt = validDate(row?.created_at)
        if (!row || typeof row.id !== "string" || !returnId.test(row.id) ||
            seen.has(row.id) || row.order_id !== order.id ||
            !validReturnStatus.has(row.status) || createdAt === null)
          return denied()
        seen.add(row.id)
        const projected = { id: row.id, status: row.status, created_at: createdAt }
        summaries.push(projected)
        projectedRows.push(projected)
      }
      verifiedOrderReturns.set(order.id, projectedRows)
    }

    // Fail closed on a Store/Cart relink after the private Return read.
    // A prior Seller or Cart attribution is not a response-time grant.
    for (const [verifiedOrderId, verifiedCartId] of verifiedOrderCarts) {
      const sellerLinksNow = (await query.graph({
        entity: "order_seller", fields: ["order_id", "seller_id"],
        filters: { order_id: verifiedOrderId },
      })).data as LinkRow[]
      if (!exactlyOne<LinkRow>(sellerLinksNow) ||
          sellerLinksNow[0].order_id !== verifiedOrderId ||
          sellerLinksNow[0].seller_id !== sellerId) return denied()
      const cartLinksNow = (await query.graph({
        entity: "order_cart", fields: ["order_id", "cart_id"],
        filters: { order_id: verifiedOrderId },
      })).data as LinkRow[]
      if (!exactlyOne<LinkRow>(cartLinksNow) ||
          cartLinksNow[0].order_id !== verifiedOrderId ||
          cartLinksNow[0].cart_id !== verifiedCartId) return denied()
      const cartNow = await carts.listCarts({
        id: verifiedCartId, customer_id: customerId,
      })
      if (!exactlyOne(cartNow) || cartNow[0].id !== verifiedCartId ||
          cartNow[0].customer_id !== customerId ||
          cartNow[0].completed_at == null) return denied()
    }

    // Revalidate at the response boundary. A role, native binding, buyer
    // block or Cart attribution revoked mid-read must never produce rows.
    const current = await foundation.personalBuyerOrganization(token, organizationId)
    const bound = await foundation.personalActorBinding(token, "customer")
    if (!current || current.person_id !== buyer.person_id ||
        current.organization_id !== organizationId ||
        !bound || bound.revoked_at || bound.person_id !== buyer.person_id ||
        bound.actor_id !== customerId || bound.id !== binding.id ||
        bound.auth_identity_id !== binding.auth_identity_id) return denied()
    const verifiedCustomer = await customers.listCustomers({ id: customerId })
    if (!exactlyOne<{ id: string }>(verifiedCustomer) ||
        verifiedCustomer[0].id !== customerId) return denied()
    const finalSeller = await seller.listSellers({ id: sellerId }, { take: 2 })
    if (!exactlyOne(finalSeller) || finalSeller[0].id !== sellerId ||
        !nativeSellerTradingAt(finalSeller[0]) ||
        !await foundation.storeOwnerPauseAcceptingOrders([sellerId])) return denied()
    const finalStore = await foundation.personalStoreBuyerBlockDecision(
      token, organizationId, [sellerId])
    if (finalStore?.ownership_verified !== true || finalStore.blocked !== false)
      return denied()
    for (const cartId of attributedCarts) {
      if (await foundation.personalBuyerCartAttribution(
        token, organizationId, cartId, customerId) !== true) return denied()
    }

    // Last private-data gate: do not trust the earlier Order→Customer or
    // Return→Order association after Store/Cart/BuyerOrg checks await I/O.
    // Requery only bounded, previously authorized native Orders and Returns;
    // missing/relinked/new/changed Return rows fail closed without any DTO.
    // This is a response-bound read consistency check, not a DB snapshot/lock.
    for (const [verifiedOrderId, projectedRows] of verifiedOrderReturns) {
      const currentOrder = await query.graph({
        entity: "order",
        fields: ["id", "customer_id", "status"],
        filters: { id: verifiedOrderId },
        pagination: { take: 2 },
      })
      if (!exactlyOne<OrderRow>(currentOrder.data) ||
          currentOrder.data[0]?.id !== verifiedOrderId ||
          currentOrder.data[0]?.customer_id !== customerId ||
          !["completed", "pending"].includes(currentOrder.data[0]?.status))
        return denied()

      const latestReturns = await query.graph({
        entity: "return",
        fields: ["id", "order_id", "status", "created_at"],
        filters: { order_id: verifiedOrderId },
        pagination: { take: MAX_RETURNS_PER_ORDER + 1 },
      })
      const latestRows = latestReturns.data as ReturnRow[]
      if (!Array.isArray(latestRows) ||
          latestRows.length !== projectedRows.length ||
          latestRows.length > MAX_RETURNS_PER_ORDER ||
          (typeof latestReturns.metadata?.count === "number" &&
           latestReturns.metadata.count > MAX_RETURNS_PER_ORDER))
        return denied()

      const expected = new Map(projectedRows.map(row => [row.id, row]))
      const rechecked = new Set<string>()
      for (const row of latestRows) {
        const saved = row && expected.get(row.id)
        if (!saved || rechecked.has(row.id) ||
            row.order_id !== verifiedOrderId ||
            row.status !== saved.status ||
            validDate(row.created_at) !== saved.created_at)
          return denied()
        rechecked.add(row.id)
      }
    }

    summaries.sort((a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      a.id.localeCompare(b.id))
    return res.status(200).json({
      organization_id: organizationId, seller_id: sellerId,
      return_requests: summaries, page,
    })
  } catch (error) {
    if (error instanceof IdentityAccessDenied) return denied()
    return res.status(503).json({ message: "Service unavailable" })
  }
}
