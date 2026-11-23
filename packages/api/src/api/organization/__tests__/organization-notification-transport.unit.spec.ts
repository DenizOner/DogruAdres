import { GET, POST } from "../notifications/route"
import { access, csrf, enabled, sessionToken } from "../../personal/security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

jest.mock("../../personal/security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))

describe("organization notifications route — HTTP contract (moved from /personal/notifications)", () => {
  let service: any, req: any, res: any

  beforeEach(() => {
    service = {
      personalSession: jest.fn(async () => ({ person_id: "server-person" })),
      personalNotifications: jest.fn(async () => ({ notifications: [], unread_count: 0, next_offset: null })),
      readPersonalNotification: jest.fn(async () => ({ success: true })),
    }
    req = { query: {}, body: { id: "danot_11111111-1111-4111-8111-111111111111" } }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("t".repeat(43))
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
  })

  it("rejects browser-supplied recipient fields — no person_id or extra query fields accepted", async () => {
    req.body.person_id = "other-person"
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.readPersonalNotification).not.toHaveBeenCalled()

    req.query = { person_id: "other-person" }
    await GET(req, res)
    expect(service.personalNotifications).not.toHaveBeenCalled()
  })

  it("forwards organization filter and offset on listing and read-receipt operations", async () => {
    req.query = { organization: "daorg_X", offset: "12" }
    await GET(req, res)
    expect(service.personalNotifications).toHaveBeenCalledWith("t".repeat(43), 12, "daorg_X")

    req.query = { organization: "daorg_X" }
    await POST(req, res)
    expect(service.readPersonalNotification).toHaveBeenCalledWith(
      "t".repeat(43), "danot_11111111-1111-4111-8111-111111111111", "daorg_X"
    )
    expect(csrf).toHaveBeenCalled()
  })

  it("requires current session and CSRF before any read-receipt write", async () => {
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.readPersonalNotification).not.toHaveBeenCalled()

    service.personalSession.mockResolvedValue(null)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("uses only the server-side session credential for listing — forbids caching", async () => {
    await GET(req, res)
    expect(service.personalNotifications).toHaveBeenCalledWith("t".repeat(43), 0, undefined)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
  })

  it("returns indistinguishable 403 for foreign or non-existent notifications", async () => {
    service.readPersonalNotification.mockRejectedValue(new IdentityAccessDenied())
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
  })

  it("returns 503 on persistence failure without reporting a completed read", async () => {
    service.readPersonalNotification.mockRejectedValue(new Error("private SQL details"))
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ message: "Service unavailable" })
  })

  it("returns 503 when service is disabled", async () => {
    ;(enabled as jest.Mock).mockReturnValue(false)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it("returns 401 when session token format is invalid", async () => {
    ;(sessionToken as jest.Mock).mockReturnValue("bad_token")
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("accepts danal_ prefix notification IDs for platform staff escalation receipts", async () => {
    req.body = { id: "danal_" + "a".repeat(32) }
    await POST(req, res)
    expect(service.readPersonalNotification).toHaveBeenCalled()
  })
})
