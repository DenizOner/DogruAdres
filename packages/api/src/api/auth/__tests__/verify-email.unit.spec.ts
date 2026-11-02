import { GET, POST } from "../verify-email/route"
import { createHash } from "node:crypto"

describe("verify-email route unit tests", () => {
  const createMockResponse = () => {
    const res: any = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    res.setHeader = jest.fn().mockReturnValue(res)
    return res
  }

  describe("GET /auth/verify-email (Safe Landing)", () => {
    it("returns 400 when token query is missing or empty", async () => {
      const req: any = { query: {}, scope: { resolve: jest.fn() } }
      const res = createMockResponse()

      await GET(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "invalid" })
      )
    })

    it("returns 404 when token is not found in database", async () => {
      const mockQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      }
      const pgConnection = jest.fn().mockReturnValue(mockQueryBuilder)
      const req: any = {
        query: { token: "unknown-token-12345" },
        scope: { resolve: jest.fn().mockReturnValue(pgConnection) },
      }
      const res = createMockResponse()

      await GET(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "invalid" })
      )
    })

    it("returns 200 with status pending when token is valid and active", async () => {
      const rawToken = "valid-active-token-xyz"
      const now = new Date()
      const mockRow = {
        id: "authver_test_1",
        auth_identity_id: "authid_test_1",
        entity_id: "user@example.com",
        entity_type: "email",
        verified_at: null,
        requested_at: now.toISOString(),
      }

      const mockQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockRow]),
      }
      const pgConnection = jest.fn().mockReturnValue(mockQueryBuilder)
      const req: any = {
        query: { token: rawToken },
        scope: { resolve: jest.fn().mockReturnValue(pgConnection) },
      }
      const res = createMockResponse()

      await GET(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(JSON.stringify(res.json.mock.calls)).not.toContain("user@example.com")
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "pending",

        })
      )
    })

    it("returns 200 with status consumed when token has already been verified", async () => {
      const rawToken = "already-used-token-xyz"
      const mockRow = {
        id: "authver_test_2",
        auth_identity_id: "authid_test_2",
        entity_id: "user@example.com",
        entity_type: "email",
        verified_at: new Date().toISOString(),
        requested_at: new Date(Date.now() - 60000).toISOString(),
      }

      const mockQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockRow]),
      }
      const pgConnection = jest.fn().mockReturnValue(mockQueryBuilder)
      const req: any = {
        query: { token: rawToken },
        scope: { resolve: jest.fn().mockReturnValue(pgConnection) },
      }
      const res = createMockResponse()

      await GET(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(JSON.stringify(res.json.mock.calls)).not.toContain("user@example.com")
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "consumed",

        })
      )
    })

    it("returns 200 with status expired when token requested_at is past TTL", async () => {
      const rawToken = "expired-token-xyz"
      const past = new Date(Date.now() - 20 * 60 * 1000) // 20 minutes ago (TTL is 15 min)
      const mockRow = {
        id: "authver_test_3",
        auth_identity_id: "authid_test_3",
        entity_id: "user@example.com",
        entity_type: "email",
        verified_at: null,
        requested_at: past.toISOString(),
      }

      const mockQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockRow]),
      }
      const pgConnection = jest.fn().mockReturnValue(mockQueryBuilder)
      const req: any = {
        query: { token: rawToken },
        scope: { resolve: jest.fn().mockReturnValue(pgConnection) },
      }
      const res = createMockResponse()

      await GET(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(JSON.stringify(res.json.mock.calls)).not.toContain("user@example.com")
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "expired",

        })
      )
    })
  })

  describe("POST /auth/verify-email (Explicit Action)", () => {
    it("returns 400 when body does not have valid token", async () => {
      const req: any = { body: {}, scope: { resolve: jest.fn() } }
      const res = createMockResponse()

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "invalid" })
      )
    })

    it("confirms verification and returns 200 with status confirmed", async () => {
      const mockAuthService = {
        confirmAuthVerification: jest.fn().mockResolvedValue({
          id: "authver_test_confirmed",
          entity_id: "user@example.com",
          verified_at: new Date().toISOString(),
        }),
      }

      const req: any = {
        body: { token: "token-to-confirm-123" },
        scope: { resolve: jest.fn().mockReturnValue(mockAuthService) },
      }
      const res = createMockResponse()

      await POST(req, res)

      expect(mockAuthService.confirmAuthVerification).toHaveBeenCalledWith({
        code: "token-to-confirm-123",
        code_provider: "token",
      })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(JSON.stringify(res.json.mock.calls)).not.toContain("user@example.com")
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          status: "confirmed",

        })
      )
    })

    it("returns 410 when token has expired", async () => {
      const mockAuthService = {
        confirmAuthVerification: jest.fn().mockRejectedValue(new Error("Verification code has expired")),
      }

      const req: any = {
        body: { token: "expired-token-123" },
        scope: { resolve: jest.fn().mockReturnValue(mockAuthService) },
      }
      const res = createMockResponse()

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          status: "expired",
        })
      )
    })

    it("returns 409 when token is invalid or already used", async () => {
      const mockAuthService = {
        confirmAuthVerification: jest.fn().mockRejectedValue(new Error("Verification code is invalid or already used")),
      }

      const req: any = {
        body: { token: "already-used-token-123" },
        scope: { resolve: jest.fn().mockReturnValue(mockAuthService) },
      }
      const res = createMockResponse()

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          status: "consumed",
        })
      )
    })
  })
})
