import { GET, POST } from "../mfa/route"
import { access, csrf, enabled, sessionToken } from "../security"

jest.mock("../security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))

describe("M0 MFA platform and personal settings ingress", () => {
  const store = {
    personalMfaSettings: jest.fn(),
    personalSetMfaPreference: jest.fn(),
    personalSetPlatformMfaMode: jest.fn(),
  }
  const platform = { platform_mode:"optional",version:4 }
  const personal = { person_id:"daprs_1",user_enabled:false,version:2 }
  beforeEach(()=>{
    jest.resetAllMocks()
    process.env.DOGRUADRES_MFA_SETTINGS_ENABLED="true"
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("server-cookie-session")
    ;(access as jest.Mock).mockReturnValue(store)
    store.personalMfaSettings.mockResolvedValue({
      platform,personal,can_manage_platform:false,native_factor_state:"unverified",
    })
    store.personalSetMfaPreference.mockResolvedValue({...personal,user_enabled:true,version:3})
    store.personalSetPlatformMfaMode.mockResolvedValue({...platform,platform_mode:"required",version:5})
  })
  afterEach(()=>{delete process.env.DOGRUADRES_MFA_SETTINGS_ENABLED})
  const invoke=async(method:"GET"|"POST",body?:unknown,query={})=>{
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
    const req:any={body,query,headers:{cookie:"da_session=server-cookie-session"}}
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
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({platform,personal}))
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
