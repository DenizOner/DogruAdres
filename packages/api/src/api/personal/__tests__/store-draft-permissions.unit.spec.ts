import {GET,POST} from "../store-draft-permissions/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 private Store draft Member grant route (unit, not Chrome/PG16)",()=>{
  let req:any,res:any,svc:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={
      personalListStoreDraftPermissions:jest.fn().mockResolvedValue({members:[],grants:[]}),
      personalChangeStoreDraftPermission:jest.fn().mockResolvedValue({status:"active",grant_id:"dasdpg_valid"})
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={query:{organization_id:"daorg_a"},headers:{},
      body:{action:"grant",organization_id:"daorg_a",membership_id:"damem_a"}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("rejects missing CSRF, native Seller header and unapproved action",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    req.headers["x-seller-id"]="sel_other"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    delete req.headers["x-seller-id"]
    req.body.action="submit"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(svc.personalChangeStoreDraftPermission).not.toHaveBeenCalled()
  })
  it("does not allow forged permission, Person, Store or Organization fields",async()=>{
    for(const extra of [{seller_id:"sel_any"},{person_id:"daprs_other"},
      {permission:"*"},{organization_id:"foreign"}]){
      req.body={action:"grant",organization_id:"daorg_a",
        membership_id:"damem_a",...extra}
      await POST(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    expect(svc.personalChangeStoreDraftPermission).not.toHaveBeenCalled()
  })
  it("calls the native Foundation permission writer, not Seller workflow",async()=>{
    await POST(req,res)
    expect(svc.personalChangeStoreDraftPermission).toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({status:"active",grant_id:"dasdpg_valid"})
    req.body.action="revoke"
    svc.personalChangeStoreDraftPermission.mockResolvedValue({status:"revoked",grant_id:"dasdpg_valid"})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
  })
  it("uses a validated opaque Member cursor only within the Owner list",async()=>{
    await GET(req,res)
    expect(svc.personalListStoreDraftPermissions).toHaveBeenLastCalledWith(
      "opaque","daorg_a",null)
    req.query.after="daomem_another"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(svc.personalListStoreDraftPermissions).toHaveBeenLastCalledWith(
      "opaque","daorg_a","daomem_another")
    const calls=svc.personalListStoreDraftPermissions.mock.calls.length
    for(const invalid of ["", "bad cursor", "../other", "a".repeat(129), "☺"]){
      req.query.after=invalid
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    expect(svc.personalListStoreDraftPermissions).toHaveBeenCalledTimes(calls)
    req.query={organization_id:"daorg_a",after:"daomem_another",person_id:"daprs_other"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("both list and modify fail closed on missing Owner scope",async()=>{
    svc.personalListStoreDraftPermissions.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    svc.personalChangeStoreDraftPermission.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("distinguishes denied and uncertain server errors",async()=>{
    svc.personalChangeStoreDraftPermission.mockRejectedValue(new IdentityAccessDenied())
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    svc.personalChangeStoreDraftPermission.mockRejectedValue(new Error("DB"))
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    req.query.other="x"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
})
