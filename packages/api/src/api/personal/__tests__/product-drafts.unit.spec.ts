import { GET,POST } from "../product-drafts/route"
import { access,csrf,enabled,sessionToken } from "../security"
import { createProductsWorkflow } from "@mercurjs/core/workflows"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
jest.mock("@mercurjs/core/workflows",()=>({createProductsWorkflow:jest.fn()}))
describe("B22 native product drafts are Person/Org/Store action scoped",()=>{
  const base={request_id:"dapd_"+"a".repeat(32),organization_id:"daorg_a",
    seller_id:"sel_a",title:"A real draft"}
  const scope={person_id:"daprs_a",organization_id:"daorg_a",seller_id:"sel_a"}
  const binding={id:"dabind_a",person_id:"daprs_a",actor_id:"mem_a",revoked_at:null}
  let req:any,res:any,svc:any,native:any,run:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={
      personalProductDraftCandidates:jest.fn().mockResolvedValue({
        person_id:"daprs_a",organization_id:"daorg_a",seller_ids:["sel_a"]}),
      personalProductDraftScope:jest.fn().mockResolvedValue(scope),
      personalProductDraftReceipt:jest.fn().mockResolvedValue({status:"review_required"}),
      personalActorBinding:jest.fn().mockResolvedValue(binding),
      personalReserveProductDraft:jest.fn().mockResolvedValue({status:"reserved",person_id:"daprs_a"}),
      personalCompleteProductDraft:jest.fn().mockResolvedValue({status:"created",product_id:"prod_a"})
    }
    native={
      listSellerMembers:jest.fn().mockResolvedValue([{member_id:"mem_a",seller_id:"sel_a"}]),
      listMembers:jest.fn().mockResolvedValue([{id:"mem_a",is_active:true}]),
      listSellers:jest.fn().mockResolvedValue([{id:"sel_a",name:"Alpha",status:"open",approved_at:"2026-10-30"}])
    }
    run=jest.fn().mockResolvedValue({result:[{id:"prod_a"}]})
    ;(createProductsWorkflow as unknown as jest.Mock).mockReturnValue({run})
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    ;(access as jest.Mock).mockReturnValue(svc)
    req={body:{...base},query:{organization_id:"daorg_a"},headers:{},
      scope:{resolve:jest.fn((key:string)=>key==="seller"?native:null)}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("denies without CSRF before any native or Foundation business action",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalProductDraftScope).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("does not grant based on native SellerMember without Foundation products.edit",async()=>{
    svc.personalProductDraftScope.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(native.listSellers).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("requires native Member and separately approved Seller",async()=>{
    native.listSellers.mockResolvedValue([{id:"sel_a",status:"open",approved_at:null}])
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalReserveProductDraft).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it("creates a draft once through the existing workflow without exposing native JWT",async()=>{
    await POST(req,res)
    expect(svc.personalReserveProductDraft).toHaveBeenCalledWith("opaque",base)
    expect(run).toHaveBeenCalledWith({input:{products:[{
      title:base.title,status:"draft",seller_ids:["sel_a"],
      metadata:{dogruadres_draft_request_id:base.request_id}
    }],created_by:"sel_a"}})
    expect(svc.personalCompleteProductDraft).toHaveBeenCalledWith("opaque",base,"prod_a")
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({status:"created",product_id:"prod_a"})
  })
  it("replays completed identical intent as read-only response, no native write",async()=>{
    svc.personalReserveProductDraft.mockResolvedValue({
      status:"created",person_id:"daprs_a",product_id:"prod_old"
    })
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({status:"created",product_id:"prod_old"})
    expect(run).not.toHaveBeenCalled()
  })
  it("does not rerun a reserved/uncertain intent",async()=>{
    svc.personalReserveProductDraft.mockResolvedValue({status:"uncertain",person_id:"daprs_a"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(run).not.toHaveBeenCalled()
  })
  it("rejects forged context and conflicting payload before native workflow",async()=>{
    req.body.organization_id="forged"
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    req.body={...base,permission:"products.manage"}
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.body={...base};req.headers["x-seller-id"]="sel_evil"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("fails closed on changed payload / conflicting key in Foundation",async()=>{
    svc.personalReserveProductDraft.mockRejectedValue(new IdentityAccessDenied())
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(run).not.toHaveBeenCalled()
  })
  it("returns uncertain if native workflow throws after successful reservation",async()=>{
    run.mockRejectedValue(new Error("native failure"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(svc.personalCompleteProductDraft).not.toHaveBeenCalled()
  })
  it("checks an uncertain intent read-only, never starts Mercur workflow",async()=>{
    req.query={organization_id:"daorg_a",seller_id:"sel_a",request_id:base.request_id}
    await GET(req,res)
    expect(svc.personalProductDraftReceipt).toHaveBeenCalledWith(
      "opaque","daorg_a","sel_a",base.request_id)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({status:"review_required"})
    expect(run).not.toHaveBeenCalled()
    expect(svc.personalReserveProductDraft).not.toHaveBeenCalled()
  })
  it("rejects unauthorized, revoked or foreign receipt lookup",async()=>{
    req.query={organization_id:"daorg_a",seller_id:"sel_a",request_id:base.request_id}
    svc.personalProductDraftScope.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalProductDraftReceipt).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    svc.personalProductDraftScope.mockResolvedValue(scope)
    svc.personalProductDraftReceipt.mockResolvedValue({status:"created",product_id:"prod_a"})
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({status:"created",product_id:"prod_a"})
    req.query.request_id="wrong"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("lists only independently scoped and live native eligible stores",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({organization_id:"daorg_a",
      stores:[{id:"sel_a",name:"Alpha"}]})
    svc.personalProductDraftCandidates.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })
})
