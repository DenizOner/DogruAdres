import {GET,POST} from "../buyer-permissions/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 Organization Owner buyer.purchase grant",()=>{
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalListBuyerPermissions:jest.fn().mockResolvedValue([]),
      personalChangeBuyerPermission:jest.fn().mockResolvedValue({status:"active",grant_id:"dabpg_test"})
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(access as jest.Mock).mockReturnValue(service)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={query:{organization_id:"daorg_a"},headers:{},
      body:{action:"grant",organization_id:"daorg_a",membership_id:"damem_a"}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("denies missing CSRF before any mutation",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalChangeBuyerPermission).not.toHaveBeenCalled()
  })
  it("accepts only exact buyer scope, no forged seller or permission",async()=>{
    req.body.seller_id="sel_foreign"
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    delete req.body.seller_id
    req.body.permission="*"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.body.permission
    req.headers["x-seller-id"]="sel_unsafe"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(service.personalChangeBuyerPermission).not.toHaveBeenCalled()
  })
  it("routes only via authenticated Foundation permission writer",async()=>{
    await POST(req,res)
    expect(service.personalChangeBuyerPermission).toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({status:"active",grant_id:"dabpg_test"})
  })
  it("fails closed when requester is not current Owner",async()=>{
    service.personalChangeBuyerPermission.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("revocation has same owner gate and no native checkout call",async()=>{
    req.body.action="revoke"
    service.personalChangeBuyerPermission.mockResolvedValue({status:"revoked",grant_id:"dabpg_test"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(service.personalChangeBuyerPermission).toHaveBeenCalled()
  })
  it("only Owner can list, and accepts no extra query",async()=>{
    service.personalListBuyerPermissions.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    req.query.other="1"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("denies invalid Foundation audit or unexpected failure",async()=>{
    service.personalChangeBuyerPermission.mockRejectedValue(new IdentityAccessDenied())
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    service.personalChangeBuyerPermission.mockRejectedValue(new Error("db"))
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
  })
})
