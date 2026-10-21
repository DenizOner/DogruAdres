import { POST } from "../session/route"
import { access,enabled,sessionToken,trustedOrigin,secureCookies } from "../security"
import { bindServerActor } from "../server-actor"
import { readNativeMfaSummary } from "../../../modules/dogruadres-access/native-mfa-summary"

jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn(),trustedOrigin:jest.fn(),
  secureCookies:jest.fn(()=>true),csrf:jest.fn(),
}))
jest.mock("../server-actor",()=>({bindServerActor:jest.fn()}))
jest.mock("../../../modules/dogruadres-access/native-mfa-summary",()=>({
  readNativeMfaSummary:jest.fn(),
}))

describe("M0 login MFA runtime policy (rollout-off unless four flags)",()=>{
  const identity={id:"auth_self"}
  const service={
    personalLoginAttempt:jest.fn(),pendingPersonalChallenge:jest.fn(),
    personalMfaRuntimeActivation:jest.fn(),
    personalLoginMfaDecision:jest.fn(),openPersonalSession:jest.fn(),
    closePersonalSession:jest.fn(),
  }
  const auth={authenticate:jest.fn(),validateAuthIdentity:jest.fn(),listAuthMfa:jest.fn()}
  beforeEach(()=>{
    jest.resetAllMocks()
    for(const name of ["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_SETTINGS_ENABLED",
      "DOGRUADRES_MFA_ENROLLMENT_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED"])
      process.env[name]="true"
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(trustedOrigin as jest.Mock).mockReturnValue(true)
    ;(secureCookies as jest.Mock).mockReturnValue(true)
    ;(access as jest.Mock).mockReturnValue(service)
    ;(sessionToken as jest.Mock).mockReturnValue("")
    ;(bindServerActor as jest.Mock).mockResolvedValue(true)
    service.personalLoginAttempt.mockResolvedValue(true)
    service.personalMfaRuntimeActivation.mockResolvedValue(true)
    service.pendingPersonalChallenge.mockResolvedValue({token:"T".repeat(43),csrf:"Z".repeat(43)})
    service.personalLoginMfaDecision.mockResolvedValue({
      purpose:"mfa_enroll",expectedRevision:{platform:0,person:0},
    })
    service.openPersonalSession.mockResolvedValue({token:"S".repeat(43),csrf:"C".repeat(43)})
    auth.authenticate.mockResolvedValue({success:true,authIdentity:identity})
    auth.validateAuthIdentity.mockResolvedValue({authIdentity:identity,mfaChallenge:null})
    ;(readNativeMfaSummary as jest.Mock).mockResolvedValue({enabled:false,state:"not_enrolled"})
  })
  afterEach(()=>{
    for(const name of ["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_SETTINGS_ENABLED",
      "DOGRUADRES_MFA_ENROLLMENT_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED"])
      delete process.env[name]
  })
  const call=async()=>{
    const req:any={body:{email:"self@example.invalid",password:"pw"},socket:{remoteAddress:"127.0.0.1"},
      headers:{},url:"/personal/session",protocol:"https",scope:{resolve:jest.fn().mockReturnValue(auth)}}
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis(),cookie:jest.fn()}
    await POST(req,res)
    return res
  }
  it("creates enrollment-only cookie but never binds native bearer/organization authority",async()=>{
    const r=await call()
    expect(service.personalLoginMfaDecision).toHaveBeenCalledWith("auth_self","not_enrolled")
    expect(service.openPersonalSession).toHaveBeenCalledWith("auth_self","mfa_enroll",{platform:0,person:0})
    expect(bindServerActor).not.toHaveBeenCalled()
    expect(r.status).toHaveBeenCalledWith(202)
    expect(r.json).toHaveBeenCalledWith({enrollment_required:true,csrf_token:"C".repeat(43)})
    expect(r.cookie).toHaveBeenCalledWith("da_session","S".repeat(43),
      expect.objectContaining({httpOnly:true,secure:true,sameSite:"strict"}))
  })
  it("uses full policy-bound login only if native has no enabled factor and platform permits",async()=>{
    service.personalLoginMfaDecision.mockResolvedValue({
      purpose:"full",expectedRevision:{platform:5,person:8},
    })
    const r=await call()
    expect(service.openPersonalSession).toHaveBeenCalledWith("auth_self","full",{platform:5,person:8})
    expect(bindServerActor).toHaveBeenCalledWith(expect.anything(),"S".repeat(43))
    expect(r.json).toHaveBeenCalledWith({csrf_token:"C".repeat(43)})
  })
  it("refuses enabled native factor without Medusa challenge",async()=>{
    ;(readNativeMfaSummary as jest.Mock).mockResolvedValue({enabled:true,state:"enabled"})
    const r=await call()
    expect(r.status).toHaveBeenCalledWith(401)
    expect(service.openPersonalSession).not.toHaveBeenCalled()
  })
  it("issues setup-only session for an unfinished pending TOTP after password proof",async()=>{
    ;(readNativeMfaSummary as jest.Mock).mockResolvedValue({enabled:false,state:"pending"})
    const res=await call()
    expect(res.status).toHaveBeenCalledWith(202)
    expect(service.personalLoginMfaDecision).toHaveBeenCalledWith("auth_self","pending")
    expect(service.openPersonalSession).toHaveBeenCalledWith(
      "auth_self","mfa_enroll",{platform:0,person:0})
    expect(bindServerActor).not.toHaveBeenCalled()
  })
  it("honors real Medusa MFA challenge instead of creating a password-only session",async()=>{
    auth.validateAuthIdentity.mockResolvedValue({authIdentity:identity,mfaChallenge:{id:"native_challenge"}})
    const r=await call()
    expect(service.pendingPersonalChallenge).toHaveBeenCalledWith("auth_self","native_challenge")
    expect(service.openPersonalSession).not.toHaveBeenCalled()
    expect(r.status).toHaveBeenCalledWith(202)
  })
  it("preserves legacy sessions only while all runtime flags are not enabled",async()=>{
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
    service.personalMfaRuntimeActivation.mockResolvedValue(false)
    await call()
    expect(service.openPersonalSession).toHaveBeenCalledWith("auth_self","legacy",undefined)
    expect(service.personalLoginMfaDecision).not.toHaveBeenCalled()
  })
  it("refuses login when rollout flags are enabled before DB activation",async()=>{
    service.personalMfaRuntimeActivation.mockResolvedValue(false)
    const r=await call()
    expect(r.status).toHaveBeenCalledWith(503)
    expect(auth.authenticate).not.toHaveBeenCalled()
    expect(service.openPersonalSession).not.toHaveBeenCalled()
  })
  it("refuses legacy login if persisted activation remains true after flag rollback",async()=>{
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
    const r=await call()
    expect(r.status).toHaveBeenCalledWith(503)
    expect(auth.authenticate).not.toHaveBeenCalled()
  })
  it("denies login when native factor source is unavailable",async()=>{
    ;(readNativeMfaSummary as jest.Mock).mockRejectedValue(Error("Medusa offline"))
    expect((await call()).status).toHaveBeenCalledWith(503)
    expect(service.openPersonalSession).not.toHaveBeenCalled()
  })
  it("fails closed if the server cannot resolve a current Person policy decision",async()=>{
    service.personalLoginMfaDecision.mockRejectedValue(Error("stale policy"))
    expect((await call()).status).toHaveBeenCalledWith(403)
    expect(service.openPersonalSession).not.toHaveBeenCalled()
  })
})
