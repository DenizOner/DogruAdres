import { GET, POST } from "../store-owner-pause/route"
import { access, csrf, enabled, sessionToken } from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 Owner temporary pause personal API boundary (mock-only)",()=>{
  const organization_id="daorg_A",seller_id="sel_A"
  const request_id="dasp_"+"a".repeat(32)
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    service={
      personalOwnerStorePauseState:jest.fn().mockResolvedValue({
        organization_id,seller_id,paused:false,version:0,store_status:"open"
      }),
      personalOwnerStorePauseChange:jest.fn().mockResolvedValue({
        status:"paused",version:1,replayed:false
      })
    }
    ;(access as jest.Mock).mockReturnValue(service)
    req={headers:{},query:{organization_id,seller_id},body:{
      organization_id,seller_id,action:"pause",request_id,expected_version:0
    }}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("returns only current protected Owner's private pause state",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(service.personalOwnerStorePauseState).toHaveBeenCalledWith(
      "opaque",organization_id,seller_id)
    expect(res.json).toHaveBeenCalledWith({
      organization_id,seller_id,paused:false,version:0,store_status:"open"
    })
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
  })
  it("records one authorized pause, preserving ID and version",async()=>{
    await POST(req,res)
    expect(service.personalOwnerStorePauseChange).toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      organization_id,seller_id,status:"paused",version:1,replayed:false
    })
  })
  it("allows an Owner resume only after authoritative service checks",async()=>{
    req.body={...req.body,action:"resume",expected_version:1}
    service.personalOwnerStorePauseChange.mockResolvedValue({
      status:"resumed",version:2,replayed:false
    })
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status:"resumed",seller_id,version:2
    }))
  })
  it.each([
    {query:{organization_id,seller_id,role:"owner"},headers:{}},
    {query:{organization_id:"foreign",seller_id},headers:{}},
    {query:{organization_id,seller_id},headers:{"x-seller-id":seller_id}},
    {query:{organization_id,seller_id},headers:{authorization:"Bearer forged"}}
  ])("refuses forged private read context",async ({query,headers})=>{
    req.query=query;req.headers=headers
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalOwnerStorePauseState).not.toHaveBeenCalled()
  })
  it.each([
    {action:"pause",expected_version:-1},
    {action:"resume",expected_version:"1"},
    {action:"pause",seller_id:"sel_foreign!",expected_version:0},
    {action:"pause",request_id:"not-a-key",expected_version:0},
    {action:"pause",expected_version:0,unexpected:true}
  ])("refuses malformed or injected mutation",async invalid=>{
    req.body={...req.body,...invalid}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalOwnerStorePauseChange).not.toHaveBeenCalled()
  })
  it("blocks missing CSRF, even if body asserts a protected Owner",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalOwnerStorePauseChange).not.toHaveBeenCalled()
  })
  it("does not transform foreign/revoked Owner denial into success",async()=>{
    service.personalOwnerStorePauseChange.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("requires a fresh GET after version conflict, no blind retry",async()=>{
    service.personalOwnerStorePauseChange.mockResolvedValue({status:"conflict",version:2})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(service.personalOwnerStorePauseChange).toHaveBeenCalledTimes(1)
  })
  it("fails closed if service operation is uncertain",async()=>{
    service.personalOwnerStorePauseChange.mockRejectedValue(new Error("db unavailable"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; reread state"
    })
  })
  it("never reports native suspended Store as Owner-resumable",async()=>{
    service.personalOwnerStorePauseChange.mockResolvedValue(null)
    req.body={...req.body,action:"resume",expected_version:1}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
