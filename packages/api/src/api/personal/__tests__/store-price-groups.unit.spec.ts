import {GET,POST} from "../store-price-groups/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {ContainerRegistrationKeys} from "@medusajs/framework/utils"

jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 Store-owned CustomerGroup ↔ audited Buyer Organization grant",()=>{
  let req:any,res:any,service:any,query:jest.Mock,member:jest.Mock,link:jest.Mock,seller:jest.Mock
  const group={organization_id:"daorg_a",seller_id:"sel_a",
    buyer_organization_id:"daorg_b",customer_group_id:"cusgroup_a"}
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    service={
      personalActorBinding:jest.fn().mockResolvedValue({
        id:"dabind_owner",actor_type:"member",
        person_id:"daprs_owner",actor_id:"mem_owner",revoked_at:null
      }),
      personalStorePriceGroupAccess:jest.fn().mockResolvedValue({status:"active"})
    }
    ;(access as jest.Mock).mockReturnValue(service)
    member=jest.fn().mockResolvedValue([{id:"mem_owner",is_active:true}])
    link=jest.fn().mockResolvedValue([{seller_id:"sel_a",member_id:"mem_owner"}])
    seller=jest.fn().mockResolvedValue([{id:"sel_a",status:"open",approved_at:"2026-11-03"}])
    query=jest.fn().mockResolvedValue({data:[{seller_id:"sel_a",customer_group_id:"cusgroup_a"}]})
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
      filters:{seller_id:"sel_a",customer_group_id:"cusgroup_a"}
    })
    expect(service.personalStorePriceGroupAccess).toHaveBeenCalledWith("opaque",{
      ...group,action:"grant",
      member_binding_id:"dabind_owner",
      member_actor_id:"mem_owner",member_person_id:"daprs_owner"
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
  it("F-01 denies reads of suspended and unapproved Seller without disclosing grant status",async()=>{
    for(const store of [
      {id:"sel_a",status:"suspended",approved_at:"2026-11-03"},
      {id:"sel_a",status:"open",approved_at:null}
    ]){
      seller.mockResolvedValue([store])
      res.status.mockClear();res.json.mockClear()
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
      expect(service.personalStorePriceGroupAccess).not.toHaveBeenCalled()
    }
  })
  it("F-01 allows authorized revoke for cleanup of suspended native Seller",async()=>{
    req.body.action="revoke"
    seller.mockResolvedValue([{id:"sel_a",status:"suspended",approved_at:null}])
    service.personalStorePriceGroupAccess.mockResolvedValue({status:"revoked"})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(query).not.toHaveBeenCalled()
  })
  it("F-02 refuses successful HTTP confirmation if exact Member binding disappears during request",async()=>{
    service.personalActorBinding
      .mockResolvedValueOnce({id:"dabind_owner",actor_type:"member",
        person_id:"daprs_owner",actor_id:"mem_owner",revoked_at:null})
      .mockResolvedValueOnce(null)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({message:"Outcome uncertain; recheck group"})
    expect(service.personalStorePriceGroupAccess).toHaveBeenCalledTimes(1)
  })
  it("F-02 rejects a missing verified binding ID before any native scope lookup",async()=>{
    service.personalActorBinding.mockResolvedValue({actor_type:"member",
      person_id:"daprs_owner",actor_id:"mem_owner",revoked_at:null})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(member).not.toHaveBeenCalled()
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
      ...group,action:"read",
      member_binding_id:"dabind_owner",
      member_actor_id:"mem_owner",member_person_id:"daprs_owner"
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

  function prepareOwnedGroupListing(){
    const customerGroups=jest.fn().mockResolvedValue([
      {id:"cusgroup_b",name:"Atölyeler"},{id:"cusgroup_a",name:"Servisler"}
    ])
    service.personalManagerOrganization=jest.fn().mockResolvedValue({person_id:"daprs_owner"})
    service.personalLegalSellerIds=jest.fn().mockResolvedValue({
      person_id:"daprs_owner",seller_ids:["sel_a"]
    })
    req.query={organization_id:"daorg_a",seller_id:"sel_a",view:"list"}
    query.mockResolvedValue({data:[
      {seller_id:"sel_a",customer_group_id:"cusgroup_a"},
      {seller_id:"sel_a",customer_group_id:"cusgroup_b"}
    ]})
    req.scope.resolve=jest.fn((key:string)=>{
      if(key==="seller")return {listMembers:member,listSellerMembers:link,listSellers:seller}
      if(key===ContainerRegistrationKeys.QUERY)return {graph:query}
      if(key==="customer")return {listCustomerGroups:customerGroups}
      throw Error("Unexpected module requested")
    })
    return customerGroups
  }
  it("lists only this approved Store's linked native groups for a protected Owner",async()=>{
    const customerGroups=prepareOwnedGroupListing()
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",seller_id:"sel_a",
      groups:[{id:"cusgroup_b",name:"Atölyeler"},{id:"cusgroup_a",name:"Servisler"}]
    })
    expect(query).toHaveBeenCalledWith({
      entity:"customer_group_seller",
      fields:["seller_id","customer_group_id"],
      filters:{seller_id:"sel_a"},pagination:{skip:0,take:100}
    })
    expect(customerGroups).toHaveBeenCalledWith({id:["cusgroup_a","cusgroup_b"]})
    expect(service.personalManagerOrganization).toHaveBeenCalledTimes(2)
    expect(service.personalLegalSellerIds).toHaveBeenCalledTimes(2)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
    expect(service.personalStorePriceGroupAccess).not.toHaveBeenCalled()
  })
  it("does not expose groups for a foreign Owner or unapproved Seller",async()=>{
    const customerGroups=prepareOwnedGroupListing()
    service.personalLegalSellerIds.mockResolvedValue({
      person_id:"daprs_owner",seller_ids:["sel_other"]
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(query).not.toHaveBeenCalled()
    expect(customerGroups).not.toHaveBeenCalled()
    service.personalLegalSellerIds.mockResolvedValue({
      person_id:"daprs_owner",seller_ids:["sel_a"]
    })
    seller.mockResolvedValue([{id:"sel_a",status:"suspended",approved_at:"2026-11-03"}])
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(query).not.toHaveBeenCalled()
  })
  it("rejects a foreign native group link and drops output after binding revocation",async()=>{
    const customerGroups=prepareOwnedGroupListing()
    query.mockResolvedValueOnce({data:[{
      seller_id:"sel_other",customer_group_id:"cusgroup_foreign"
    }]})
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(customerGroups).not.toHaveBeenCalled()
    query.mockResolvedValue({data:[
      {seller_id:"sel_a",customer_group_id:"cusgroup_a"},
      {seller_id:"sel_a",customer_group_id:"cusgroup_b"}
    ]})
    service.personalActorBinding.mockResolvedValueOnce({
      id:"dabind_owner",actor_type:"member",
      person_id:"daprs_owner",actor_id:"mem_owner",revoked_at:null
    }).mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("denies an unlinked group if its native Store link disappears during the read",async()=>{
    prepareOwnedGroupListing()
    query.mockResolvedValueOnce({data:[
      {seller_id:"sel_a",customer_group_id:"cusgroup_a"},
      {seller_id:"sel_a",customer_group_id:"cusgroup_b"}
    ]}).mockResolvedValueOnce({data:[
      {seller_id:"sel_a",customer_group_id:"cusgroup_a"}
    ]})
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
    expect(service.personalManagerOrganization).toHaveBeenCalledTimes(2)
  })
  it("requires strict list mode, validated scope and a live Member binding",async()=>{
    prepareOwnedGroupListing()
    req.query={organization_id:"daorg_a",seller_id:"sel_a",view:"list",person_id:"daprs_other"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.query={organization_id:"daorg_a",seller_id:"sel_a",view:"list"}
    service.personalActorBinding.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(query).not.toHaveBeenCalled()
  })
})
