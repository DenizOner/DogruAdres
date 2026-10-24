import { GET, POST } from "../platform/smtp/route"
import { access, csrf, enabled, sessionToken } from "../security"
import { SmtpConcurrentUpdateError } from "../../../modules/dogruadres-access/smtp-settings"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("personal platform smtp route unit tests", () => {
  const mockService = {
    personalPlatformSmtpSettings: jest.fn(),
    personalUpdatePlatformSmtpSettings: jest.fn(),
    personalTestPlatformSmtpSettings: jest.fn(),
    personalSession: jest.fn(),
  }

  const createMockReq = (body: any = {}, query: any = {}) => {
    return {
      headers: {
        cookie: "da_session=tok_valid_test_session",
        origin: "https://app.dogruadres.com",
        "x-csrf-token": "1234567890123456789012345678901234567890123",
      },
      body,
      query,
      scope: {
        resolve: jest.fn().mockImplementation((key: string) => {
          if (key === "dogruadresAccess") return mockService
          return null
        }),
      },
    } as any
  }

  const createMockRes = () => {
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
    ;(sessionToken as jest.Mock).mockReturnValue("tok_valid_test_session")
    ;(access as jest.Mock).mockReturnValue(mockService)
    mockService.personalSession.mockResolvedValue({
      person_id: "daprs_01TEST",
      auth_identity_id: "authid_01TEST",
    })
  })

  describe("GET /personal/platform/smtp", () => {
    it("returns 503 when identity is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      const req = createMockReq()
      const res = createMockRes()

      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({ message: "Unavailable" })
    })

    it("returns 403 when caller lacks platform.smtp.manage staff grant or recent strong auth", async () => {
      mockService.personalPlatformSmtpSettings.mockResolvedValue(null)
      const req = createMockReq()
      const res = createMockRes()

      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: "Access denied or strong authentication required",
      })
    })

    it("returns 200 with non-secret settings when caller is authorized", async () => {
      mockService.personalPlatformSmtpSettings.mockResolvedValue({
        settings: {
          enabled: true,
          host: "smtp.gmail.com",
          port: 465,
          security: "ssl",
          username: "test@gmail.com",
          from_email: "test@gmail.com",
          from_name: "DogruAdres Test",
          has_password: true,
          version: 1,
        },
        can_manage: true,
      })
      const req = createMockReq()
      const res = createMockRes()

      await GET(req, res)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(res.json).toHaveBeenCalledWith({
        settings: {
          enabled: true,
          host: "smtp.gmail.com",
          port: 465,
          security: "ssl",
          username: "test@gmail.com",
          from_email: "test@gmail.com",
          from_name: "DogruAdres Test",
          has_password: true,
          version: 1,
        },
        can_manage: true,
      })
    })
  })

  describe("POST /personal/platform/smtp", () => {
    it("returns 403 when CSRF check fails", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      const req = createMockReq({ action: "test" })
      const res = createMockRes()

      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })

    it("returns 400 when input validation fails (e.g. invalid host SSRF, invalid port)", async () => {
      const req = createMockReq({
        action: "save",
        enabled: true,
        host: "127.0.0.1", // Disallowed SSRF private loopback
        port: 465,
        security: "ssl",
        from_email: "invalid-email",
        expected_version: 0,
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid input" })
      )
    })

    it("returns 409 when concurrent update conflict occurs", async () => {
      mockService.personalUpdatePlatformSmtpSettings.mockRejectedValue(
        new SmtpConcurrentUpdateError()
      )
      const req = createMockReq({
        action: "save",
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        from_email: "admin@dogruadres.com",
        expected_version: 1,
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({
        message: "Settings changed; refresh before retry",
      })
    })

    it("returns 200 on successful settings update", async () => {
      mockService.personalUpdatePlatformSmtpSettings.mockResolvedValue({
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        username: "apikey",
        from_email: "notifications@dogruadres.com",
        from_name: "DogruAdres Platform",
        has_password: true,
        version: 2,
      })
      const req = createMockReq({
        action: "save",
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        username: "apikey",
        password: "new-password",
        from_email: "notifications@dogruadres.com",
        from_name: "DogruAdres Platform",
        expected_version: 1,
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.json).toHaveBeenCalledWith({
        settings: {
          enabled: true,
          host: "smtp.sendgrid.net",
          port: 465,
          security: "ssl",
          username: "apikey",
          from_email: "notifications@dogruadres.com",
          from_name: "DogruAdres Platform",
          has_password: true,
          version: 2,
        },
      })
    })

    it("returns 200 and dispatches live test email on test action", async () => {
      mockService.personalTestPlatformSmtpSettings.mockResolvedValue({
        messageId: "<test-msg-123@smtp.gmail.com>",
        accepted: ["denizoner1985@gmail.com"],
      })
      const req = createMockReq({
        action: "test",
        target_recipient: "denizoner1985@gmail.com",
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        messageId: "<test-msg-123@smtp.gmail.com>",
        accepted: ["denizoner1985@gmail.com"],
      })
    })
  })
})
