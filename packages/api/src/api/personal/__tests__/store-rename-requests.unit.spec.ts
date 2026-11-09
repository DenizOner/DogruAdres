import { GET, POST } from "../store-rename-requests/route"
import { access, csrf, enabled, sessionToken } from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 private Store rename REQUEST, not native Store mutation",()=>{
  const data={
    request_id:"dasrn_"+"a".repeat(32),
    organization_id:"daorg_one",seller_id:"sel_one",
    name:"Yeni Mağaza",handle:"yeni-magaza",
    risk_acknowledged:true,risk_version:"store-rename-risks-v2"
  }
  let req:any,res:any,svc:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={
      personalRequestStoreRename:jest.fn().mockResolvedValue({
        request_id:data.request_id,status:"pending_review",replayed:false
      }),
      personalStoreRenameRequests:jest.fn().mockResolvedValue({
        organization_id:data.organization_id,seller_id:data.seller_id,requests:[]
      }),
      personalWithdrawStoreRenameRequest:jest.fn().mockResolvedValue({
        request_id:data.request_id,seller_id:data.seller_id,status:"withdrawn"
      })
    }
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    req={body:{...data},query:{
      organization_id:data.organization_id,seller_id:data.seller_id
    },headers:{}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("accepts only explicit risk consent and records pending without native workflow",async()=>{
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(svc.personalRequestStoreRename).toHaveBeenCalledWith("opaque",data)
    expect(res.json).toHaveBeenCalledWith({
      request_id:data.request_id,status:"pending_review"
    })
  })
  it("reads only its current authorized Organization and Seller context",async()=>{
    await GET(req,res)
    expect(svc.personalStoreRenameRequests).toHaveBeenCalledWith(
      "opaque",data.organization_id,data.seller_id)
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it("rejects CSRF failure before service write",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalRequestStoreRename).not.toHaveBeenCalled()
  })
  it.each([
    {risk_acknowledged:false},
    {risk_version:"old-risk-version"},
    {risk_version:"store-rename-risks-v1"},
    {name:"\u200b\u200b\u200b"},
    {name:"Ma\u200drket"},
    {name:"aa"},
    {handle:"https://example.com"},
    {handle:"Bir-Magaza"},
    {handle:"a--b"},
    {handle:".."},
    {name:"123456"},
    {unapproved_field:"forged"}
  ])("rejects invalid or unconsented request before storage: %j",async override=>{
    req.body={...data,...override}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(svc.personalRequestStoreRename).not.toHaveBeenCalled()
  })
  it.each(["Çiçek Dükkânı","مكتبة عربية","👩‍💻 Shop"])(
    "retains accepted visible multilingual Store names: %s",async name=>{
      req.body.name=name
      await POST(req,res)
      expect(res.status).toHaveBeenCalledWith(201)
    })
  it("denies foreign or revoked Owner returned by the service",async()=>{
    svc.personalRequestStoreRename.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("reuses the exact request ID without another audit creation",async()=>{
    svc.personalRequestStoreRename.mockResolvedValue({
      request_id:data.request_id,status:"pending_review",replayed:true
    })
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it("denies a second pending request without claiming native rename",async()=>{
    svc.personalRequestStoreRename.mockResolvedValue({status:"conflict"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
  })
  it("does not guess a storage outcome on transaction failure",async()=>{
    svc.personalRequestStoreRename.mockRejectedValue(new Error("DB failure"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; read existing requests before any retry"
    })
  })
  const withdrawal=()=>({
    action:"withdraw",request_id:data.request_id,
    organization_id:data.organization_id,seller_id:data.seller_id
  })
  it("lets an authorized Owner withdraw a pending request without native mutation",async()=>{
    req.body=withdrawal()
    await POST(req,res)
    expect(svc.personalWithdrawStoreRenameRequest).toHaveBeenCalledWith("opaque",{
      request_id:data.request_id,organization_id:data.organization_id,
      seller_id:data.seller_id
    })
    expect(svc.personalRequestStoreRename).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      request_id:data.request_id,seller_id:data.seller_id,status:"withdrawn"
    })
  })
  it("refuses withdrawal without CSRF and without calling the service",async()=>{
    req.body=withdrawal()
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalWithdrawStoreRenameRequest).not.toHaveBeenCalled()
  })
  it.each([
    {request_id:"dasrn_wrong"},{seller_id:"sel_bad!"},{organization_id:"wrong"},
    {name:"extra"},{action:"withdraw",risk_acknowledged:true}
  ])("rejects malformed or extra withdrawal fields: %j",async overrides=>{
    req.body={...withdrawal(),...overrides}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(svc.personalWithdrawStoreRenameRequest).not.toHaveBeenCalled()
  })
  it("rejects wrong or revoked Owner without exposing request existence",async()=>{
    req.body=withdrawal()
    svc.personalWithdrawStoreRenameRequest.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalRequestStoreRename).not.toHaveBeenCalled()
  })
  it.each(["conflict","approved","rejected","withdrawn","approving"])(
    "refuses non-pending or competing decision: %s",async status=>{
      req.body=withdrawal()
      svc.personalWithdrawStoreRenameRequest.mockResolvedValue({status})
      await POST(req,res)
      expect(res.status).toHaveBeenCalledWith(409)
    })
  it("does not mistake a failed withdrawal transaction for a completed decision",async()=>{
    req.body=withdrawal()
    svc.personalWithdrawStoreRenameRequest.mockRejectedValue(new Error("DB failure"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; read existing requests before any retry"
    })
  })
  it("rejects a private GET when Owner chain is absent",async()=>{
    svc.personalStoreRenameRequests.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
