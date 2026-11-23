import { access, csrf, enabled, sessionToken } from "../security"
import { GET, POST } from "../platform/launcher/route"
import {
  PlatformLauncherConflict,
  PlatformLauncherInvalid,
} from "../../../modules/dogruadres-access/platform-launcher"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("GET & POST /personal/platform/launcher route contract", () => {
  const entry = {
    app_ids: ["organization-review", "store-approvals", "platform-mfa"],
    available_ids: ["organization-review", "store-approvals", "platform-mfa"],
    collapsed_ids: [],
    version: 1,
  }
  const service = {
    personalPlatformLauncher: jest.fn(),
    personalSavePlatformLauncher: jest.fn(),
  }
  const request = (query: unknown = {}, body: unknown = {}) =>
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
    service.personalPlatformLauncher.mockResolvedValue(entry)
    service.personalSavePlatformLauncher.mockResolvedValue({ ...entry, version: 2 })
  })

  describe("GET /personal/platform/launcher", () => {
    it("returns launcher preferences for verified platform staff", async () => {
      const res = response()
      await GET(request(), res)
      expect(service.personalPlatformLauncher).toHaveBeenCalledWith("t".repeat(43))
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(entry)
    })

    it("rejects extraneous query params or seller context header", async () => {
      const res = response()
      await GET(request({ unexpected: "param" }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(service.personalPlatformLauncher).not.toHaveBeenCalled()

      const seller = request()
      seller.headers["x-seller-id"] = "sel_foreign"
      await GET(seller, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 403 when access is denied or person has no platform tasks", async () => {
      service.personalPlatformLauncher.mockResolvedValue(null)
      const res = response()
      await GET(request(), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })

    it("returns 503 when feature is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      const res = response()
      await GET(request(), res)
      expect(res.status).toHaveBeenCalledWith(503)
    })
  })

  describe("POST /personal/platform/launcher", () => {
    const validBody = {
      app_ids: ["store-approvals", "organization-review", "platform-mfa"],
      collapsed_ids: ["platform-mfa"],
      expected_version: 1,
    }

    it("saves updated launcher order and collapse states", async () => {
      const res = response()
      await POST(request({}, validBody), res)
      expect(service.personalSavePlatformLauncher).toHaveBeenCalledWith("t".repeat(43), validBody)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ ...entry, version: 2 })
    })

    it("rejects request when CSRF check fails or seller context provided", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      const res = response()
      await POST(request({}, validBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(service.personalSavePlatformLauncher).not.toHaveBeenCalled()

      ;(csrf as jest.Mock).mockResolvedValue(true)
      const sellerReq = request({}, validBody)
      sellerReq.headers["x-seller-id"] = "sel_blocked"
      await POST(sellerReq, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("returns 400 on malformed input payload", async () => {
      const res = response()
      await POST(request({}, { app_ids: ["invalid-app"], expected_version: 1 }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(service.personalSavePlatformLauncher).not.toHaveBeenCalled()
    })

    it("returns 409 on version conflict", async () => {
      service.personalSavePlatformLauncher.mockRejectedValue(new PlatformLauncherConflict())
      const res = response()
      await POST(request({}, validBody), res)
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({ message: "Launcher changed; reload before saving" })
    })

    it("returns 400 on domain validation failure", async () => {
      service.personalSavePlatformLauncher.mockRejectedValue(new PlatformLauncherInvalid())
      const res = response()
      await POST(request({}, validBody), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid preference" })
    })

    it("returns 403 on IdentityAccessDenied", async () => {
      service.personalSavePlatformLauncher.mockRejectedValue(new IdentityAccessDenied())
      const res = response()
      await POST(request({}, validBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })
  })
})
