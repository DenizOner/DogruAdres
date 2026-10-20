import { nativeIngress, trustedOrigin } from "../security"
describe("personal ingress (unit contract only)",()=>{
  beforeEach(()=>{process.env.DOGRUADRES_IDENTITY_ENABLED="true";process.env.DOGRUADRES_PUBLIC_ORIGIN="https://example.invalid"})
  afterEach(()=>{delete process.env.DOGRUADRES_IDENTITY_ENABLED;delete process.env.DOGRUADRES_PUBLIC_ORIGIN})
  async function probe(path:string,method="GET",authorization?:string){const next=jest.fn();const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()};await nativeIngress({originalUrl:path,method,headers:{authorization},auth_context:{actor_type:'api-key',actor_id:'key'},scope:{resolve:()=>({personalNativeCredential:async()=>null,personalMachineGrant:async()=>true})}} as any,res,next);return {next,res}}
  it.each(["/admin/users/me","/vendor/products","/store/customers/me","/auth/token/refresh","/auth/session","/admin/workflows-executions/a/run"])("rejects unbound native actor credentials: %s",async path=>{const {next,res}=await probe(path,"GET","Bearer native-token");expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(401)})
  it.each(["/store/regions","/store/products","/personal","/personal/session"])("preserves allowed surface %s",async path=>expect((await probe(path)).next).toHaveBeenCalled())
  it("does not deny every public authentication operation",async()=>expect((await probe("/auth/customer/emailpass","POST")).next).toHaveBeenCalled())
  it("preserves an explicit native machine read, not arbitrary Basic mutations",async()=>{expect((await probe("/admin/api-keys","GET","Basic valid")).next).toHaveBeenCalled();expect((await probe("/admin/api-keys","POST","Basic valid")).res.status).toHaveBeenCalledWith(401)})
  it("rejects forged origin and absent deployment origin",()=>{expect(trustedOrigin({headers:{origin:"https://attacker.invalid"}} as any)).toBe(false);delete process.env.DOGRUADRES_PUBLIC_ORIGIN;expect(trustedOrigin({headers:{origin:"https://example.invalid"}} as any)).toBe(false)})
  it.each(["/ADMIN/users/me","/%61dmin/users/me","//admin/users/me/"])("normalizes native aliases before the gate: %s",async path=>expect((await probe(path,"GET","Bearer stolen")).res.status).toHaveBeenCalledWith(401))
  it("turning off UI never reopens the native bearer boundary",async()=>{process.env.DOGRUADRES_IDENTITY_ENABLED="false";expect((await probe("/admin/users/me","GET","Bearer stolen")).res.status).toHaveBeenCalledWith(401)})
})
