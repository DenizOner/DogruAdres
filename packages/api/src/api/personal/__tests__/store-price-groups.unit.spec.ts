import {GET,POST} from "../store-price-groups/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {ContainerRegistrationKeys} from "@medusajs/framework/utils"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 Store-owned CustomerGroup ↔ audited Buyer Organization grant",()=>{
  let req:any,res:any,service:any,query:jest.Mock,member:jest.Mock,link:jest.Mock,seller:jest.Mock
  const group={organization_id:"daorg_a",seller_id:"sel_a",
    buyer_organization_id:"daorg_b",customer_group_id:"cusgrp_a"}
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    service={
      personalActorBinding:jest.fn().mockResolvedValue({
        person_id:"daprs_owner",actor_id:"mem_owner",revoked_at:null
      }),
      personalStorePriceGroupAccess:jest.fn().mockResolvedValue({status:"active"})
    }
    ;(access as jest.Mock).mockReturnValue(service)
    member=jest.fn().mockResolvedValue([{id:"mem_owner",is_active:true}])
    link=jest.fn().mockResolvedValue([{seller_id:"sel_a",member_id:"mem_owner"}])
    seller=jest.fn().mockResolvedValue([{id:"sel_a",status:"open",approved_at:"2026-11-03"}])
    query=jest.fn().mockResolvedValue({data:[{seller_id:"sel_a",customer_group_id:"cusgrp_a"}]})
    req={query:{...group},body:{...group,action:"grant"},headers:{},scope:{
      resolve:jest.fn((k:string)=>{
        if(k==="seller")return {listMembers:member,listSellerMembers:link,listSellers:seller}
        if(k===ContainerRegistrationKeys.QUERY)return {graph:query}
        throw Error("Unexpected service")
      })
    }}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("grants only a group linked to the same live native Seller and Member",async()=>{
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({status:"active"})
    expect(query).toHaveBeenCalledWith({
      entity:"customer_group_seller",fields:["customer_group_id","seller_id"],
      filters:{seller_id:"sel_a",customer_group_id:"cusgrp_a"}
    })
    expect(service.personalStorePriceGroupAccess).toHaveBeenCalledWith("opaque",{
      ...group,action:"grant"
    })
  })
  it("never writes before Origin+CSRF or from forged seller/Bearer scope",async()=>{
    ;(csrf as jest.Mock).mockResolvedValueOnce(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    req.headers.authorization="Bearer forged"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(service.personalStorePriceGroupAccess).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
  it("denies a native CustomerGroup owned by another Seller",async()=>{
    query.mockResolvedValue({data:[]})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(service.personalStorePriceGroupAccess).not.toHaveBeenCalled()
  })
  it("denies revoked native Member, suspended Store and missing SellerMember",async()=>{
    link.mockResolvedValueOnce([])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    seller.mockResolvedValue([{id:"sel_a",status:"suspended",approved_at:"2026-11-03"}])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(service.personalStorePriceGroupAccess).not.toHaveBeenCalled()
  })
  it("allows idempotent revoke even if native group link was retired",async()=>{
    req.body.action="revoke"
    service.personalStorePriceGroupAccess.mockResolvedValue({status:"revoked"})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({status:"revoked"})
    expect(query).not.toHaveBeenCalled()
  })
  it("reads a current grant only for the same authorized native Store",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(service.personalStorePriceGroupAccess).toHaveBeenCalledWith("opaque",{
      ...group,action:"read"
    })
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
  })
  it("returns 503 when a native Seller scope revokes between write and response",async()=>{
    seller.mockResolvedValueOnce([{id:"sel_a",status:"open",approved_at:"2026-11-03"}])
      .mockResolvedValueOnce([{id:"sel_a",status:"suspended",approved_at:"2026-11-03"}])
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({message:"Outcome uncertain; recheck group"})
  })
  it("rejects malformed group/BuyerOrg and duplicate unauthorized selector fields",async()=>{
    req.body={...group,action:"grant",seller_scope:"forged"}
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.query={...group,buyer_person_id:"daprs_foreign"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(service.personalStorePriceGroupAccess).not.toHaveBeenCalled()
  })
})
