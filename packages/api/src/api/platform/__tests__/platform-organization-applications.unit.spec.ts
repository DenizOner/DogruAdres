import { GET, POST } from "../organization-applications/route"
import { access, csrf, enabled, sessionToken } from "../../personal/security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import { TaxCertificateReviewUnavailable } from "../../../modules/dogruadres-access/organization-application"

jest.mock("../../personal/security", () => ({
  access: jest.fn(),
  csrf: jest.fn().mockResolvedValue(true),
  enabled: jest.fn().mockReturnValue(true),
  sessionToken: jest.fn().mockReturnValue("opaque-staff-token")
}))

describe("platform organization applications route", () => {
  let req: any, res: any, service: any
  const payload = { application_id: "daorgapp_0123456789abcdef0123456789abcdef" }

  beforeEach(() => {
    service = {
      personalReadOrganizationApplicationReviewPreview: jest.fn(),
      personalSubmittedOrganizationApplications: jest.fn(),
      personalReviewOrganizationApplication: jest.fn()
    }
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque-staff-token")

    req = { query: {}, headers: {}, body: {} }
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    }
  })

  it("serves isolated PNG preview raster to authorized review staff", async () => {
    req.query = { action: "review_preview", application_id: payload.application_id }
    service.personalReadOrganizationApplicationReviewPreview.mockResolvedValueOnce(null)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)

    const pixels = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    service.personalReadOrganizationApplicationReviewPreview.mockResolvedValueOnce({
      content: pixels,
      mimeType: "image/png"
    })
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.send).toHaveBeenLastCalledWith(pixels)
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png")
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff")

    // Scanner failure
    service.personalReadOrganizationApplicationReviewPreview.mockRejectedValueOnce(new Error("scan error"))
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({ message: "Document review unavailable" })
  })

  it("lists submitted applications in review queue", async () => {
    req.query = { action: "review_queue" }
    service.personalSubmittedOrganizationApplications.mockResolvedValueOnce({
      applications: [{ id: payload.application_id, status: "submitted", tax_identifier: "12345678901" }],
      next_cursor: null
    })
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      applications: [{ id: payload.application_id, status: "submitted", tax_identifier: "12345678901" }],
      next_cursor: null
    })

    // Access denied
    service.personalSubmittedOrganizationApplications.mockResolvedValueOnce(null)
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })

  it("processes review decision from staff and handles safety unavailability", async () => {
    req.body = {
      action: "review_decision",
      application_id: payload.application_id,
      expected_version: 1,
      decision: "start_review"
    }
    service.personalReviewOrganizationApplication.mockResolvedValueOnce({
      application_id: payload.application_id,
      status: "in_review",
      version: 2
    })
    await POST(req, res)
    expect(res.status).toHaveBeenLastCalledWith(200)

    // Unavailable tax cert review
    service.personalReviewOrganizationApplication.mockRejectedValueOnce(new TaxCertificateReviewUnavailable())
    await POST(req, res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({ message: "Document review unavailable" })
  })

  it("rejects invalid requests", async () => {
    req.query = { action: "unknown" }
    await GET(req, res)
    expect(res.status).toHaveBeenLastCalledWith(400)

    req.body = { action: "unknown" }
    await POST(req, res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
})
