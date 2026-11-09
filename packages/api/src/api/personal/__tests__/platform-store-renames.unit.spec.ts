import {GET,POST} from "../platform/store-renames/route"
import {access,csrf,enabled,sessionToken} from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 guarded platform review of Store rename requests",()=>{
  const item={
    request_id:"dasrn_"+"b".repeat(32),
    seller_id:"sel_store",organization_id:"daorg_company",
    organization_name:"Company",old_name:"Original Store",
    old_handle:"original-store",proposed_name:"Yeni Mağaza",
    proposed_handle:"yeni-magaza",created_at:new Date()
  }
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={
      personalReviewableStoreRenameRequests:jest.fn().mockResolvedValue({
        page:0,has_more:false,pending:[item]
      }),
      personalRejectStoreRenameRequest:jest.fn().mockResolvedValue({
        status:"rejected",request_id:item.request_id,seller_id:item.seller_id
      })
    }
    ;(access as jest.Mock).mockReturnValue(service)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque-staff")
    req={headers:{},query:{page:"0"},body:{
      action:"reject",request_id:item.request_id,seller_id:item.seller_id,
      reason:"A clear and private platform review reason"
    }}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("returns a private pending review list only from the verified service",async()=>{
    await GET(req,res)
    expect(service.personalReviewableStoreRenameRequests)
      .toHaveBeenCalledWith("opaque-staff",0)
    expect(res.json).toHaveBeenCalledWith({page:0,has_more:false,pending:[item]})
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
  })
  it("never queries a private queue without a current platform Store grant",async()=>{
    service.personalReviewableStoreRenameRequests.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it.each([{page:"-1"},{page:"1001"},{page:"2.5"},{page:"x"},{page:"1",extra:"foo"}])(
    "rejects malformed/polluted page parameters before staff service",async query=>{
      req.query=query
      await GET(req,res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(service.personalReviewableStoreRenameRequests).not.toHaveBeenCalled()
    })
  it("rejects Seller context spoofing on both methods",async()=>{
    req.headers["x-seller-id"]="sel_attacker"
    await GET(req,res);await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalRejectStoreRenameRequest).not.toHaveBeenCalled()
  })
  it("rejects CSRF failure before any decision write",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalRejectStoreRenameRequest).not.toHaveBeenCalled()
  })
  it.each([
    {action:"approve"},
    {request_id:"dasrn_broken"},
    {seller_id:"another-seller"},
    {reason:"short"},
    {reason:"x".repeat(501)},
    {reason:"\u200B".repeat(10)},
    {reason:"\u3164".repeat(10)},
    {reason:"\u115F\u1160".repeat(6)},
    {reason:"\u200D\u2060\u200B".repeat(5)},
    {reason:"\u200B\u200D\u2060".repeat(4)+"  "},
    {added:"unexpected"}
  ])("rejects invalid decision payloads before service: %j",async change=>{
    req.body={...req.body,...change}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalRejectStoreRenameRequest).not.toHaveBeenCalled()
  })
  it.each(["Gerekçe açık ve anlaşılır", "سبب الرفض واضح ومفهوم", "Karar verildi ✅"])(
    "accepts readable multilingual explanations: %s",async reason=>{
      req.body.reason=reason
      await POST(req,res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(service.personalRejectStoreRenameRequest).toHaveBeenCalled()
    })
  it("uses the current Staff path and returns only a verified reject decision",async()=>{
    await POST(req,res)
    expect(service.personalRejectStoreRenameRequest)
      .toHaveBeenCalledWith("opaque-staff",req.body)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      status:"rejected",request_id:item.request_id,seller_id:item.seller_id
    })
  })
  it("denies a revoked or missing Staff decision grant",async()=>{
    service.personalRejectStoreRenameRequest.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("rejects an already decided or contested request without another write",async()=>{
    service.personalRejectStoreRenameRequest.mockResolvedValue({status:"conflict"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
  })
  it("never reports success if the database transaction is uncertain",async()=>{
    service.personalRejectStoreRenameRequest.mockRejectedValue(new Error("Database unavailable"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; reread before retrying"
    })
  })
})
