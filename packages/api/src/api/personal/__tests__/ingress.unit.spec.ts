import { nativeIngress, trustedOrigin } from "../security"
import middlewareConfig from "../../middlewares"
import { GET as organizationsGet } from "../organizations/route"
describe("personal ingress (unit contract only)",()=>{
  beforeEach(()=>{process.env.DOGRUADRES_IDENTITY_ENABLED="true";process.env.DOGRUADRES_PUBLIC_ORIGIN="https://example.invalid"})
  afterEach(()=>{delete process.env.DOGRUADRES_IDENTITY_ENABLED;delete process.env.DOGRUADRES_PUBLIC_ORIGIN})
  async function probe(path:string,method="GET",authorization?:string,bound=false){const next=jest.fn();const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()};await nativeIngress({originalUrl:path,method,headers:{authorization},...(authorization?.startsWith('Basic ')?{auth_context:{actor_type:'api-key',actor_id:'key'}}:{}),scope:{resolve:()=>({personalNativeCredential:async()=>bound?{}:null,personalMachineGrant:async()=>true})}} as any,res,next);return {next,res}}
  it.each(["/admin/users/me","/vendor/products","/store/customers/me","/auth/token/refresh","/auth/session","/admin/workflows-executions/a/run"])("rejects unbound native actor credentials: %s",async path=>{const {next,res}=await probe(path,"GET","Bearer native-token");expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(401)})
  it.each(["/store/regions","/personal","/personal/session"])("preserves allowed locale/auth surface %s",async path=>expect((await probe(path)).next).toHaveBeenCalled())
  it("admits only exact read-only Organization-scoped order-group route, not native customer reads",async()=>{
    expect((await probe("/personal/order-groups","GET")).next).toHaveBeenCalledTimes(1)
    for(const [path,method] of [
      ["/personal/order-groups","POST"],["/personal/order-groups","DELETE"],
      ["/personal/order-groups","OPTIONS"],["/personal/order-groups/og_foreign","GET"],
      ["/store/order-groups","GET"],["/store/order-groups/og_foreign","GET"],
    ]){
      const {next,res}=await probe(path,method,"Bearer current",true)
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    }
  })
  it("keeps public region bootstrap available even when Medusa resolved a publishable key",async()=>{
    const next=jest.fn(),res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
    await nativeIngress({originalUrl:"/store/regions",method:"GET",
      headers:{"x-publishable-api-key":"pk_synthetic"},
      auth_context:{actor_type:"api-key",actor_id:"apk_synthetic"}} as any,res,next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })
  it("keeps the approved closed B4B catalog private even with a publishable key or native credential",async()=>{
    const targets:Array<[string,string]>=[
      ["/store/products","GET"],["/store/products/prod_test","GET"],
      ["/store/offers","GET"],["/store/sellers","GET"],
      ["/store/product-categories","GET"],["/store/reviews","GET"],
      ["/store/search","POST"],["/store/products?fields=*","GET"],
      ["/store/regions/region_test","GET"]
    ]
    for(const [path,method] of targets){
      for(const authorization of [undefined,"Bearer stolen"]){
        const {next,res}=await probe(path,method,authorization)
        expect(next).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({message:"Personal session ingress required"})
      }
    }
    // A public publishable API key is a sales-channel selector, NOT an
    // active Person/Organization membership or a personal session.
    const next=jest.fn(),res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
    await nativeIngress({originalUrl:"/store/products",method:"GET",
      headers:{"x-publishable-api-key":"pk_synthetic"},
      scope:{resolve:()=>{throw Error("No native module must be consulted")}}} as any,res,next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })
  it("admits only B22 scoped Store application GET/POST and Store read GET (not native Seller mutations)",async()=>{
    for(const method of ["GET","POST"]){
      for(const path of ["/personal/store-applications","/personal/store-draft-permissions"]){
        const {next}=await probe(path,method)
        expect(next).toHaveBeenCalledTimes(1)
      }
    }
    expect((await probe("/personal/organization-stores","GET")).next).toHaveBeenCalledTimes(1)
    expect((await probe("/personal/catalog","GET")).next).toHaveBeenCalledTimes(1)
    expect((await probe("/personal/catalog","POST")).res.status).toHaveBeenCalledWith(401)
    for(const [path,method] of [
      ["/personal/store-draft-permissions","PATCH"],["/personal/store-draft-permissions","DELETE"],
      ["/personal/store-draft-permissions","OPTIONS"],["/personal/store-draft-permissions/other","POST"],
      ["/personal/store-applications","PATCH"],["/personal/store-applications","DELETE"],
      ["/personal/store-applications","OPTIONS"],["/personal/store-applications","HEAD"],
      ["/personal/store-applications/another","POST"],["/personal/store-applications/","PUT"],
      ["/personal/organization-stores","POST"],["/personal/organization-stores","DELETE"],
      ["/vendor/sellers","POST"],["/admin/sellers/sel_synthetic/approve","POST"]
    ]){
      const {next,res}=await probe(path,method,"Bearer malicious")
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    }
  })
  it("allows only the exact Staff name-transfer personal route, not native or nested bypasses",async()=>{
    for(const method of ["GET","POST"]){
      const allowed=await probe("/personal/platform/store-name-transfers",method)
      expect(allowed.next).toHaveBeenCalledTimes(1)
    }
    for(const [path,method] of [
      ["/personal/platform/store-name-transfers","DELETE"],
      ["/personal/platform/store-name-transfers","PATCH"],
      ["/personal/platform/store-name-transfers","OPTIONS"],
      ["/personal/platform/store-name-transfers/sel_foreign","GET"],
      ["/vendor/sellers/sel_foreign","POST"],
      ["/admin/sellers/sel_foreign","PATCH"]
    ]){
      const denied=await probe(path,method,"Bearer forged-native")
      expect(denied.next).not.toHaveBeenCalled()
      expect(denied.res.status).toHaveBeenCalledWith(401)
    }
  })
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
  it("permits only exact personal invitation GET/POST, leaving role/session and CSRF checks to the route",async()=>{
    for(const method of ["GET","POST"]){
      const {next,res}=await probe("/personal/invitations",method)
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    }
    for(const [path,method] of [
      ["/personal/invitations","PUT"],
      ["/personal/invitations","DELETE"],
      ["/personal/invitations","PATCH"],
      ["/personal/invitations","OPTIONS"],
      ["/personal/invitations/accept","POST"],
      ["/personal/invitations/extra","GET"],
    ]){
      const {next,res}=await probe(path,method)
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    }
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
  it("preserves anonymous email verification GET and POST, but never other methods",async()=>{
    for(const method of ["GET","POST"])expect((await probe("/auth/verify-email",method)).next).toHaveBeenCalled()
    for(const method of ["PUT","DELETE","OPTIONS"])expect((await probe("/auth/verify-email",method)).res.status).toHaveBeenCalledWith(401)
  })
  it("preserves platform SMTP management GET and POST", async () => {
    expect((await probe("/personal/platform/smtp", "GET")).next).toHaveBeenCalled()
    expect((await probe("/personal/platform/smtp", "POST")).next).toHaveBeenCalled()
    expect((await probe("/personal/platform/smtp", "DELETE")).next).not.toHaveBeenCalled()
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
  it("keeps payment callbacks closed until authorization-before-capture is proven",async()=>{
    const anonymous=await probe("/hooks/payment/pp_system","POST")
    expect(anonymous.next).not.toHaveBeenCalled()
    expect(anonymous.res.status).toHaveBeenCalledWith(403)
    const bearer=await probe("/hooks/payment/pp_system","POST","Bearer stolen")
    expect(bearer.next).not.toHaveBeenCalled()
    expect(bearer.res.status).toHaveBeenCalledWith(403)
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
  it.each(['1','01','true'])('only exact observer header uses no-touch authority: %s',async value=>{
    const personalOrganizations=jest.fn().mockResolvedValue(null),observePersonalOrganizations=jest.fn().mockResolvedValue(null)
    const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
    await organizationsGet({query:{id:'daorg_denied'},headers:{cookie:'da_session=synthetic','x-da-observe':value},scope:{resolve:()=>({personalOrganizations,observePersonalOrganizations})}} as any,res)
    expect(value==='1'?observePersonalOrganizations:personalOrganizations).toHaveBeenCalledWith('synthetic','daorg_denied')
    expect(value==='1'?personalOrganizations:observePersonalOrganizations).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("admits only dedicated Staff review GET/POST, rejecting unsafe methods and nested routes",async()=>{
    const path="/personal/platform/store-closing-reviews"
    for(const method of ["GET","POST"])
      expect((await probe(path,method)).next).toHaveBeenCalledTimes(1)
    for(const [target,method] of [
      [path,"PUT"],[path,"PATCH"],[path,"DELETE"],[path,"OPTIONS"],
      [path+"/id","GET"],[path+"/id","POST"],
      ["/vendor/platform/store-closing-reviews","GET"]
    ]){
      const denied=await probe(target,method,"Bearer native-forged")
      expect(denied.next).not.toHaveBeenCalled()
      expect(denied.res.status).toHaveBeenCalledWith(401)
    }
  })

  it("admits only second-stage private Owner review POST; all other verbs and nested paths stay closed",async()=>{
    const path="/personal/store-platform-closing-final-review"
    expect((await probe(path,"POST")).next).toHaveBeenCalledTimes(1)
    for(const [target,method] of [
      [path,"GET"],[path,"PUT"],[path,"DELETE"],[path,"PATCH"],
      [path,"OPTIONS"],[path+"/x","POST"],["/vendor/store-platform-closing-final-review","POST"]
    ]){
      const denied=await probe(target,method,"Bearer native-forged")
      expect(denied.next).not.toHaveBeenCalled()
      expect(denied.res.status).toHaveBeenCalledWith(401)
    }
  })

  it("admits only authenticated Owner email-link POST ingress; GET scanners are blocked",async()=>{
    const path="/personal/store-platform-closing-email-visit"
    expect((await probe(path,"POST")).next).toHaveBeenCalledTimes(1)
    for(const [target,method] of [
      [path,"GET"],[path,"PUT"],[path,"DELETE"],[path,"PATCH"],
      [path,"OPTIONS"],[path+"/x","POST"],["/vendor/notifications","POST"]
    ]){
      const denied=await probe(target,method,"Bearer native-forged")
      expect(denied.next).not.toHaveBeenCalled()
      expect(denied.res.status).toHaveBeenCalledWith(401)
    }
  })

  it("restricts B22 private Owner email readiness to exact personal GET ingress",async()=>{
    const path="/personal/platform/store-closing-email-readiness"
    const allowed=await probe(path,"GET")
    expect(allowed.next).toHaveBeenCalledTimes(1)
    for(const [target,method] of [
      [path,"POST"],[path,"PUT"],[path,"DELETE"],
      [path,"PATCH"],[path,"OPTIONS"],[path+"/id","GET"],
      ["/vendor/notifications","GET"],
      // Native ingress intentionally normalizes trailing slashes. The public
      // frontdoor independently rejects path+"/" (covered by its own test).
    ]){
      const blocked=await probe(target,method,"Bearer forged-native")
      expect(blocked.next).not.toHaveBeenCalled()
      expect(blocked.res.status).toHaveBeenCalledWith(401)
    }
  })

  it("admits only private Person profile GET and CSRF-protected POST at the outer ingress",async()=>{
    expect((await probe("/personal/profile","GET")).next).toHaveBeenCalledTimes(1)
    expect((await probe("/personal/profile","POST")).next).toHaveBeenCalledTimes(1)
    for(const method of ["PUT","DELETE","PATCH"]){
      const r=await probe("/personal/profile",method)
      expect(r.next).not.toHaveBeenCalled()
      expect(r.res.status).toHaveBeenCalledWith(401)
    }
  })

})

describe("personal HTTP error handling (unit contract)", () => {
  const handle = (middlewareConfig as unknown as { errorHandler: (error: any, req: any, res: any, next: any) => void }).errorHandler

  it.each([
    { type: "not_found", status: 404, message: "Not found" },
    { type: "forbidden", status: 403, message: "Access denied" },
    { type: "invalid_data", status: 400, message: "Invalid input" },
    { type: "unauthorized", status: 401, message: "Access denied" },
    { type: "unexpected_error", status: 503, message: "Service unavailable" },
  ])("maps $type to a safe HTTP $status without disclosing the underlying error", ({ type, status, message }) => {
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
    const next = jest.fn()
    handle({ type, message: "Private identity, organization and DB details" }, { path: "/personal/memberships" }, res, next)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({ message })
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("Private identity")
    expect(next).not.toHaveBeenCalled()
  })
})
