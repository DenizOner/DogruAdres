import { access, csrf, enabled, sessionToken } from "../../personal/security"
import { GET, POST } from "../launcher/route"
import { CompanyLauncherConflict, CompanyLauncherInvalid } from "../../../modules/dogruadres-access/company-launcher"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

jest.mock("../../personal/security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))

describe("organization launcher route — HTTP contract (moved from /personal/company-launcher)", () => {
  const org = "daorg_TEST_A"
  const entry = {
    organization_id: org, app_ids: ["organization", "store-applications", "memberships"],
    available_ids: ["organization", "store-applications", "memberships"], collapsed_ids: [], version: 1,
  }
  const service = {
    personalCompanyLauncher: jest.fn(),
    personalSaveCompanyLauncher: jest.fn(),
  }
  const request = (query: unknown = { organization: org }, body: unknown = {}) =>
    ({ query, body, headers: {}, scope: { resolve: jest.fn() } }) as any
  const response = () => {
    const res: any = {}
    res.setHeader = jest.fn().mockReturnValue(res)
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    return res
  }

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("t".repeat(43))
    ;(access as jest.Mock).mockReturnValue(service)
    service.personalCompanyLauncher.mockResolvedValue(entry)
    service.personalSaveCompanyLauncher.mockResolvedValue({ ...entry, version: 2 })
  })

  describe("GET /organization/launcher", () => {
    it("returns launcher preferences for verified Organization session", async () => {
      const res = response()
      await GET(request(), res)
      expect(service.personalCompanyLauncher).toHaveBeenCalledWith("t".repeat(43), org)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(entry)
    })

    it("rejects forged organization ID or seller context header", async () => {
      const res = response()
      await GET(request({ organization: "../../foreign" }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(service.personalCompanyLauncher).not.toHaveBeenCalled()

      const seller = request()
      seller.headers["x-seller-id"] = "sel_foreign"
      await GET(seller, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 403 when session does not prove active Organization membership", async () => {
      service.personalCompanyLauncher.mockResolvedValueOnce(null)
      const res = response()
      await GET(request(), res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("returns 503 when service is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      const res = response()
      await GET(request(), res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it("maps IdentityAccessDenied to 403 without leaking internal details", async () => {
      service.personalCompanyLauncher.mockRejectedValueOnce(new IdentityAccessDenied())
      const res = response()
      await GET(request(), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })
  })

  describe("POST /organization/launcher", () => {
    const writeBody = {
      organization: org, app_ids: ["organization"], collapsed_ids: [], expected_version: 1,
    }

    it("saves launcher preferences and returns updated version", async () => {
      const res = response()
      await POST(request({}, writeBody), res)
      expect(service.personalSaveCompanyLauncher).toHaveBeenCalledWith("t".repeat(43), writeBody)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ ...entry, version: 2 })
    })

    it("denies writes without CSRF token", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      const res = response()
      await POST(request({}, writeBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(service.personalSaveCompanyLauncher).not.toHaveBeenCalled()
    })

    it("denies writes with seller context header regardless of CSRF", async () => {
      const req = request({}, writeBody)
      req.headers["x-seller-id"] = "sel_foreign"
      const res = response()
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("returns 409 on optimistic-lock conflict", async () => {
      service.personalSaveCompanyLauncher.mockRejectedValueOnce(new CompanyLauncherConflict())
      const res = response()
      await POST(request({}, writeBody), res)
      expect(res.status).toHaveBeenCalledWith(409)
    })

    it("returns 400 on invalid preference value", async () => {
      service.personalSaveCompanyLauncher.mockRejectedValueOnce(new CompanyLauncherInvalid())
      const res = response()
      await POST(request({}, writeBody), res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("maps IdentityAccessDenied to 403 on save", async () => {
      service.personalSaveCompanyLauncher.mockRejectedValueOnce(new IdentityAccessDenied())
      const res = response()
      await POST(request({}, writeBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })
})
