import { GET as invGET, POST as invPOST } from "../invitations/route"
import { access, csrf, enabled, sessionToken } from "../../personal/security"
import { createInvitationWorkflow } from "../../../workflows/dogruadres-access/create-invitation"
import { acceptInvitationWorkflow } from "../../../workflows/dogruadres-access/accept-invitation"
import { revokeInvitationWorkflow } from "../../../workflows/dogruadres-access/revoke-invitation"
import { verifiedEmailForActorContext } from "../../dogruadres/invitations/accept/route"
import { sendSmtpEmail } from "../../../modules/dogruadres-access/smtp-client"

jest.mock("../../personal/security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))
jest.mock("../../../workflows/dogruadres-access/create-invitation", () => ({
  createInvitationWorkflow: jest.fn(),
}))
jest.mock("../../../workflows/dogruadres-access/accept-invitation", () => ({
  acceptInvitationWorkflow: jest.fn(),
}))
jest.mock("../../../workflows/dogruadres-access/revoke-invitation", () => ({
  revokeInvitationWorkflow: jest.fn(),
}))
jest.mock("../../dogruadres/invitations/accept/route", () => ({
  verifiedEmailForActorContext: jest.fn(),
}))
jest.mock("../../../modules/dogruadres-access/smtp-client", () => ({
  sendSmtpEmail: jest.fn(),
}))

describe("organization invitations route — HTTP contract (moved from /personal/invitations)", () => {
  const originalInvitationSecret = process.env.DOGRUADRES_INVITATION_SECRET
  const originalOrigin = process.env.DOGRUADRES_PUBLIC_ORIGIN

  beforeAll(() => {
    process.env.DOGRUADRES_INVITATION_SECRET = "unit-only-" + "x".repeat(48)
    process.env.DOGRUADRES_PUBLIC_ORIGIN = "http://127.0.0.1:19102"
  })
  afterAll(() => {
    if (originalInvitationSecret === undefined) delete process.env.DOGRUADRES_INVITATION_SECRET
    else process.env.DOGRUADRES_INVITATION_SECRET = originalInvitationSecret
    if (originalOrigin === undefined) delete process.env.DOGRUADRES_PUBLIC_ORIGIN
    else process.env.DOGRUADRES_PUBLIC_ORIGIN = originalOrigin
  })

  const principal = {
    person_id: "person_owner", actor_type: "user", actor_id: "user_owner",
    auth_identity_id: "auth_owner", last_strong_auth_at: new Date(),
  }
  const service = {
    personalLinkPrimary: jest.fn(),
    personalManagerOrganization: jest.fn(),
    listInvitations: jest.fn(),
  }
  const mockCreateRun = jest.fn()
  const mockAcceptRun = jest.fn()
  const mockRevokeRun = jest.fn()
  const scope = { resolve: jest.fn() }

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("t".repeat(43))
    ;(access as jest.Mock).mockReturnValue(service)
    service.personalLinkPrimary.mockResolvedValue(principal)
    service.personalManagerOrganization.mockResolvedValue({
      person_id: "person_owner",
      organizations: [{ id: "daorg_allowed", role: "owner" }],
    })
    service.listInvitations.mockResolvedValue([])
    ;(createInvitationWorkflow as jest.Mock).mockReturnValue({ run: mockCreateRun })
    ;(acceptInvitationWorkflow as jest.Mock).mockReturnValue({ run: mockAcceptRun })
    ;(revokeInvitationWorkflow as jest.Mock).mockReturnValue({ run: mockRevokeRun })
    ;(sendSmtpEmail as jest.Mock).mockResolvedValue(undefined)
    ;(verifiedEmailForActorContext as jest.Mock).mockResolvedValue("user@example.com")
    mockCreateRun.mockResolvedValue({
      result: { id: "dainv_new", role: "member", status: "pending", expires_at: new Date(Date.now() + 7 * 86400_000) },
    })
    mockAcceptRun.mockResolvedValue({
      result: { membership: { id: "damem_new", organization_id: "daorg_allowed", role: "member", status: "active" } },
    })
    mockRevokeRun.mockResolvedValue({
      result: { id: "dainv_old", status: "revoked", revoked_at: new Date() },
    })
  })

  describe("GET /organization/invitations", () => {
    it("returns pending invitations for active Owner — no token hashes or raw links", async () => {
      service.listInvitations.mockResolvedValueOnce([
        { id: "dainv_1", recipient_email: "a@b.com", role: "member", status: "pending",
          expires_at: new Date(Date.now() + 86400_000) },
      ])
      const req: any = { query: { organization: "daorg_allowed" }, headers: {}, scope }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invGET(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invitations: [expect.objectContaining({ id: "dainv_1", recipient_email: "a@b.com" })],
      }))
      const payload = (res.json as jest.Mock).mock.calls[0][0]
      expect(JSON.stringify(payload)).not.toContain("token")
    })

    it("returns 403 when session does not prove Owner role for the organization", async () => {
      service.personalManagerOrganization.mockResolvedValueOnce(null)
      const req: any = { query: { organization: "daorg_allowed" }, headers: {}, scope }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invGET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("returns 400 for malformed or missing organization query parameter", async () => {
      const req: any = { query: { organization: "not_valid" }, headers: {}, scope }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invGET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe("POST /organization/invitations — create action", () => {
    it("creates invitation and returns 201 with SMTP delivery status", async () => {
      const req: any = {
        body: { action: "create", organization_id: "daorg_allowed", email: "new@example.com", role: "member" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(201)
      const payload = (res.json as jest.Mock).mock.calls[0][0]
      expect(payload.invitation).toHaveProperty("id", "dainv_new")
      expect(payload.delivery).toHaveProperty("status")
    })

    it("denies creation when session does not prove Owner authorization", async () => {
      service.personalManagerOrganization.mockResolvedValueOnce(null)
      const req: any = {
        body: { action: "create", organization_id: "daorg_allowed", email: "new@example.com", role: "member" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockCreateRun).not.toHaveBeenCalled()
    })

    it("rejects new Admin invitations — only 'member' role allowed", async () => {
      const req: any = {
        body: { action: "create", organization_id: "daorg_allowed", email: "new@example.com", role: "admin" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockCreateRun).not.toHaveBeenCalled()
    })

    it("denies all mutations when CSRF fails", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      const req: any = {
        body: { action: "create", organization_id: "daorg_allowed", email: "x@y.com", role: "member" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it("returns 503 when DOGRUADRES_PUBLIC_ORIGIN is not configured", async () => {
      const saved = process.env.DOGRUADRES_PUBLIC_ORIGIN
      delete process.env.DOGRUADRES_PUBLIC_ORIGIN
      const req: any = {
        body: { action: "create", organization_id: "daorg_allowed", email: "x@y.com", role: "member" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
      process.env.DOGRUADRES_PUBLIC_ORIGIN = saved
    })

    it("returns 503 on workflow failure without exposing internal details", async () => {
      mockRevokeRun.mockRejectedValueOnce(new Error("private DB"))
      const req: any = {
        body: { action: "revoke", organization_id: "daorg_allowed", invitation_id: "dainv_old" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
      const msg = (res.json as jest.Mock).mock.calls[0][0].message
      expect(msg).not.toContain("private")
    })
  })

  describe("POST /organization/invitations — accept action", () => {
    it("accepts invitation after proving verified email ownership", async () => {
      const req: any = {
        body: { action: "accept", token: "valid-invite-token" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(mockAcceptRun).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        membership: expect.objectContaining({ status: "active" }),
      }))
    })

    it("returns 403 when no verified email can be derived for the actor", async () => {
      ;(verifiedEmailForActorContext as jest.Mock).mockResolvedValueOnce(null)
      const req: any = {
        body: { action: "accept", token: "valid-invite-token" },
        headers: {}, scope,
      }
      const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
      await invPOST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockAcceptRun).not.toHaveBeenCalled()
    })
  })
})
