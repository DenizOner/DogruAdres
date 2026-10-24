import { POST,GET,DELETE } from "../session/route"
import { access,enabled,sessionToken,trustedOrigin,secureCookies,csrf,csrfEnrollment } from "../security"
import { bindServerActor } from "../server-actor"
import { readNativeMfaSummary } from "../../../modules/dogruadres-access/native-mfa-summary"

jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn(),trustedOrigin:jest.fn(),
  secureCookies:jest.fn(()=>true),csrf:jest.fn(),csrfEnrollment:jest.fn(),
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
    closePersonalSession:jest.fn(),personalSession:jest.fn(),
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
    service.personalSession.mockResolvedValue(null)
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
  const callRead=async(kind:"GET"|"DELETE")=>{
    const req:any={headers:{},query:{},scope:{resolve:jest.fn().mockReturnValue(auth)}}
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis(),clearCookie:jest.fn(),cookie:jest.fn()}
    await (kind==="GET"?GET:DELETE)(req,res)
    return res
  }
  it("returns HTTP 401 for missing GET cookie without touching the database",async()=>{
    const result=await callRead("GET")
    expect(result.status).toHaveBeenCalledWith(401)
    expect(service.personalSession).not.toHaveBeenCalled()
    expect(bindServerActor).not.toHaveBeenCalled()
  })
  it("returns controlled HTTP 503 if session lookup fails for a valid cookie",async()=>{
    ;(sessionToken as jest.Mock).mockReturnValue("S".repeat(43))
    service.personalSession.mockRejectedValue(Error("synthetic PG outage"))
    const result=await callRead("GET")
    expect(result.status).toHaveBeenCalledWith(503)
    expect(bindServerActor).not.toHaveBeenCalled()
  })
  it("denies unauthenticated logout without a database call",async()=>{
    const result=await callRead("DELETE")
    expect(result.status).toHaveBeenCalledWith(403)
    expect(csrf).not.toHaveBeenCalled()
    expect(service.closePersonalSession).not.toHaveBeenCalled()
  })
  it("denies logout during CSRF datasource failure without claiming success",async()=>{
    ;(sessionToken as jest.Mock).mockReturnValue("S".repeat(43))
    ;(csrf as jest.Mock).mockRejectedValue(Error("synthetic PG outage"))
    const result=await callRead("DELETE")
    expect(result.status).toHaveBeenCalledWith(503)
    expect(service.closePersonalSession).not.toHaveBeenCalled()
    expect(result.clearCookie).not.toHaveBeenCalled()
  })
  it("does not report successful logout if persistent session revoke fails",async()=>{
    ;(sessionToken as jest.Mock).mockReturnValue("S".repeat(43))
    ;(csrf as jest.Mock).mockResolvedValue(true)
    service.closePersonalSession.mockRejectedValue(Error("synthetic revoke fault"))
    const result=await callRead("DELETE")
    expect(service.closePersonalSession).toHaveBeenCalledWith("S".repeat(43),false)
    expect(result.status).toHaveBeenCalledWith(503)
    expect(result.clearCookie).not.toHaveBeenCalled()
    expect(result.json).not.toHaveBeenCalledWith({success:true})
  })
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
  it.each(["full","mfa_enroll"] as const)(
    "revokes the previous browser session before issuing %s cookie",async(purpose)=>{
      const old="O".repeat(43)
      ;(sessionToken as jest.Mock).mockReturnValue(old)
      service.personalLoginMfaDecision.mockResolvedValue({
        purpose,expectedRevision:{platform:0,person:0},
      })
      const r=await call()
      expect(service.closePersonalSession).toHaveBeenCalledWith(old,false)
      expect(service.closePersonalSession).not.toHaveBeenCalledWith("S".repeat(43),false)
      expect(r.cookie).toHaveBeenCalledWith("da_session","S".repeat(43),expect.anything())
    })
  it.each(["full","mfa_enroll"] as const)(
    "fails closed and revokes newly minted %s session if prior-session retirement fails",async(purpose)=>{
      const old="O".repeat(43)
      ;(sessionToken as jest.Mock).mockReturnValue(old)
      service.personalLoginMfaDecision.mockResolvedValue({
        purpose,expectedRevision:{platform:0,person:0},
      })
      service.closePersonalSession.mockRejectedValueOnce(Error("synthetic stale-session outage"))
        .mockResolvedValueOnce(undefined)
      const r=await call()
      expect(service.closePersonalSession).toHaveBeenNthCalledWith(1,old,false)
      expect(service.closePersonalSession).toHaveBeenNthCalledWith(2,"S".repeat(43),false)
      expect(r.status).toHaveBeenCalledWith(503)
      expect(r.cookie).not.toHaveBeenCalled()
    })
  it("does not return a new login cookie if both stale-session retirement and cleanup fail",async()=>{
    ;(sessionToken as jest.Mock).mockReturnValue("O".repeat(43))
    service.closePersonalSession.mockRejectedValue(Error("synthetic DB outage"))
    const r=await call()
    expect(service.closePersonalSession).toHaveBeenCalledTimes(2)
    expect(r.status).toHaveBeenCalledWith(503)
    expect(r.cookie).not.toHaveBeenCalled()
  })
  it("returns a controlled 503 and no cookie if full-session actor binding and compensation fail",async()=>{
    service.personalLoginMfaDecision.mockResolvedValue({
      purpose:"full",expectedRevision:{platform:0,person:0},
    })
    ;(bindServerActor as jest.Mock).mockRejectedValue(Error("synthetic actor-binding fault"))
    service.closePersonalSession.mockRejectedValue(Error("synthetic cleanup fault"))
    const r=await call()
    expect(service.closePersonalSession).toHaveBeenCalledWith("S".repeat(43),false)
    expect(r.status).toHaveBeenCalledWith(503)
    expect(r.cookie).not.toHaveBeenCalled()
  })
  it("refuses enabled native factor without Medusa challenge",async()=>{
    ;(readNativeMfaSummary as jest.Mock).mockResolvedValue({enabled:true,state:"enabled"})
    const r=await call()
    expect(r.status).toHaveBeenCalledWith(401)
    expect(service.openPersonalSession).not.toHaveBeenCalled()
  })
  it("does not mint any session if pending native factor meets disabled platform policy",async()=>{
    ;(readNativeMfaSummary as jest.Mock).mockResolvedValue({enabled:false,state:"pending"})
    service.personalLoginMfaDecision.mockRejectedValue(Error("Access denied"))
    const res=await call()
    expect(service.personalLoginMfaDecision).toHaveBeenCalledWith("auth_self","pending")
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.openPersonalSession).not.toHaveBeenCalled()
    expect(bindServerActor).not.toHaveBeenCalled()
    expect(res.cookie).not.toHaveBeenCalled()
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
