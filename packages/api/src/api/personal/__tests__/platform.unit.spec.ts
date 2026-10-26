import { GET, POST } from "../platform/route"
import { access, csrf, enabled, sessionToken } from "../security"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("personal platform route unit tests (B03)", () => {
  const mockService = {
    personalStaff: jest.fn(),
    provisionPersonalOrganization: jest.fn(),
  }

  const mockQuery = {
    graph: jest.fn(),
  }

  const createMockReq = (body: any = {}) => {
    return {
      headers: {
        cookie: "da_session=" + "a".repeat(43),
        origin: "https://app.dogruadres.com",
        "x-csrf-token": "csrf_test_token",
      },
      body,
      scope: {
        resolve: jest.fn().mockImplementation((key: string) => {
          if (key === "dogruadresAccess") return mockService
          if (key === ContainerRegistrationKeys.QUERY) return mockQuery
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
    ;(sessionToken as jest.Mock).mockReturnValue("a".repeat(43))
    ;(access as jest.Mock).mockReturnValue(mockService)
    mockService.personalStaff.mockResolvedValue({
      id: "grant_123",
      person_id: "person_staff",
    })
    mockQuery.graph.mockResolvedValue({
      data: [{ id: "usr_1" }],
    })
  })

  describe("GET /personal/platform", () => {
    it("returns 503 when identity is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      const res = createMockRes()
      await GET(createMockReq(), res)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({ message: "Unavailable" })
    })

    it("returns 403 when staff grant is missing", async () => {
      mockService.personalStaff.mockResolvedValue(null)
      const res = createMockRes()
      await GET(createMockReq(), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied or strong authentication required" })
    })

    it("returns 200 when staff grant is valid", async () => {
      const res = createMockRes()
      await GET(createMockReq(), res)
      expect(res.json).toHaveBeenCalledWith({ allowed: true })
    })
  })

  describe("POST /personal/platform", () => {
    const validBody = {
      name: "New Platform Org",
      initial_owners: [
        { actor_type: "user", actor_id: "usr_1" },
      ],
    }

    it("returns 403 when identity is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      const res = createMockRes()
      await POST(createMockReq(validBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })

    it("returns 403 when CSRF validation fails", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      const res = createMockRes()
      await POST(createMockReq(validBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })

    it("returns 403 when staff grant is missing or expired", async () => {
      mockService.personalStaff.mockResolvedValue(null)
      const res = createMockRes()
      await POST(createMockReq(validBody), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied or strong authentication required" })
    })

    it("returns 400 when request body fails validation", async () => {
      const res = createMockRes()
      await POST(createMockReq({ name: "" }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
    })

    it("returns 400 when an initial Owner actor is not found in native graph", async () => {
      mockQuery.graph.mockResolvedValue({ data: [] })
      const res = createMockRes()
      await POST(createMockReq(validBody), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid initial Owner" })
      expect(mockService.provisionPersonalOrganization).not.toHaveBeenCalled()
    })

    it("returns 400 with Invalid initial Owner when actor lacks verified binding in service", async () => {
      mockService.provisionPersonalOrganization.mockRejectedValue(
        new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
      )
      const res = createMockRes()
      await POST(createMockReq(validBody), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid initial Owner" })
    })

    it("returns 400 when duplicate initial owners resolve to same canonical Person", async () => {
      mockService.provisionPersonalOrganization.mockRejectedValue(
        new MedusaError(MedusaError.Types.INVALID_DATA, "Initial Owners must be distinct canonical Persons")
      )
      const res = createMockRes()
      await POST(createMockReq(validBody), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Initial Owners must be distinct canonical Persons" })
    })

    it("returns 201 on successful provisioning with verified initial owners", async () => {
      mockService.provisionPersonalOrganization.mockResolvedValue({
        organization: { id: "daorg_01ABC", name: "New Platform Org", status: "active" },
        memberships: [{ id: "damem_1" }, { id: "damem_2" }],
      })
      const twoOwnersBody = {
        name: "New Platform Org",
        initial_owners: [
          { actor_type: "user", actor_id: "usr_1" },
          { actor_type: "user", actor_id: "usr_2" },
        ],
      }
      const res = createMockRes()
      await POST(createMockReq(twoOwnersBody), res)
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({
        organization: { id: "daorg_01ABC", name: "New Platform Org", status: "active" },
        initial_owner_count: 2,
      })
    })
  })
})
