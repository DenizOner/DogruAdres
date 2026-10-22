import { POST,enrollmentEnabled } from "../mfa/enroll/route"
import { access,csrfEnrollment,enabled,sessionToken,secureCookies } from "../security"
import { bindServerActor } from "../server-actor"
jest.mock("../security",()=>({
  access:jest.fn(),csrfEnrollment:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn(),
  secureCookies:jest.fn(()=>true),
}))
jest.mock("../server-actor",()=>({bindServerActor:jest.fn()}))

describe("server-only MFA enrollment (default-closed and purpose bound)",()=>{
  const token="S".repeat(43),ticket="T".repeat(43)
  const session={person_id:"daprs_self",auth_identity_id:"auth_self"}
  const service={
    personalEnrollmentSession:jest.fn(),personalEnrollmentMfaSettings:jest.fn(),
    personalLoginAttempt:jest.fn(),personalBeginMfaEnrollment:jest.fn(),
    personalClaimMfaVerification:jest.fn(),personalCompleteMfaEnrollment:jest.fn(),
    closePersonalSession:jest.fn(),personalRevokePendingMfaEnrollment:jest.fn(),
  }
  const auth={
    authenticate:jest.fn(),listAuthMfa:jest.fn(),startAuthMfa:jest.fn(),verifyAuthMfa:jest.fn(),
    retrieveAuthMfa:jest.fn(),disableAuthMfa:jest.fn(),
  }
  beforeEach(()=>{
    jest.resetAllMocks()
    process.env.DOGRUADRES_MFA_SETTINGS_ENABLED="true"
    process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED="true"
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED="true"
    process.env.DOGRUADRES_IDENTITY_ENABLED="true"
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(secureCookies as jest.Mock).mockReturnValue(true)
    ;(csrfEnrollment as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    ;(access as jest.Mock).mockReturnValue(service)
    ;(bindServerActor as jest.Mock).mockResolvedValue(true)
    service.personalEnrollmentSession.mockResolvedValue(session)
    service.personalEnrollmentMfaSettings.mockResolvedValue({
      platform:{platform_mode:"required",version:0},
      personal:{person_id:"daprs_self",user_enabled:false,version:0},
    })
    service.personalLoginAttempt.mockResolvedValue(true)
    service.personalBeginMfaEnrollment.mockResolvedValue({ticket})
    service.personalClaimMfaVerification.mockResolvedValue({
      auth_identity_id:"auth_self",factor_id:"mfa_pending",
    })
    service.personalCompleteMfaEnrollment.mockResolvedValue({token:"N".repeat(43),csrf:"C".repeat(43)})
    auth.authenticate.mockResolvedValue({success:true,authIdentity:{id:"auth_self"}})
    auth.listAuthMfa.mockResolvedValue([])
    auth.startAuthMfa.mockResolvedValue({mfa:{id:"mfa_pending",auth_identity_id:"auth_self",status:"pending"},
      secret:"synthetic-test-secret",otpauth_url:"otpauth://local-only-test"})
    auth.verifyAuthMfa.mockResolvedValue({id:"mfa_pending",auth_identity_id:"auth_self",status:"enabled"})
    auth.retrieveAuthMfa.mockResolvedValue({id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"pending"})
    auth.disableAuthMfa.mockResolvedValue({id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"disabled"})
    service.personalRevokePendingMfaEnrollment.mockResolvedValue({revoked_tickets:1})
  })
  afterEach(()=>{
    delete process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED
    delete process.env.DOGRUADRES_MFA_SETTINGS_ENABLED
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
    delete process.env.DOGRUADRES_MFA_PENDING_RESET_ENABLED
    delete process.env.DOGRUADRES_IDENTITY_ENABLED
  })
  const call=async(body:unknown,cookie="da_mfa_setup="+ticket)=>{
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis(),cookie:jest.fn(),clearCookie:jest.fn()}
    const req:any={body,headers:{cookie},socket:{remoteAddress:"127.0.0.1"},
      scope:{resolve:jest.fn().mockReturnValue(auth)},url:"/personal/mfa/enroll",protocol:"https"}
    await POST(req,res)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    return res
  }
  it("is off by default or without settings rollout",async()=>{
    delete process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED
    expect(enrollmentEnabled()).toBe(false)
    expect((await call({action:"start",email:"self@example.invalid",password:"pw"})).status)
      .toHaveBeenCalledWith(503)
    expect(auth.authenticate).not.toHaveBeenCalled()
  })
  it("requires live session and browser origin/CSRF",async()=>{
    ;(csrfEnrollment as jest.Mock).mockResolvedValue(false)
    expect((await call({action:"verify",code:"123456"})).status).toHaveBeenCalledWith(403)
    expect(service.personalClaimMfaVerification).not.toHaveBeenCalled()
  })
  it("denies cross-identity password proof before native MFA setup",async()=>{
    auth.authenticate.mockResolvedValue({success:true,authIdentity:{id:"auth_other"}})
    const r=await call({action:"start",email:"other@example.invalid",password:"pw"})
    expect(r.status).toHaveBeenCalledWith(403)
    expect(auth.startAuthMfa).not.toHaveBeenCalled()
  })
  it("rejects disabled platform before password or native factor processing",async()=>{
    service.personalEnrollmentMfaSettings.mockResolvedValue({
      platform:{platform_mode:"disabled"},
      personal:{person_id:"daprs_self"},
    })
    expect((await call({action:"start",email:"self@example.invalid",password:"pw"})).status)
      .toHaveBeenCalledWith(403)
    expect(auth.authenticate).not.toHaveBeenCalled()
  })
  it("enforces rate limit and strict body shape",async()=>{
    const r=await call({action:"start",email:"self@example.invalid",password:"pw",person_id:"daprs_victim"})
    expect(r.status).toHaveBeenCalledWith(400)
    service.personalLoginAttempt.mockResolvedValue(false)
    expect((await call({action:"start",email:"self@example.invalid",password:"pw"})).status)
      .toHaveBeenCalledWith(429)
  })
  it("issues only a setup cookie after fresh password proof and native pending factor",async()=>{
    const r=await call({action:"start",email:"self@example.invalid",password:"pw"})
    expect(service.personalBeginMfaEnrollment).toHaveBeenCalledWith(token,"auth_self","mfa_pending")
    expect(r.cookie).toHaveBeenCalledWith("da_mfa_setup",ticket,
      expect.objectContaining({httpOnly:true,sameSite:"strict",path:"/personal/mfa/enroll"}))
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({setup_required:true}))
    expect(service.personalCompleteMfaEnrollment).not.toHaveBeenCalled()
  })
  it("never creates a second secret when a factor is already pending or enabled",async()=>{
    auth.listAuthMfa.mockResolvedValue([{id:"mfa_enabled",auth_identity_id:"auth_self",status:"enabled",provider:"totp"}])
    expect((await call({action:"start",email:"self@example.invalid",password:"pw"})).status).toHaveBeenCalledWith(409)
    expect(auth.startAuthMfa).not.toHaveBeenCalled()
  })
  it("resumes only exact owned pending factor after a fresh password proof; never discloses old secret",async()=>{
    auth.listAuthMfa.mockResolvedValue([{
      id:"pending_old",auth_identity_id:"auth_self",provider:"totp",status:"pending",
      metadata:{secret:"old-seed-private"},
    }])
    const r=await call({action:"resume",email:"self@example.invalid",password:"pw"})
    expect(service.personalBeginMfaEnrollment).toHaveBeenCalledWith(token,"auth_self","pending_old")
    expect(auth.startAuthMfa).not.toHaveBeenCalled()
    const body=r.json.mock.calls[0][0]
    expect(body).toEqual({setup_required:true,resumed:true})
    expect(JSON.stringify(body)).not.toContain("old-seed-private")
    expect(JSON.stringify(body)).not.toContain("pending_old")
    expect(r.cookie).toHaveBeenCalledWith("da_mfa_setup",ticket,expect.anything())
  })
  it("cannot resume a factor belonging to another AuthIdentity",async()=>{
    auth.listAuthMfa.mockResolvedValue([{
      id:"pending_other",auth_identity_id:"auth_other",provider:"totp",status:"pending",
    }])
    await expect(call({action:"resume",email:"self@example.invalid",password:"pw"}))
      .rejects.toThrow("Native MFA factor state unavailable")
    expect(service.personalBeginMfaEnrollment).not.toHaveBeenCalled()
  })
  it("cannot resume without pending factor or use invalid actor/factor selector",async()=>{
    const r=await call({action:"resume",email:"self@example.invalid",password:"pw"})
    expect(r.status).toHaveBeenCalledWith(409)
    const bad=await call({action:"resume",email:"self@example.invalid",password:"pw",factor_id:"p"})
    expect(bad.status).toHaveBeenCalledWith(400)
    expect(service.personalBeginMfaEnrollment).not.toHaveBeenCalled()
  })
  it("never resets a pending factor without the separate reset feature gate",async()=>{
    auth.listAuthMfa.mockResolvedValue([{id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"pending"}])
    const r=await call({action:"reset_pending",email:"self@example.invalid",password:"pw"})
    expect(r.status).toHaveBeenCalledWith(503)
    expect(service.personalRevokePendingMfaEnrollment).not.toHaveBeenCalled()
    expect(auth.disableAuthMfa).not.toHaveBeenCalled()
  })
  it("requires current identity, fresh password and exact pending factor before reset",async()=>{
    process.env.DOGRUADRES_MFA_PENDING_RESET_ENABLED="true"
    auth.listAuthMfa.mockResolvedValue([{id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"pending"}])
    auth.retrieveAuthMfa.mockResolvedValue({id:"mfa_pending",auth_identity_id:"auth_other",provider:"totp",status:"pending"})
    const denied=await call({action:"reset_pending",email:"self@example.invalid",password:"pw"})
    expect(denied.status).toHaveBeenCalledWith(409)
    expect(service.personalRevokePendingMfaEnrollment).not.toHaveBeenCalled()
    auth.retrieveAuthMfa.mockResolvedValue({id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"pending"})
    const r=await call({action:"reset_pending",email:"self@example.invalid",password:"pw"})
    expect(service.personalRevokePendingMfaEnrollment).toHaveBeenCalledWith(token,"mfa_pending")
    expect(auth.retrieveAuthMfa).toHaveBeenCalledWith({id:"mfa_pending",auth_identity_id:"auth_self"})
    expect(auth.disableAuthMfa).toHaveBeenCalledWith({id:"mfa_pending"})
    expect(r.json).toHaveBeenCalledWith({reset:true})
    expect(r.clearCookie).toHaveBeenCalledWith("da_mfa_setup",{path:"/personal/mfa/enroll"})
  })
  it("does not disable native factor when Foundation revocation fails",async()=>{
    process.env.DOGRUADRES_MFA_PENDING_RESET_ENABLED="true"
    auth.listAuthMfa.mockResolvedValue([{id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"pending"}])
    service.personalRevokePendingMfaEnrollment.mockResolvedValue(null)
    const r=await call({action:"reset_pending",email:"self@example.invalid",password:"pw"})
    expect(r.status).toHaveBeenCalledWith(403)
    expect(auth.disableAuthMfa).not.toHaveBeenCalled()
  })
  it("fails closed if factor becomes enabled before native disable",async()=>{
    process.env.DOGRUADRES_MFA_PENDING_RESET_ENABLED="true"
    auth.listAuthMfa.mockResolvedValue([{id:"mfa_pending",auth_identity_id:"auth_self",provider:"totp",status:"pending"}])
    auth.disableAuthMfa.mockRejectedValue(Error("fresh challenge required"))
    const r=await call({action:"reset_pending",email:"self@example.invalid",password:"pw"})
    expect(r.status).toHaveBeenCalledWith(409)
    expect(r.json).not.toHaveBeenCalledWith({reset:true})
  })
  it("charges a ticket attempt and rejects wrong native TOTP",async()=>{
    auth.verifyAuthMfa.mockRejectedValue(Error("bad totp"))
    expect((await call({action:"verify",code:"123456"})).status).toHaveBeenCalledWith(403)
    expect(service.personalClaimMfaVerification).toHaveBeenCalledWith(token,ticket)
    expect(service.personalCompleteMfaEnrollment).not.toHaveBeenCalled()
  })
  it("rejects factor from another identity or wrong enrollment ticket",async()=>{
    auth.verifyAuthMfa.mockResolvedValue({id:"mfa_other",auth_identity_id:"auth_other",status:"enabled"})
    expect((await call({action:"verify",code:"123456"})).status).toHaveBeenCalledWith(403)
    expect(service.personalCompleteMfaEnrollment).not.toHaveBeenCalled()
  })
  it("rotates browser cookie only after actual native factor verification and ticket consumption",async()=>{
    const r=await call({action:"verify",code:"123456"})
    expect(auth.verifyAuthMfa).toHaveBeenCalledWith({
      id:"mfa_pending",auth_identity_id:"auth_self",code:"123456",
    })
    expect(service.personalCompleteMfaEnrollment).toHaveBeenCalledWith(token,ticket,"mfa_pending")
    expect(bindServerActor).toHaveBeenCalledWith(expect.anything(),"N".repeat(43))
    expect(r.cookie).toHaveBeenCalledWith("da_session","N".repeat(43),
      expect.objectContaining({httpOnly:true,secure:true,sameSite:"strict"}))
    expect(r.clearCookie).toHaveBeenCalledWith("da_mfa_setup",{path:"/personal/mfa/enroll"})
  })
  it("never binds or issues a full session if native factor was enabled but Foundation ticket completion fails",async()=>{
    service.personalCompleteMfaEnrollment.mockResolvedValue(null)
    const r=await call({action:"verify",code:"123456"})
    expect(auth.verifyAuthMfa).toHaveBeenCalledWith({
      id:"mfa_pending",auth_identity_id:"auth_self",code:"123456",
    })
    expect(service.personalCompleteMfaEnrollment).toHaveBeenCalledWith(token,ticket,"mfa_pending")
    expect(r.status).toHaveBeenCalledWith(403)
    expect(bindServerActor).not.toHaveBeenCalled()
    expect(r.cookie).not.toHaveBeenCalledWith("da_session",expect.anything(),expect.anything())
  })
  it("revokes minted session even if downstream native actor binding throws",async()=>{
    ;(bindServerActor as jest.Mock).mockRejectedValue(Error("synthetic binding fault"))
    const r=await call({action:"verify",code:"123456"})
    expect(r.status).toHaveBeenCalledWith(503)
    expect(service.closePersonalSession).toHaveBeenCalledWith("N".repeat(43),false)
    expect(r.cookie).not.toHaveBeenCalledWith("da_session",expect.anything(),expect.anything())
  })
  it("revokes the new session if downstream native credential binding fails",async()=>{
    ;(bindServerActor as jest.Mock).mockResolvedValue(false)
    const r=await call({action:"verify",code:"123456"})
    expect(r.status).toHaveBeenCalledWith(503)
    expect(service.closePersonalSession).toHaveBeenCalledWith("N".repeat(43),false)
    expect(r.cookie).not.toHaveBeenCalledWith("da_session",expect.anything(),expect.anything())
  })
})
