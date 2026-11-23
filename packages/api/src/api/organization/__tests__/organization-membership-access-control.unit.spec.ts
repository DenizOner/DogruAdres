import { access, csrf, enabled, sessionToken } from "../../personal/security"
import { GET, POST } from "../memberships/route"

jest.mock("../../personal/security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("organization memberships route — HTTP contract (moved from /personal/memberships)", () => {
  const token = "da_test_session_token_12345678901234567890123"
  const orgId = "daorg_01M0TESTORGANIZATION123456"
  const memberId = "daomem_01M0TESTMEMBERSHIP12345"

  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)

    mockService = {
      personalMemberships: jest.fn().mockResolvedValue([
        { id: "daomem_owner", person_id: "daprs_owner", role: "owner", status: "active", protected_owner: true },
        { id: memberId, person_id: "daprs_member", role: "member", status: "active", protected_owner: false },
      ]),
      personalRevokeMembership: jest.fn().mockResolvedValue({ id: memberId, status: "revoked" }),
      personalChangeMembershipRole: jest.fn().mockResolvedValue({ id: memberId, role: "member", status: "active" }),
      personalManageProtectedOwner: jest.fn().mockResolvedValue({ id: memberId, role: "owner", status: "active", protected_owner: true }),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)

    req = {
      headers: { host: "127.0.0.1:19102", cookie: `da_session=${token}`, "x-csrf-token": "valid-csrf-token" },
      query: {},
      body: {},
      scope: { resolve: jest.fn(() => mockService) },
    }
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
  })

  describe("GET /organization/memberships", () => {
    it("returns membership list for active Organization member with no-store cache header", async () => {
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(mockService.personalMemberships).toHaveBeenCalledWith(token, orgId)
      expect(res.json).toHaveBeenCalledWith({
        memberships: [
          { id: "daomem_owner", person_id: "daprs_owner", role: "owner", status: "active", protected_owner: true },
          { id: memberId, person_id: "daprs_member", role: "member", status: "active", protected_owner: false },
        ],
      })
    })

    it("strips implicit ORM relations and private fields from serialized output", async () => {
      req.query = { organization: orgId }
      mockService.personalMemberships.mockResolvedValueOnce([{
        id: memberId, person_id: "p", role: "member", status: "active", protected_owner: false,
        person: { id: "p", email: "private@example.invalid" }, secret: "must-not-serialize",
      }])
      await GET(req, res)
      expect(res.json).toHaveBeenCalledWith({
        memberships: [{ id: memberId, person_id: "p", role: "member", status: "active", protected_owner: false }],
      })
    })

    it("returns 400 for malformed organization ID prefix", async () => {
      req.query = { organization: "not_daorg_prefix" }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockService.personalMemberships).not.toHaveBeenCalled()
    })

    it("returns 400 when extra query parameters are supplied", async () => {
      req.query = { organization: orgId, extra: "param" }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 503 when service feature flag is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({ message: "Unavailable" })
    })
  })

  describe("POST /organization/memberships", () => {
    it("revokes membership when no role or action is supplied", async () => {
      req.body = { organization_id: orgId, membership_id: memberId }
      await POST(req, res)
      expect(mockService.personalRevokeMembership).toHaveBeenCalledWith(token, orgId, memberId)
      expect(res.json).toHaveBeenCalledWith({ membership: { id: memberId, status: "revoked" } })
    })

    it("revokes membership when action='revoke' is explicit", async () => {
      req.body = { action: "revoke", organization_id: orgId, membership_id: memberId }
      await POST(req, res)
      expect(mockService.personalRevokeMembership).toHaveBeenCalledWith(token, orgId, memberId)
    })

    it("reduces legacy admin to member role when role='member' is supplied", async () => {
      req.body = { organization_id: orgId, membership_id: memberId, role: "member" }
      await POST(req, res)
      expect(mockService.personalChangeMembershipRole).toHaveBeenCalledWith(token, orgId, memberId, "member")
      expect(res.json).toHaveBeenCalledWith({ membership: { id: memberId, role: "member", status: "active" } })
    })

    it("promotes to protected Owner via explicit action='protected_owner'", async () => {
      req.body = { action: "protected_owner", organization_id: orgId, membership_id: memberId, role: "owner" }
      await POST(req, res)
      expect(mockService.personalManageProtectedOwner).toHaveBeenCalledWith(token, orgId, memberId, "owner")
      expect(mockService.personalChangeMembershipRole).not.toHaveBeenCalled()
    })

    it("rejects new admin assignments — only 'member' role allowed in role action", async () => {
      req.body = { organization_id: orgId, membership_id: memberId, role: "admin" }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockService.personalChangeMembershipRole).not.toHaveBeenCalled()
    })

    it("denies all mutations when CSRF validation fails", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { organization_id: orgId, membership_id: memberId }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
      expect(mockService.personalRevokeMembership).not.toHaveBeenCalled()
    })

    it("rejects injected actor fields via strict schema", async () => {
      req.body = { organization_id: orgId, membership_id: memberId, actor_person_id: "injected" }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("denies when service is disabled regardless of CSRF state", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.body = { organization_id: orgId, membership_id: memberId }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })
})
