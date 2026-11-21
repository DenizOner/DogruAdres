import {GET,POST} from "../platform/store-name-transfers/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 exceptional Store name-right assignment boundary",()=>{
  const value={
    transfer_id:"dastr_"+"a".repeat(32),
    source_application_id:"daapp_"+"b".repeat(32),
    source_seller_id:"sel_source",
    target_application_id:"daapp_"+"c".repeat(32),
    target_seller_id:"sel_target",
    expected_name:"Orijinal Mağaza",
    expected_handle:"orijinal-magaza",
    reason:"Staff verified the exceptional name-right entitlement claim"
  }
  let req:any,res:any,service:any
  beforeEach(()=>{
    jest.resetAllMocks()
    service={personalAssignSuspendedStoreNameRight:jest.fn().mockResolvedValue({
      status:"assigned",replayed:false
    })}
    ;(access as jest.Mock).mockReturnValue(service)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque-staff")
    req={body:{...value},headers:{}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  const preview={
    source_application_id:value.source_application_id,
    source_seller_id:value.source_seller_id,
    target_application_id:value.target_application_id,
    target_seller_id:value.target_seller_id
  }
  it("shows a verified, read-only Staff preview of the exact source/recipient",async()=>{
    req.query={...preview}
    service.personalReviewableStoreApplications=jest.fn()
      .mockResolvedValueOnce([{organization_name:"Org A"}])
      .mockResolvedValueOnce([{organization_name:"Org B"}])
      .mockResolvedValueOnce([{organization_name:"Org A"}])
    service.personalCurrentSuspendedStoreName=jest.fn().mockResolvedValue({
      status:"eligible",name:value.expected_name,handle:value.expected_handle
    })
    req.scope={resolve:jest.fn().mockReturnValue({listSellers:jest.fn()
      .mockResolvedValue([{id:value.target_seller_id,name:"Target Store",
        handle:"target-store",status:"open",approved_at:new Date()}])})}
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      source:expect.objectContaining({name:value.expected_name,status:"suspended"}),
      target:expect.objectContaining({name:"Target Store",status:"open"})
    }))
    expect(service.personalAssignSuspendedStoreNameRight).not.toHaveBeenCalled()
  })
  it("does not leak Store names if Staff grant is missing or a target is invalid",async()=>{
    req.query={...preview}
    service.personalReviewableStoreApplications=jest.fn().mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.personalAssignSuspendedStoreNameRight).not.toHaveBeenCalled()
    req.query={...preview,target_seller_id:preview.source_seller_id}
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
  })
  it("rejects a transferred/invalid source before any preview response",async()=>{
    req.query={...preview}
    service.personalReviewableStoreApplications=jest.fn().mockResolvedValue([
      {organization_name:"Org A"}])
    service.personalCurrentSuspendedStoreName=jest.fn().mockResolvedValue({
      status:"conflict"})
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(service.personalAssignSuspendedStoreNameRight).not.toHaveBeenCalled()
  })
  it("returns only nonprivate decision state after authenticated staff proof",async()=>{
    await POST(req,res)
    expect(service.personalAssignSuspendedStoreNameRight)
      .toHaveBeenCalledWith("opaque-staff",value)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      transfer_id:value.transfer_id,status:"assigned",
      native_status:"suspended",awaiting_source_rename:true
    })
  })
  it("never accepts a missing or revoked Staff grant",async()=>{
    service.personalAssignSuspendedStoreNameRight.mockResolvedValue(null)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({message:"Access denied"})
  })
  it("rejects spoofed native Seller selector and missing CSRF",async()=>{
    req.headers["x-seller-id"]="sel_foreign"
    await POST(req,res)
    delete req.headers["x-seller-id"]
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res)
    expect(service.personalAssignSuspendedStoreNameRight).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it.each([
    {transfer_id:"dastr_invalid"}, {source_seller_id:"sel_bad/path"},
    {target_seller_id:value.source_seller_id},
    {source_application_id:"daapp_bad"},
    {expected_name:"X"},{expected_handle:"BAD-URL"},
    {reason:"too short"},{reason:"x".repeat(501)},
    {reason:"\u200B".repeat(30)}, {extra:"request-smuggling"}
  ])("fails closed on malformed transfer payload %j",async extra=>{
    req.body={...value,...extra}
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.personalAssignSuspendedStoreNameRight).not.toHaveBeenCalled()
  })
  it("preserves duplicate result and never reassigns a second time",async()=>{
    service.personalAssignSuspendedStoreNameRight.mockResolvedValue({
      status:"assigned",replayed:true
    })
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it("rejects contested source or recipient names",async()=>{
    service.personalAssignSuspendedStoreNameRight.mockResolvedValue({status:"conflict"})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
  })
  it("cannot call the decision service when endpoint is disabled",async()=>{
    ;(enabled as jest.Mock).mockReturnValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(service.personalAssignSuspendedStoreNameRight).not.toHaveBeenCalled()
  })
  it("returns sanitized error messages on transport failures",async()=>{
    service.personalAssignSuspendedStoreNameRight.mockRejectedValue(
      new Error("PRIVATE_DB_CONNECTION_TEXT"))
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      message:"Decision uncertain; reread audited state before retrying"
    })
    service.personalAssignSuspendedStoreNameRight.mockRejectedValue(
      new IdentityAccessDenied())
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
