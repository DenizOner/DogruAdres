import { nativeIngress, trustedOrigin } from "../security"
import { GET as organizationsGet } from "../organizations/route"
describe("personal ingress (unit contract only)",()=>{
  beforeEach(()=>{process.env.DOGRUADRES_IDENTITY_ENABLED="true";process.env.DOGRUADRES_PUBLIC_ORIGIN="https://example.invalid"})
  afterEach(()=>{delete process.env.DOGRUADRES_IDENTITY_ENABLED;delete process.env.DOGRUADRES_PUBLIC_ORIGIN})
  async function probe(path:string,method="GET",authorization?:string,bound=false){const next=jest.fn();const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()};await nativeIngress({originalUrl:path,method,headers:{authorization},...(authorization?.startsWith('Basic ')?{auth_context:{actor_type:'api-key',actor_id:'key'}}:{}),scope:{resolve:()=>({personalNativeCredential:async()=>bound?{}:null,personalMachineGrant:async()=>true})}} as any,res,next);return {next,res}}
  it.each(["/admin/users/me","/vendor/products","/store/customers/me","/auth/token/refresh","/auth/session","/admin/workflows-executions/a/run"])("rejects unbound native actor credentials: %s",async path=>{const {next,res}=await probe(path,"GET","Bearer native-token");expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(401)})
  it.each(["/store/regions","/store/products","/personal","/personal/session"])("preserves allowed surface %s",async path=>expect((await probe(path)).next).toHaveBeenCalled())
  it("allows only exact MFA settings GET/POST, never native or nested variants",async()=>{
    for(const method of ["GET","POST"])expect((await probe("/personal/mfa",method)).next).toHaveBeenCalled()
    for(const [path,method] of [["/personal/mfa","OPTIONS"],["/personal/mfa","DELETE"],["/personal/mfa/admin","POST"]]){
      const {next,res}=await probe(path,method)
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    }
  })
  it("allows exact POST-only MFA enrollment, not native factor endpoints",async()=>{
    expect((await probe("/personal/mfa/enroll","POST")).next).toHaveBeenCalled()
    for(const path of ["/personal/mfa/enroll/extra","/auth/mfa","/auth/mfa/start"]){
      const {next,res}=await probe(path,"POST")
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    }
  })
  it("does not deny every public authentication operation",async()=>expect((await probe("/auth/customer/emailpass","POST")).next).toHaveBeenCalled())
  it("preserves an explicit native machine read, not arbitrary Basic mutations",async()=>{expect((await probe("/admin/api-keys","GET","Basic valid")).next).toHaveBeenCalled();expect((await probe("/admin/api-keys","POST","Basic valid")).res.status).toHaveBeenCalledWith(401)})
  it("permits only the purpose-built personal invitation POST with its own CSRF guard",async()=>{
    expect((await probe("/personal/invitations","POST")).next).toHaveBeenCalled()
    expect((await probe("/personal/invitations","GET")).res.status).toHaveBeenCalledWith(401)
    expect((await probe("/personal/invitations/accept","POST")).res.status).toHaveBeenCalledWith(401)
    expect((await probe("/personal/invitations","OPTIONS")).res.status).toHaveBeenCalledWith(401)
  })
  it.each(["/dogruadres/organizations/daorg_test/invitations","/dogruadres/invitations/accept"])(
    "keeps native invitation mutations closed even for live ledger credentials: %s",async path=>{
      for(const authorization of [undefined,"Bearer leaked","Bearer ledger-bound"]){
        const {next,res}=await probe(path,"POST",authorization,authorization==="Bearer ledger-bound")
        expect(next).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(401)
      }
    })
  it("rejects forged origin and absent deployment origin",()=>{expect(trustedOrigin({headers:{origin:"https://attacker.invalid"}} as any)).toBe(false);delete process.env.DOGRUADRES_PUBLIC_ORIGIN;expect(trustedOrigin({headers:{origin:"https://example.invalid"}} as any)).toBe(false)})
  it.each(["/ADMIN/users/me","/%61dmin/users/me","//admin/users/me/"])("normalizes native aliases before the gate: %s",async path=>expect((await probe(path,"GET","Bearer stolen")).res.status).toHaveBeenCalledWith(401))
  it("turning off UI never reopens the native bearer boundary",async()=>{process.env.DOGRUADRES_IDENTITY_ENABLED="false";expect((await probe("/admin/users/me","GET","Bearer stolen")).res.status).toHaveBeenCalledWith(401)})
  it.each(["/auth/verification/request","/auth/verification/confirm"])("verification identity credentials require a live ledger: %s",async path=>{
    expect((await probe(path,"POST","Bearer revoked")).res.status).toHaveBeenCalledWith(401)
    expect((await probe(path,"POST","Bearer current",true)).next).toHaveBeenCalled()
  })
  it("preserves anonymous code confirmation, but never anonymous verification request",async()=>{
    expect((await probe("/auth/verification/confirm","POST")).next).toHaveBeenCalled()
    expect((await probe("/auth/verification/request","POST")).res.status).toHaveBeenCalledWith(401)
  })
  it("does not treat a native cookie session as anonymous verification",async()=>{
    const next=jest.fn(),res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
    await nativeIngress({originalUrl:"/auth/verification/confirm",method:"POST",headers:{},session:{auth_context:{auth_identity_id:"old-native-session"}}} as any,res,next)
    expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(401)
  })
  it("leaves purpose-bound reset credentials to Medusa's single-use purpose validator",async()=>{
    expect((await probe("/auth/customer/emailpass/update","POST","Bearer reset-purpose")).next).toHaveBeenCalled()
    expect((await probe("/auth/customer/emailpass/reset-password","POST")).next).toHaveBeenCalled()
  })
  it.each(["/hooks/private","/hooks/payment/provider/extra","/cloud/auth/users","/plugin/private","/personal-future","/personal/private","/static/private","/dashboard/api/private"])("unknown/native namespaces fail closed: %s",async path=>{
    expect((await probe(path,"POST","Bearer stolen")).res.status).toHaveBeenCalledWith(401)
    expect((await probe(path,"OPTIONS")).res.status).toHaveBeenCalledWith(401)
  })
  it("permits only the documented payment callback and public cloud capability read",async()=>{
    expect((await probe("/hooks/payment/pp_system","POST")).next).toHaveBeenCalled()
    expect((await probe("/hooks/payment/pp_system","POST","Bearer stolen")).res.status).toHaveBeenCalledWith(401)
    expect((await probe("/cloud/auth")).next).toHaveBeenCalled()
  })

  it.each([
    {id:"daorg_test",role:"owner"},
    {id:"daorg_test",actor_id:"user_other"},
    {id:"daorg_test",cache:"true"},
    {organization:"daorg_test"},
    {id:["daorg_test"]},
    {id:"daorg_test",fields:"*"},
  ])("rejects injected Organization query fields before resolving Foundation: %p",async query=>{
    const personalOrganizations=jest.fn()
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
    await organizationsGet({query,headers:{cookie:"da_session=synthetic"},scope:{resolve:()=>({personalOrganizations})}} as any,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(personalOrganizations).not.toHaveBeenCalled()
  })
  it("keeps exact-id and current-session Organization reads available",async()=>{
    const result={organizations:[{id:"daorg_allowed"}]}
    const personalOrganizations=jest.fn().mockResolvedValue(result)
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
    const req:any={query:{id:"daorg_allowed"},headers:{cookie:"da_session=synthetic"},scope:{resolve:()=>({personalOrganizations})}}
    await organizationsGet(req,res)
    expect(personalOrganizations).toHaveBeenCalledWith("synthetic","daorg_allowed")
    expect(res.json).toHaveBeenCalledWith(result)
    expect(res.status).not.toHaveBeenCalled()
  })
})
