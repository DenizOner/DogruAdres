import { POST } from "../challenge/route"
import { GET as PersonalPageGET } from "../route"
import { access,enabled,sessionToken,trustedOrigin,secureCookies } from "../security"
import { bindServerActor } from "../server-actor"
import { csrfToken } from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn(),trustedOrigin:jest.fn(),
  secureCookies:jest.fn(),
}))
jest.mock("../server-actor",()=>({bindServerActor:jest.fn()}))
jest.mock("../../../modules/dogruadres-access/identity-session",()=>({
  csrfToken:jest.fn(), // Static identity/session proof is independently tested.
}))
describe("M0 native MFA challenge and single-use recovery method",()=>{
  const ticket="T".repeat(43),csrf="C".repeat(43)
  const session="S".repeat(43)
  const service={
    readPersonalChallenge:jest.fn(),completePersonalChallenge:jest.fn(),
    closePersonalSession:jest.fn(),
  }
  const native={verifyAuthMfaChallenge:jest.fn()}
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(trustedOrigin as jest.Mock).mockReturnValue(true)
    ;(secureCookies as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("")
    ;(csrfToken as jest.Mock).mockReturnValue(csrf)
    ;(bindServerActor as jest.Mock).mockResolvedValue(true)
    ;(access as jest.Mock).mockReturnValue(service)
    service.readPersonalChallenge.mockResolvedValue({challenge_id:"native_mfa_1",auth_identity_id:"auth_self"})
    service.completePersonalChallenge.mockResolvedValue({token:session,csrf})
    native.verifyAuthMfaChallenge.mockResolvedValue({
      auth_identity_id:"auth_self",completed_at:new Date(),
    })
  })
  const call=async(body:unknown,cookie="da_challenge="+ticket,header=csrf)=>{
    const req:any={body,headers:{cookie,"x-csrf-token":header},scope:{resolve:jest.fn().mockReturnValue(native)}}
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis(),cookie:jest.fn(),clearCookie:jest.fn()}
    await POST(req,res)
    return res
  }
  it("resynchronizes browser TOTP/recovery code input rules after a previous form reset",async()=>{
    const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),
      status:jest.fn().mockReturnThis(),send:jest.fn().mockReturnThis()}
    await PersonalPageGET({} as any,res)
    const html=String(res.send.mock.calls[0][0])
    expect(html).toContain("el('challenge').elements.method.onchange();")
    expect(html).toContain("field.pattern=recovery?'[A-Za-z0-9-]{8,128}':'[0-9]{6}'")
  })
  it("accepts existing six digit TOTP input without a method (backwards compatible)",async()=>{
    const r=await call({code:"123456"})
    expect(native.verifyAuthMfaChallenge).toHaveBeenCalledWith({
      id:"native_mfa_1",auth_identity_id:"auth_self",method:"totp",code:"123456",
    })
    expect(r.cookie).toHaveBeenCalledWith("da_session",session,
      expect.objectContaining({httpOnly:true,secure:true,sameSite:"strict"}))
  })
  it("forwards only supported recovery_code method to the exact Medusa challenge",async()=>{
    const r=await call({method:"recovery_code",code:"ABCD-EFGH-1234"})
    expect(native.verifyAuthMfaChallenge).toHaveBeenCalledWith({
      id:"native_mfa_1",auth_identity_id:"auth_self",
      method:"recovery_code",code:"ABCD-EFGH-1234",
    })
    expect(service.completePersonalChallenge).toHaveBeenCalledWith(ticket,expect.any(Date))
    expect(r.json).toHaveBeenCalledWith({csrf_token:csrf})
    expect(JSON.stringify(r.json.mock.calls[0][0])).not.toContain("ABCD-EFGH-1234")
  })
  it.each([
    {method:"password",code:"ABCD-EFGH-1234"},
    {method:"recovery_code",code:"123456"},
    {method:"recovery_code",code:"X".repeat(129)},
    {method:"totp",code:"ABCDEF"},
    {method:"totp",code:"123456",auth_identity_id:"auth_other"},
    {code:"123456",actor_type:"user"},
  ])("rejects malformed or client-chosen MFA identity/method: %p",async body=>{
    const r=await call(body)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(native.verifyAuthMfaChallenge).not.toHaveBeenCalled()
  })
  it("rejects missing verified origin, ticket and csrf before invoking Medusa",async()=>{
    ;(trustedOrigin as jest.Mock).mockReturnValue(false)
    expect((await call({code:"123456"})).status).toHaveBeenCalledWith(403)
    ;(trustedOrigin as jest.Mock).mockReturnValue(true)
    expect((await call({code:"123456"},"","invalid")).status).toHaveBeenCalledWith(403)
    expect(native.verifyAuthMfaChallenge).not.toHaveBeenCalled()
  })
  it("rejects replayed or expired DoğruAdres challenge tickets",async()=>{
    service.readPersonalChallenge.mockResolvedValue(null)
    expect((await call({method:"recovery_code",code:"ABCD-EFGH"})).status)
      .toHaveBeenCalledWith(401)
    expect(native.verifyAuthMfaChallenge).not.toHaveBeenCalled()
  })
  it("does not mint a Person session when native recovery code is invalid or consumed",async()=>{
    native.verifyAuthMfaChallenge.mockRejectedValue(Error("Recovery code invalid or used"))
    const r=await call({method:"recovery_code",code:"ABCD-EFGH"})
    expect(r.status).toHaveBeenCalledWith(401)
    expect(service.completePersonalChallenge).not.toHaveBeenCalled()
    expect(r.cookie).not.toHaveBeenCalled()
  })
  it("rejects a native challenge for a different AuthIdentity",async()=>{
    native.verifyAuthMfaChallenge.mockResolvedValue({
      auth_identity_id:"auth_other",completed_at:new Date(),
    })
    const r=await call({method:"recovery_code",code:"ABCD-EFGH"})
    expect(r.status).toHaveBeenCalledWith(401)
    expect(service.completePersonalChallenge).not.toHaveBeenCalled()
  })
  it("does not mint a cookie if local challenge was already consumed concurrently",async()=>{
    service.completePersonalChallenge.mockRejectedValue(Error("already used"))
    const r=await call({method:"recovery_code",code:"ABCD-EFGH"})
    expect(r.status).toHaveBeenCalledWith(401)
    expect(r.cookie).not.toHaveBeenCalled()
  })
  it("retires the previous browser session before issuing a fresh cookie",async()=>{
    const old="O".repeat(43)
    ;(sessionToken as jest.Mock).mockReturnValue(old)
    service.closePersonalSession.mockResolvedValue(undefined)
    const r=await call({method:"totp",code:"123456"})
    expect(service.closePersonalSession).toHaveBeenCalledWith(old,false)
    expect(service.closePersonalSession).not.toHaveBeenCalledWith(session,false)
    expect(r.cookie).toHaveBeenCalledWith("da_session",session,expect.anything())
  })
  it("denies full cookie and revokes the new session if retiring the old session throws",async()=>{
    const old="O".repeat(43)
    ;(sessionToken as jest.Mock).mockReturnValue(old)
    service.closePersonalSession.mockRejectedValueOnce(Error("synthetic stale-session DB fault"))
      .mockResolvedValueOnce(undefined)
    const r=await call({method:"totp",code:"123456"})
    expect(service.closePersonalSession).toHaveBeenNthCalledWith(1,old,false)
    expect(service.closePersonalSession).toHaveBeenNthCalledWith(2,session,false)
    expect(r.status).toHaveBeenCalledWith(503)
    expect(r.cookie).not.toHaveBeenCalledWith("da_session",expect.anything(),expect.anything())
  })
  it("still denies the cookie if rollback of the new session also throws",async()=>{
    const old="O".repeat(43)
    ;(sessionToken as jest.Mock).mockReturnValue(old)
    service.closePersonalSession.mockRejectedValue(Error("synthetic DB outage"))
    const r=await call({method:"recovery_code",code:"ABCD-EFGH"})
    expect(service.closePersonalSession).toHaveBeenCalledTimes(2)
    expect(r.status).toHaveBeenCalledWith(503)
    expect(r.cookie).not.toHaveBeenCalled()
  })
  it("revokes newly created session if the native actor binding cannot be established",async()=>{
    ;(bindServerActor as jest.Mock).mockResolvedValue(false)
    const r=await call({method:"recovery_code",code:"ABCD-EFGH"})
    expect(r.status).toHaveBeenCalledWith(503)
    expect(service.closePersonalSession).toHaveBeenCalledWith(session,false)
    expect(r.cookie).not.toHaveBeenCalled()
  })
})