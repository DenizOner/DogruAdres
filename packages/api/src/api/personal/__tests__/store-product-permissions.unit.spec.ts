import {GET,POST} from "../store-product-permissions/route"
import {access,csrf,enabled,sessionToken} from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 Owner-only products.edit authority",()=>{
  let req:any,res:any,svc:any,native:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={
      personalListStoreProductPermissions:jest.fn().mockResolvedValue([]),
      personalChangeStoreProductPermission:jest.fn().mockResolvedValue({status:"active",grant_id:"daspg_unit"})
    }
    native={listSellers:jest.fn().mockResolvedValue([{id:"sel_a",status:"open",approved_at:"2026-10-30"}])}
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{action:"grant",organization_id:"daorg_a",seller_id:"sel_a",membership_id:"damem_a"},
      query:{organization_id:"daorg_a"},headers:{},scope:{resolve:()=>native}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("denies absent CSRF before calling native or mutation",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(native.listSellers).not.toHaveBeenCalled()
    expect(svc.personalChangeStoreProductPermission).not.toHaveBeenCalled()
  })
  it("blocks unapproved native Seller before Foundation mutation",async()=>{
    native.listSellers.mockResolvedValue([{id:"sel_a",status:"pending_approval",approved_at:null}])
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalChangeStoreProductPermission).not.toHaveBeenCalled()
  })
  it("never treats a native Store as enough when Foundation denies Owner",async()=>{
    svc.personalChangeStoreProductPermission.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("rejects extra fields and forged seller before writes",async()=>{
    req.body.permission="manage"
    await POST(req,res);expect(res.status).toHaveBeenCalledWith(400)
    delete req.body.permission;req.headers["x-seller-id"]="sel_other"
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    expect(svc.personalChangeStoreProductPermission).not.toHaveBeenCalled()
  })
  it("grants via checked native status and server-owned Foundation action",async()=>{
    await POST(req,res)
    expect(svc.personalChangeStoreProductPermission).toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({status:"active",grant_id:"daspg_unit"})
  })
  it("revokes even when native Seller is suspended; Foundation still verifies Owner",async()=>{
    req.body.action="revoke"
    svc.personalChangeStoreProductPermission.mockResolvedValue({status:"revoked",grant_id:"daspg_unit"})
    await POST(req,res)
    expect(native.listSellers).not.toHaveBeenCalled()
    expect(svc.personalChangeStoreProductPermission).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it("lists only when Foundation Owner gate passes",async()=>{
    svc.personalListStoreProductPermissions.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    req.query.extra="1"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
})
