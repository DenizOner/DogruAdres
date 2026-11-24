/**
 * #486 / #377: Organization-scoped Return Requests read route — multi-tenant isolation tests.
 * Verifies that /organization/return-requests enforces strict multi-tenant isolation,
 * fails closed on cross-organization access attempts, redacts errors, and rejects forged contexts.
 */
import { GET } from "../return-requests/route"
import { access, enabled, sessionToken } from "../../personal/security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

jest.mock("../../personal/security", () => ({
  access: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("Organization Return Requests — Multi-tenant Isolation & Security Contract", () => {
  const person = "daprs_person_a", customer = "cus_customer_shared"
  const orgA = "daorg_buyer_a", orgB = "daorg_buyer_b"
  const sellerA = "sel_store_a", sellerB = "sel_store_b"
  const dateA = "2026-11-19T10:00:00.000Z", dateB = "2026-11-20T10:00:00.000Z"
  const orders = [
    { id: "order_a", customer_id: customer, status: "completed" },
    { id: "order_b", customer_id: customer, status: "completed" },
  ]
  let req: any, res: any, svc: any, graph: jest.Mock
  let sellers: any[], cartRows: any[], customerRows: any[]
  let orderSellers: Record<string, any[]>
  let orderCarts: Record<string, any[]>
  let returns: Record<string, any[]>

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("signed-synthetic-session")
    svc = {
      personalBuyerOrganization: jest.fn(async (_token: string, org: string) =>
        org === orgA || org === orgB ? { person_id: person, organization_id: org } : null),
      personalActorBinding: jest.fn(async () =>
        ({ person_id: person, actor_id: customer, revoked_at: null })),
      personalBuyerCartAttribution: jest.fn(async (_token: string, org: string, cartId: string) =>
        (org === orgA && cartId === "cart_a") ||
        (org === orgB && cartId === "cart_b")),
      personalStoreBuyerBlockDecision: jest.fn(async (_token: string, org: string, ids: string[]) =>
        ({ ownership_verified: true, blocked: !(
          (org === orgA && ids[0] === sellerA) ||
          (org === orgB && ids[0] === sellerB)) })),
      storeOwnerPauseAcceptingOrders: jest.fn(async () => true),
    }
    ;(access as jest.Mock).mockReturnValue(svc)
    sellers = [
      { id: sellerA, status: "open", approved_at: dateA },
      { id: sellerB, status: "open", approved_at: dateA },
    ]
    customerRows = [{ id: customer }]
    cartRows = [
      { id: "cart_a", customer_id: customer, completed_at: dateA },
      { id: "cart_b", customer_id: customer, completed_at: dateB },
    ]
    orderSellers = {
      order_a: [{ order_id: "order_a", seller_id: sellerA }],
      order_b: [{ order_id: "order_b", seller_id: sellerB }],
    }
    orderCarts = {
      order_a: [{ order_id: "order_a", cart_id: "cart_a" }],
      order_b: [{ order_id: "order_b", cart_id: "cart_b" }],
    }
    returns = {
      order_a: [{ id: "return_a", order_id: "order_a", status: "requested", created_at: dateA }],
      order_b: [{ id: "return_b", order_id: "order_b", status: "received", created_at: dateB }],
    }
    graph = jest.fn(async ({ entity, filters }: any) => {
      if (entity === "order") return { data: filters.id
        ? orders.filter(o => o.id === filters.id)
        : orders.filter(o => o.customer_id === filters.customer_id) }
      if (entity === "order_seller") return { data: orderSellers[filters.order_id] ?? [] }
      if (entity === "order_cart") return { data: orderCarts[filters.order_id] ?? [] }
      if (entity === "return") return { data: returns[filters.order_id] ?? [] }
      throw Error("unexpected graph entity")
    })
    req = {
      query: { organization_id: orgA, seller_id: sellerA },
      headers: {},
      scope: { resolve: jest.fn((key: string) => {
        if (key === "customer") return {
          listCustomers: jest.fn(async () => customerRows),
        }
        if (key === "seller") return {
          listSellers: jest.fn(async ({ id }: any) => sellers.filter(s => s.id === id)),
        }
        if (key === "cart") return {
          listCarts: jest.fn(async ({ id }: any) => cartRows.filter(c => c.id === id)),
        }
        if (key === "query") return { graph }
        throw Error("unexpected private module")
      }) },
    }
    res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() }
    res.status.mockReturnValue(res)
    res.json.mockReturnValue(res)
  })

  it("200: same Person/Customer sees only selected Org A Store A return, minimal no-store DTO", async () => {
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id: orgA, seller_id: sellerA,
      return_requests: [{ id: "return_a", status: "requested", created_at: dateA }],
      page: 0,
    })
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(svc.personalActorBinding).toHaveBeenCalledTimes(2)
    expect(svc.personalBuyerCartAttribution).toHaveBeenCalledTimes(2)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store")
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Cookie")
    expect(res.setHeader).toHaveBeenCalledWith("X-Robots-Tag", "noindex, nofollow, noarchive")
    const body = JSON.stringify(res.json.mock.lastCall?.[0])
    for (const hidden of [person, customer, "cart_a", "order_a", "return_b",
      "payment", "shipping_address", "metadata", "audit"]) {
      expect(body).not.toContain(hidden)
    }
    const returnQueries = graph.mock.calls.filter(([q]) => q.entity === "return")
    expect(returnQueries).toHaveLength(2)
    expect(returnQueries[0][0].filters).toEqual({ order_id: "order_a" })
  })

  it("200: same Person/Customer switches to Org B Store B without Org A return", async () => {
    req.query = { organization_id: orgB, seller_id: sellerB }
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id: orgB, seller_id: sellerB,
      return_requests: [{ id: "return_b", status: "received", created_at: dateB }],
      page: 0,
    })
    const ret = graph.mock.calls.filter(([q]) => q.entity === "return")
    expect(ret).toHaveLength(2)
    expect(ret[0][0].filters.order_id).toBe("order_b")
  })

  it("403: cross-Org Store selector cannot reach private native graph", async () => {
    req.query = { organization_id: orgB, seller_id: sellerA }
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({ message: "Access denied" })
    expect(graph).not.toHaveBeenCalled()
  })

  it("403: foreign, revoked Person/Customer and missing session reject before native reads", async () => {
    for (const change of [
      () => svc.personalBuyerOrganization.mockResolvedValue(null),
      () => svc.personalActorBinding.mockResolvedValue({ person_id: "daprs_foreign", actor_id: customer }),
      () => svc.personalActorBinding.mockResolvedValue({ person_id: person, actor_id: customer, revoked_at: dateA }),
      () => (sessionToken as jest.Mock).mockReturnValue(""),
    ]) {
      jest.clearAllMocks()
      ;(sessionToken as jest.Mock).mockReturnValue("signed-synthetic-session")
      svc.personalBuyerOrganization.mockResolvedValue({ person_id: person, organization_id: orgA })
      svc.personalActorBinding.mockResolvedValue({ person_id: person, actor_id: customer, revoked_at: null })
      change()
      await GET(req, res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(graph).not.toHaveBeenCalled()
    }
  })

  it("400: forged query, extra fields, bearer and Seller header never call graph", async () => {
    const input = [
      { query: { organization_id: [orgA], seller_id: sellerA }, headers: {} },
      { query: { organization_id: orgA, seller_id: sellerA, fields: "*" }, headers: {} },
      { query: { organization_id: orgA, seller_id: sellerA, page: "999" }, headers: {} },
      { query: { organization_id: orgA, seller_id: sellerA }, headers: { authorization: "Bearer spoof" } },
      { query: { organization_id: orgA, seller_id: sellerA }, headers: { "x-seller-id": sellerB } },
    ]
    for (const row of input) {
      req.query = row.query
      req.headers = row.headers
      await GET(req, res)
      expect(res.status).toHaveBeenLastCalledWith(400)
      expect(graph).not.toHaveBeenCalled()
    }
  })

  it("missing Cart attribution hides all foreign Org return rows (returns empty list)", async () => {
    svc.personalBuyerCartAttribution.mockResolvedValue(false)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({ return_requests: [] }))
    expect(graph.mock.calls.filter(([q]) => q.entity === "return")).toHaveLength(0)
  })

  it("403: duplicate/ambiguous order-to-Cart and order-to-Store links fail closed", async () => {
    orderCarts.order_a.push({ order_id: "order_a", cart_id: "cart_foreign" })
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    orderCarts.order_a.splice(1)
    orderSellers.order_a.push({ order_id: "order_a", seller_id: sellerB })
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })

  it("403: malformed or cross-order Return rows reject without private DTO", async () => {
    for (const bad of [
      { id: "return_bad", order_id: "order_foreign", status: "requested", created_at: dateA },
      { id: "return_a", order_id: "order_a", status: "supersecret", created_at: dateA },
      { id: "return_a", order_id: "order_a", status: "requested", created_at: "invalid" },
    ]) {
      returns.order_a = [bad]
      await GET(req, res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith({ message: "Access denied" })
    }
  })

  it("403: revocation between native reads and response cannot return cached rows", async () => {
    svc.personalBuyerOrganization
      .mockResolvedValueOnce({ person_id: person, organization_id: orgA })
      .mockResolvedValueOnce(null)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(JSON.stringify(res.json.mock.lastCall?.[0])).not.toContain("return_a")
  })

  it("403: revocation of Cart attribution at response boundary", async () => {
    svc.personalBuyerCartAttribution.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })

  it("503: internal native failures return generic errors without leaking headers or IDs", async () => {
    graph.mockRejectedValue(new Error("SECRET customer email and audit payload"))
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({ message: "Service unavailable" })
    expect(JSON.stringify(res.json.mock.lastCall?.[0])).not.toContain("SECRET")
  })

  it("503: disabled feature and failed identity service do not unlock legacy native return routes", async () => {
    ;(enabled as jest.Mock).mockReturnValue(false)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(graph).not.toHaveBeenCalled()
    ;(enabled as jest.Mock).mockReturnValue(true)
    svc.personalBuyerOrganization.mockRejectedValue(new IdentityAccessDenied())
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })
})
