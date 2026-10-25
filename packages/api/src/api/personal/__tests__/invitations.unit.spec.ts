import { POST } from "../invitations/route"
import { access, csrf, enabled, sessionToken } from "../security"
import { createInvitationWorkflow } from "../../../workflows/dogruadres-access/create-invitation"
import { acceptInvitationWorkflow } from "../../../workflows/dogruadres-access/accept-invitation"
import { verifiedEmailForActorContext } from "../../dogruadres/invitations/accept/route"
import { sendSmtpEmail } from "../../../modules/dogruadres-access/smtp-client"

jest.mock("../security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))
jest.mock("../../../workflows/dogruadres-access/create-invitation", () => ({
  createInvitationWorkflow: jest.fn(),
}))
jest.mock("../../../workflows/dogruadres-access/accept-invitation", () => ({
  acceptInvitationWorkflow: jest.fn(),
}))
jest.mock("../../dogruadres/invitations/accept/route", () => ({
  verifiedEmailForActorContext: jest.fn(),
}))
jest.mock("../../../modules/dogruadres-access/smtp-client", () => ({
  sendSmtpEmail: jest.fn(),
}))

describe("session-bound personal invitations (no native bearer delegation)", () => {
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
  const membership = {
    id: "damem_new", organization_id: "daorg_allowed", role: "member", status: "active",
  }
  const service = {
    personalLinkPrimary: jest.fn(),
    personalOrganizations: jest.fn(),
  }
  const mockCreateRun = jest.fn()
  const mockAcceptRun = jest.fn()
  const scope = { resolve: jest.fn() }

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque-current-session")
    ;(access as jest.Mock).mockReturnValue(service)
    service.personalLinkPrimary.mockResolvedValue(principal)
    service.personalOrganizations.mockResolvedValue({
      person_id: principal.person_id,
      organizations: [{ id: "daorg_allowed", role: "owner" }],
    })
    ;(createInvitationWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockCreateRun })
    ;(acceptInvitationWorkflow as unknown as jest.Mock).mockReturnValue({ run: mockAcceptRun })
    mockCreateRun.mockResolvedValue({
      result: { id: "dainv_new", role: "member", status: "pending", expires_at: new Date("2026-11-01T00:00:00Z") },
    })
    mockAcceptRun.mockResolvedValue({ result: { membership } })
    ;(verifiedEmailForActorContext as jest.Mock).mockResolvedValue("verified@example.invalid")
  })

  async function invoke(body: unknown) {
    const res: any = {
      setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(),
    }
    await POST({ body, scope, headers: {} } as any, res)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
    return res
  }

  const createBody = { action: "create", organization_id: "daorg_allowed", email: " member@example.invalid ", role: "member" }
  const acceptBody = { action: "accept", token: "invitation-secret" }

  it.each(["feature disabled", "CSRF denied"])("blocks both invitation mutations when %s", async reason => {
    if (reason === "feature disabled") (enabled as jest.Mock).mockReturnValue(false)
    else (csrf as jest.Mock).mockResolvedValue(false)
    const res = await invoke(createBody)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalLinkPrimary).not.toHaveBeenCalled()
    expect(mockCreateRun).not.toHaveBeenCalled()
  })
  it.each([
    { ...createBody, role: "admin" },
    { ...createBody, actor_id: "user_attack" },
    { ...createBody, protected_owner: true },
    { ...createBody, organization_id: "another_org" },
    { ...acceptBody, email_verified: true },
    { ...acceptBody, email: "spoof@example.invalid" },
    { action: "create", organization_id: "daorg_allowed", email: "bad", role: "member" },
  ])("rejects injected attributes and invalid invite bodies: %p", async body => {
    const res = await invoke(body)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockCreateRun).not.toHaveBeenCalled()
    expect(mockAcceptRun).not.toHaveBeenCalled()
  })
  it("denies missing or non-recent server primary session", async () => {
    service.personalLinkPrimary.mockResolvedValueOnce(null)
    const res = await invoke(createBody)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(mockCreateRun).not.toHaveBeenCalled()
  })
  it.each([null, { organizations: [{ id: "daorg_allowed", role: "member" }] }, { organizations: [
    { id: "daorg_allowed", role: "owner" }, { id: "daorg_allowed", role: "admin" },
  ] }])("denies absent, non-owner, or ambiguous scope before any invitation write", async scoped => {
    service.personalOrganizations.mockResolvedValue(scoped)
    const res = await invoke(createBody)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(mockCreateRun).not.toHaveBeenCalled()
  })
  it("creates a single ordinary Member invitation using only the current server principal", async () => {
    const res = await invoke(createBody)
    expect(service.personalLinkPrimary).toHaveBeenCalledWith("opaque-current-session")
    expect(service.personalOrganizations).toHaveBeenCalledWith("opaque-current-session", "daorg_allowed")
    expect(createInvitationWorkflow).toHaveBeenCalledWith(scope)
    expect(mockCreateRun).toHaveBeenCalledWith({input: {
      organization_id: "daorg_allowed", email: "member@example.invalid",
      role: "member", actor_person_id: "person_owner",
      actor_type: "user", actor_id: "user_owner",
    }})
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      invitation: expect.objectContaining({ id: "dainv_new", role: "member", status: "pending" }),
      delivery: { status: "sent" },
    })
    expect(sendSmtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "member@example.invalid", subject: "DoğruAdres Kuruluş Üyelik Daveti" })
    )
    expect(mockAcceptRun).not.toHaveBeenCalled()
  })
  it("records delivery failure without aborting invitation record creation", async () => {
    ;(sendSmtpEmail as jest.Mock).mockRejectedValueOnce(new Error("Connection refused"))
    const res = await invoke(createBody)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      invitation: expect.objectContaining({ id: "dainv_new", role: "member", status: "pending" }),
      delivery: { status: "failed" },
    })
  })
  it("refuses creation without a configured public origin before any write or SMTP send", async () => {
    delete process.env.DOGRUADRES_PUBLIC_ORIGIN
    try {
      const res = await invoke(createBody)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(mockCreateRun).not.toHaveBeenCalled()
      expect(sendSmtpEmail).not.toHaveBeenCalled()
    } finally {
      process.env.DOGRUADRES_PUBLIC_ORIGIN = "http://127.0.0.1:19102"
    }
  })
  it("never reflects SMTP error details or invitation tokens in response JSON", async () => {
    ;(sendSmtpEmail as jest.Mock).mockRejectedValueOnce(
      new Error("SMTP error: recipient=private@example.test password=confidential")
    )
    const res = await invoke(createBody)
    const response = JSON.stringify(res.json.mock.calls)
    expect(response).not.toContain("private@example.test")
    expect(response).not.toContain("confidential")
    expect(response).not.toContain("invitation_token")
    expect(response).not.toContain("unit-only-")
    expect(response).toContain('"failed"')
  })

  it("never accepts a recipient without native verified-email proof", async () => {
    ;(verifiedEmailForActorContext as jest.Mock).mockResolvedValue(null)
    const res = await invoke(acceptBody)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: "Verified recipient email required" })
    expect(mockAcceptRun).not.toHaveBeenCalled()
  })
  it("never reflects internal workflow errors or another actor identity", async () => {
    mockAcceptRun.mockRejectedValueOnce(
      new Error("Membership lookup failed for other-person@example.invalid, internal actor reference")
    )
    const res = await invoke(acceptBody)
    expect(res.status).toHaveBeenCalledWith(403)
    const response = JSON.stringify(res.json.mock.calls)
    expect(response).not.toContain("other-person@example.invalid")
    expect(response).not.toContain("internal actor reference")
    expect(response).toContain("Bu bağlantıyla mevcut oturumda devam edilemiyor")
  })

  it("accepts using server-held actor and provider email proof only", async () => {
    const res = await invoke(acceptBody)
    expect(verifiedEmailForActorContext).toHaveBeenCalledWith(
      expect.objectContaining({scope}),
      {actor_type:"user",actor_id:"user_owner",auth_identity_id:"auth_owner",auth_provider:"emailpass",user_metadata:{}},
    )
    expect(mockAcceptRun).toHaveBeenCalledWith({input:{
      token:"invitation-secret",email:"verified@example.invalid",email_verified:true,
      actor:{actor_type:"user",actor_id:"user_owner"},
    }})
    expect(res.json).toHaveBeenCalledWith({membership})
  })
})
