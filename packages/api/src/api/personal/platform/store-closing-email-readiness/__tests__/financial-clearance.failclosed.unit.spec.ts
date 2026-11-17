import { GET } from "../route"
import { access, enabled, sessionToken } from "../../../security"
import { verifiedEmailForActorContext } from "../../../../dogruadres/invitations/accept/route"

jest.mock("../../../security", () => ({
  access: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))
jest.mock("../../../../dogruadres/invitations/accept/route", () => ({
  verifiedEmailForActorContext: jest.fn(),
}))

/**
 * #363 / B22-05: this is a route-level MOCK test, not evidence of real
 * PostgreSQL, banking reconciliation, legal clearance or email delivery.
 * A completed 30-day timer and an empty native order query must NEVER
 * manufacture permission to finalize a Store or release Seller identity.
 */
describe("B22-05 Staff closing financial/legal preflight (mock-only, fail closed)", () => {
  const organization_id = "daorg_alpha"
  const seller_id = "sel_alpha"
  const token = "fixture-opaque-staff-session"
  const preflight = () => ({
    appeal_window_elapsed: true,
    appeal_review_pending: false,
    appeal_accepted: false,
    notification_exception_review_required: false,
    financial_legal_clearance_verified: false,
    permanent_finalization_enabled: false,
  })

  let req: any
  let res: any
  let service: any
  let native: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    native = {
      listOrderGroups: jest.fn().mockResolvedValue([]),
    }
    service = {
      personalPlatformStoreClosingEmailAudience: jest.fn().mockResolvedValue([]),
      personalPlatformStoreClosingEmailProgress: jest.fn().mockResolvedValue({
        deadline_started_at: "2026-10-01T00:00:00.000Z",
        deadline_basis: "owner_delivery",
        admin_alert_at: null,
        owners: [],
        delivery_verified_count: 0,
        terminal_preflight: preflight(),
      }),
      getActiveSmtpConfig: jest.fn().mockResolvedValue({ enabled: false }),
    }
    ;(access as jest.Mock).mockReturnValue(service)
    req = {
      headers: {},
      query: { organization_id, seller_id },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key !== "seller") throw new Error("Unexpected module")
          return native
        }),
      },
    }
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
  })

  function lastPayload() {
    return res.json.mock.lastCall?.[0]
  }

  it("never converts zero native OrderGroups or elapsed deadline into financial/legal clearance", async () => {
    await GET(req, res)
    expect(native.listOrderGroups).toHaveBeenCalledWith({ seller_id }, { take: 1 })
    expect(service.personalPlatformStoreClosingEmailProgress).toHaveBeenCalledWith(
      token, organization_id, seller_id
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(lastPayload()).toEqual(expect.objectContaining({
      deadline_started: true,
      native_order_history_observed: false,
      permanent_finalization_enabled: false,
      terminal_preflight: expect.objectContaining({
        appeal_window_elapsed: true,
        financial_legal_clearance_verified: false,
        permanent_finalization_enabled: false,
      }),
    }))
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store")
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Cookie")
  })

  it("observes native historical order presence without claiming that refunds or debts cleared", async () => {
    native.listOrderGroups.mockResolvedValue([{ id: "og_order_history" }])
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(lastPayload()).toEqual(expect.objectContaining({
      native_order_history_observed: true,
      permanent_finalization_enabled: false,
      terminal_preflight: expect.objectContaining({
        financial_legal_clearance_verified: false,
        permanent_finalization_enabled: false,
      }),
    }))
  })

  it("rejects a revoked or unrelated Staff scope before reading a Seller's OrderGroups", async () => {
    service.personalPlatformStoreClosingEmailAudience.mockResolvedValue(null)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(lastPayload()).toEqual({ message: "Access denied" })
    expect(req.scope.resolve).not.toHaveBeenCalled()
    expect(native.listOrderGroups).not.toHaveBeenCalled()
    expect(service.personalPlatformStoreClosingEmailProgress).not.toHaveBeenCalled()
  })

  it("rechecks Staff/Seller permission AFTER a native read and leaks no aggregate on revocation", async () => {
    native.listOrderGroups.mockResolvedValue([{ id: "og_private" }])
    service.personalPlatformStoreClosingEmailProgress.mockResolvedValue(null)
    await GET(req, res)
    expect(native.listOrderGroups).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(lastPayload()).toEqual({ message: "Access denied" })
    expect(service.getActiveSmtpConfig).not.toHaveBeenCalled()
  })

  it.each([
    { name: "native API rejects", evidence: null },
    { name: "native array is malformed", evidence: [{ id: "not-an-order-group" }] },
    { name: "native returns too many rows despite take 1", evidence: [{ id: "og_A" }, { id: "og_B" }] },
  ])("fails closed with 503 if $name", async ({ evidence }) => {
    if (evidence === null) native.listOrderGroups.mockRejectedValue(new Error("native read unavailable"))
    else native.listOrderGroups.mockResolvedValue(evidence)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(lastPayload()).toEqual({ message: "Unavailable" })
    expect(service.personalPlatformStoreClosingEmailProgress).not.toHaveBeenCalled()
    expect(service.getActiveSmtpConfig).not.toHaveBeenCalled()
  })

  it.each([
    { query: { organization_id, seller_id, extra: "true" }, headers: {} },
    { query: { organization_id: "other", seller_id }, headers: {} },
    { query: { organization_id, seller_id }, headers: { "x-seller-id": seller_id } },
    { query: { organization_id, seller_id }, headers: { authorization: "Bearer spoofed" } },
  ])("rejects forged query or native actor headers before private reads", async ({ query, headers }) => {
    req.query = query
    req.headers = headers
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(req.scope.resolve).not.toHaveBeenCalled()
    expect(service.personalPlatformStoreClosingEmailAudience).not.toHaveBeenCalled()
  })

  it("only returns aggregate counts when the Owner identity is ambiguous", async () => {
    service.personalPlatformStoreClosingEmailAudience.mockResolvedValue([{
      person_id: "daprs_private",
      receipt_id: null,
      actor_type: null,
      actor_id: null,
      auth_identity_id: null,
      email: "never-expose@example.invalid",
    }])
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(lastPayload()).toEqual(expect.objectContaining({
      protected_owner_count: 1,
      verified_email_identity_count: 0,
      unresolved_identity_count: 1,
      permanent_finalization_enabled: false,
    }))
    expect(verifiedEmailForActorContext).not.toHaveBeenCalled()
    expect(JSON.stringify(lastPayload())).not.toContain("never-expose@example.invalid")
  })

  it("returns no financial readiness if the SMTP/config read fails", async () => {
    service.getActiveSmtpConfig.mockRejectedValue(new Error("mail config unavailable"))
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(lastPayload()).toEqual({ message: "Unavailable" })
    expect(JSON.stringify(lastPayload())).not.toContain("terminal_preflight")
  })
})
