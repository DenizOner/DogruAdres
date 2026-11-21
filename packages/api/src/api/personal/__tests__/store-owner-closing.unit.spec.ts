import {GET,POST} from "../store-owner-closing/route"
import {access,csrf,enabled,sessionToken} from "../security"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 private 30-day Owner closing boundary (mock-only)",()=>{
  const organization_id="daorg_A",seller_id="sel_A"
  const request_id="dasc_"+"a".repeat(32)
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    service={
      personalOwnerClosingState:jest.fn().mockResolvedValue({
        organization_id,seller_id,state:"none",version:0,
        started_at:null,due_at:null,can_withdraw:false,
        store_status:"open",permanent_finalization_enabled:false
      }),
      personalOwnerClosingChange:jest.fn().mockResolvedValue({
        status:"closing",version:1,replayed:false,due_at:"2026-12-10T12:00:00.000Z"
      })
    }
    ;(access as jest.Mock).mockReturnValue(service)
    req={headers:{},query:{organization_id,seller_id},body:{
      organization_id,seller_id,action:"start",request_id,
      expected_version:0,consequences_acknowledged:true
    }}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("GET exposes only private state and no irreversible activation",async()=>{
    await GET(req,res)
    expect(service.personalOwnerClosingState).toHaveBeenCalledWith(
      "opaque",organization_id,seller_id)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      state:"none",permanent_finalization_enabled:false
    }))
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
  })
  it("starts closing only through the validated protected-Owner service",async()=>{
    await POST(req,res)
    expect(service.personalOwnerClosingChange).toHaveBeenCalledWith("opaque",req.body)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status:"closing",version:1,replayed:false
    }))
  })
  it("can withdraw only after authoritative service authorization and deadline checks",async()=>{
    req.body={...req.body,action:"withdraw",expected_version:1}
    delete req.body.consequences_acknowledged // Withdrawal is not irreversible closure.
    service.personalOwnerClosingChange.mockResolvedValue({
      status:"withdrawn",version:2,replayed:false,due_at:"2026-12-10T12:00:00.000Z"
    })
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status:"withdrawn",version:2
    }))
  })
  it.each([
    {query:{organization_id,seller_id,role:"owner"},headers:{}},
    {query:{organization_id:"other",seller_id},headers:{}},
    {query:{organization_id,seller_id},headers:{"x-seller-id":seller_id}},
    {query:{organization_id,seller_id},headers:{authorization:"Bearer forged"}}
  ])("denies forged private query or native header",async({query,headers})=>{
    req.query=query;req.headers=headers
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalOwnerClosingState).not.toHaveBeenCalled()
  })
  it.each([
    {action:"terminate"},
    {expected_version:-1},
    {request_id:"invalid"},
    {seller_id:"foreign"},
    {consequences_acknowledged:false},
    {other:"unexpected"},
    {expected_version:"0"}
  ])("refuses malformed and unacknowledged mutations",async invalid=>{
    req.body={...req.body,...invalid}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalOwnerClosingChange).not.toHaveBeenCalled()
  })
  it("rejects missing CSRF before any mutation",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalOwnerClosingChange).not.toHaveBeenCalled()
  })
  it("never treats a foreign or revoked Owner as authorized",async()=>{
    service.personalOwnerClosingChange.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("requires private reread on concurrent version conflict",async()=>{
    service.personalOwnerClosingChange.mockResolvedValue({status:"conflict",version:2})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(service.personalOwnerClosingChange).toHaveBeenCalledTimes(1)
  })
  it("fails closed on transaction or notification outage",async()=>{
    service.personalOwnerClosingChange.mockRejectedValue(new Error("db unavailable"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Outcome uncertain; reread state"
    })
  })
})
