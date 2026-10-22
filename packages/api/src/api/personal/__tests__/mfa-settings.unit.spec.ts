import { GET, POST } from "../mfa/route"
import { GET as PersonalPageGET } from "../route"
import { access, csrf, enabled, sessionToken } from "../security"

jest.mock("../security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))

describe("M0 MFA platform and personal settings ingress", () => {
  const store = {
    personalMfaSettings: jest.fn(),
    personalSession: jest.fn(),
    personalSetMfaPreference: jest.fn(),
    personalSetPlatformMfaMode: jest.fn(),
  }
  const nativeAuth = { listAuthMfa: jest.fn() }
  const platform = { platform_mode:"optional",version:4 }
  const personal = { person_id:"daprs_1",user_enabled:false,version:2 }
  beforeEach(()=>{
    jest.resetAllMocks()
    process.env.DOGRUADRES_MFA_SETTINGS_ENABLED="true"
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("server-cookie-session")
    ;(access as jest.Mock).mockReturnValue(store)
    store.personalSession.mockResolvedValue({ person_id:"daprs_1", auth_identity_id:"auth_self" })
    nativeAuth.listAuthMfa.mockResolvedValue([{
      id:"authmfa_self",auth_identity_id:"auth_self",provider:"totp",
      status:"enabled",metadata:{secret:"never-return-this"},
    }])
    store.personalMfaSettings.mockResolvedValue({
      platform,personal,can_manage_platform:false,native_factor_state:"unverified",
    })
    store.personalSetMfaPreference.mockResolvedValue({...personal,user_enabled:true,version:3})
    store.personalSetPlatformMfaMode.mockResolvedValue({...platform,platform_mode:"required",version:5})
  })
  afterEach(()=>{
    delete process.env.DOGRUADRES_MFA_SETTINGS_ENABLED
    delete process.env.DOGRUADRES_IDENTITY_ENABLED
    delete process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
  })
  const invoke=async(method:"GET"|"POST",body?:unknown,query={})=>{
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
    const req:any={body,query,headers:{cookie:"da_session=server-cookie-session"},
      scope:{resolve:jest.fn().mockReturnValue(nativeAuth)}}
    if(method==="GET")await GET(req,res);else await POST(req,res)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    return res
  }
  it.each(["disabled","no global identity"])("never touches persistence when %s",async cause=>{
    if(cause==="disabled")delete process.env.DOGRUADRES_MFA_SETTINGS_ENABLED
    else (enabled as jest.Mock).mockReturnValue(false)
    const r=await invoke("POST",{action:"platform",platform_mode:"disabled",expected_version:4})
    expect(r.status).toHaveBeenCalledWith(503)
    expect(store.personalSetPlatformMfaMode).not.toHaveBeenCalled()
  })
  it("reads only current server session without user id query",async()=>{
    const r=await invoke("GET")
    expect(store.personalMfaSettings).toHaveBeenCalledWith("server-cookie-session")
    expect(nativeAuth.listAuthMfa).toHaveBeenCalledWith(
      {auth_identity_id:"auth_self"},{take:101,skip:0}
    )
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({
      platform,personal,native_factor_state:"enabled",
      effective_mfa_target:{required:true,next_step:"verify_mfa",user_control_allowed:true},
      runtime_enforcement:"not_yet_enabled",
    }))
    const payload=JSON.stringify(r.json.mock.calls[0][0])
    expect(payload).not.toContain("authmfa_self")
    expect(payload).not.toContain("never-return-this")
  })
  it("reports enforced only when all four rollout flags are active on an authorized session",async()=>{
    process.env.DOGRUADRES_IDENTITY_ENABLED="true"
    process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED="true"
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED="true"
    const active=await invoke("GET")
    expect(active.json).toHaveBeenCalledWith(expect.objectContaining({
      runtime_enforcement:"enforced",
    }))
    delete process.env.DOGRUADRES_MFA_RUNTIME_ENABLED
    const inactive=await invoke("GET")
    expect(inactive.json).toHaveBeenCalledWith(expect.objectContaining({
      runtime_enforcement:"not_yet_enabled",
    }))
  })
  it("personal HTML consumes validated runtime status instead of claiming MFA is always inactive",async()=>{
    const res:any={status:jest.fn().mockReturnThis(),setHeader:jest.fn(),
      type:jest.fn().mockReturnThis(),send:jest.fn().mockReturnThis()}
    await PersonalPageGET({} as any,res)
    const html=String(res.send.mock.calls[0][0])
    expect(html).toContain("data.runtime_enforcement!=='enforced'")
    expect(html).toContain("data.runtime_enforcement==='enforced'")
    expect(html).toContain("MFA oturum kapsamı denetimi etkin.")
    expect(html).toContain("MFA politikası oturum akışına henüz uygulanmıyor.")
  })
  it("rejects current session absence, never discloses platform or Person",async()=>{
    store.personalMfaSettings.mockResolvedValue(null)
    const r=await invoke("GET")
    expect(r.status).toHaveBeenCalledWith(403)
  })
  it("rejects arbitrary GET query fields before resolving session",async()=>{
    const r=await invoke("GET",undefined,{person_id:"daprs_victim"})
    expect(r.status).toHaveBeenCalledWith(400)
    expect(store.personalMfaSettings).not.toHaveBeenCalled()
  })
  it.each([
    {action:"personal",person_id:"daprs_victim",user_enabled:false,expected_version:2},
    {action:"personal",actor_id:"user_admin",user_enabled:false,expected_version:2},
    {action:"personal",user_enabled:"false",expected_version:2},
    {action:"platform",platform_mode:"true",expected_version:4},
    {action:"platform",platform_mode:"required",role:"owner",expected_version:4},
    {action:"platform",platform_mode:"optional",expected_version:-1},
    {action:"platform",platform_mode:"disabled",expected_version:1.2},
    {},
  ])("rejects arbitrary selector or corrupt body %p",async body=>{
    const r=await invoke("POST",body)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(store.personalSetMfaPreference).not.toHaveBeenCalled()
    expect(store.personalSetPlatformMfaMode).not.toHaveBeenCalled()
  })
  it("denies missing session before querying native factor state",async()=>{
    store.personalSession.mockResolvedValue(null)
    const r=await invoke("GET")
    expect(r.status).toHaveBeenCalledWith(403)
    expect(nativeAuth.listAuthMfa).not.toHaveBeenCalled()
  })
  it("rejects mismatch between Person session and persisted MFA settings",async()=>{
    store.personalMfaSettings.mockResolvedValue({
      platform,personal:{...personal,person_id:"daprs_other"},
      can_manage_platform:false,native_factor_state:"unverified",
    })
    const r=await invoke("GET")
    expect(r.status).toHaveBeenCalledWith(403)
    expect(nativeAuth.listAuthMfa).not.toHaveBeenCalled()
  })
  it("fails closed when Medusa MFA factor listing is unavailable",async()=>{
    nativeAuth.listAuthMfa.mockRejectedValue(Error("offline"))
    const get=await invoke("GET")
    expect(get.status).toHaveBeenCalledWith(503)
    const post=await invoke("POST",{action:"personal",user_enabled:true,expected_version:2})
    expect(post.status).toHaveBeenCalledWith(503)
    expect(store.personalSetMfaPreference).not.toHaveBeenCalled()
  })
  it("cannot set personal MFA enabled before native factor verification",async()=>{
    nativeAuth.listAuthMfa.mockResolvedValue([])
    const r=await invoke("POST",{action:"personal",user_enabled:true,expected_version:2})
    expect(r.status).toHaveBeenCalledWith(409)
    expect(store.personalSetMfaPreference).not.toHaveBeenCalled()
  })
  it("cannot claim personal MFA off while native factor is enabled",async()=>{
    const r=await invoke("POST",{action:"personal",user_enabled:false,expected_version:2})
    expect(r.status).toHaveBeenCalledWith(409)
    expect(store.personalSetMfaPreference).not.toHaveBeenCalled()
  })
  it("rejects cross-identity native factor results",async()=>{
    nativeAuth.listAuthMfa.mockResolvedValue([{
      id:"other",auth_identity_id:"auth_other",provider:"totp",status:"enabled",
    }])
    const r=await invoke("GET")
    expect(r.status).toHaveBeenCalledWith(503)
  })
  it("requires browser origin + CSRF before invoking any write",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    const r=await invoke("POST",{action:"personal",user_enabled:true,expected_version:2})
    expect(r.status).toHaveBeenCalledWith(403)
    expect(store.personalSetMfaPreference).not.toHaveBeenCalled()
  })
  it("persists ONLY server-selected Person preference; flags native state as unverified",async()=>{
    const r=await invoke("POST",{action:"personal",user_enabled:true,expected_version:2})
    expect(store.personalSetMfaPreference).toHaveBeenCalledWith("server-cookie-session",true,2)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({native_factor_state:"unverified"}))
    expect(store.personalSetPlatformMfaMode).not.toHaveBeenCalled()
  })
  it("requires platform-specific server grant; no authority inferred from Person",async()=>{
    store.personalSetPlatformMfaMode.mockResolvedValue(null)
    const r=await invoke("POST",{action:"platform",platform_mode:"disabled",expected_version:4})
    expect(r.status).toHaveBeenCalledWith(403)
    expect(store.personalSetMfaPreference).not.toHaveBeenCalled()
  })
  it("records platform mode with explicit pending native factor reconciliation",async()=>{
    const r=await invoke("POST",{action:"platform",platform_mode:"required",expected_version:4})
    expect(store.personalSetPlatformMfaMode).toHaveBeenCalledWith("server-cookie-session","required",4)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({native_factor_transition:"pending_reconciliation"}))
  })
  it("denies stale client version with 409, not a blind overwrite",async()=>{
    const {MfaConcurrentUpdateError}=require("../../../modules/dogruadres-access/mfa-persistence")
    store.personalSetMfaPreference.mockRejectedValue(new MfaConcurrentUpdateError())
    const r=await invoke("POST",{action:"personal",user_enabled:true,expected_version:2})
    expect(r.status).toHaveBeenCalledWith(409)
  })
})
