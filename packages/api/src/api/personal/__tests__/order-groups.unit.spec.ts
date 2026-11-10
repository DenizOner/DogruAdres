import {GET} from "../order-groups/route"
import {access,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))

describe("B22 private historical OrderGroup read: canonical Buyer Organization first",()=>{
  let req:any,res:any,svc:any,groups:any[],carts:any[],customers:any[]
  let groupGraph:any,cartLinks:any,graph:jest.Mock
  const groupId="og_owner_a",cartId="cart_owner_a",customerId="cus_owner_a"
  beforeEach(()=>{
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque-session")
    svc={
      personalBuyerOrganization:jest.fn().mockResolvedValue({
        person_id:"daprs_owner_a",organization_id:"daorg_buyer_a"
      }),
      personalActorBinding:jest.fn().mockResolvedValue({
        person_id:"daprs_owner_a",actor_id:customerId,revoked_at:null
      }),
      personalBuyerCartAttribution:jest.fn().mockResolvedValue(true)
    }
    ;(access as jest.Mock).mockReturnValue(svc)
    groups=[{id:groupId,cart_id:cartId,customer_id:customerId}]
    carts=[{id:cartId,customer_id:customerId,completed_at:"2026-11-10T09:00:00Z"}]
    customers=[{id:customerId}]
    groupGraph={
      id:groupId,cart_id:cartId,customer_id:customerId,
      display_id:42,created_at:"2026-11-10T09:00:00Z",
      orders:[{id:"order_a",display_id:91,status:"pending",
        items:[{id:"item_a",title:"Sentetik ürün",quantity:2}]}]
    }
    cartLinks=[{order_id:"order_a",cart_id:cartId}]
    graph=jest.fn(async({entity}:any)=>{
      if(entity==="order_group")return {data:[groupGraph]}
      if(entity==="order_cart")return {data:cartLinks}
      throw Error("Unexpected query entity")
    })
    req={
      query:{organization_id:"daorg_buyer_a",order_group_id:groupId},
      headers:{},
      scope:{resolve:jest.fn((key:string)=>{
        if(key==="seller")return {listOrderGroups:jest.fn(async(filter:any)=>
          groups.filter(row=>filter.id?row.id===filter.id:row.cart_id===filter.cart_id))}
        if(key==="customer")return {listCustomers:jest.fn(async()=>customers)}
        if(key==="cart")return {listCarts:jest.fn(async()=>carts)}
        if(key==="query")return {graph}
        throw Error("Unexpected native scope")
      })}
    }
    res={setHeader:jest.fn(),status:jest.fn(),json:jest.fn()}
    res.status.mockReturnValue(res)
    res.json.mockReturnValue(res)
  })
  const denied=()=>({message:"Access denied"})

  it("returns only minimal group and child item summary after exact, twice-checked legal ownership",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_buyer_a",
      order_group:{id:groupId,display_id:42,
        created_at:"2026-11-10T09:00:00Z",
        orders:[{id:"order_a",display_id:91,status:"pending",
          items:[{title:"Sentetik ürün",quantity:2}]}]}
    })
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(svc.personalActorBinding).toHaveBeenCalledTimes(2)
    expect(svc.personalBuyerCartAttribution).toHaveBeenCalledTimes(2)
    expect(svc.personalBuyerCartAttribution).toHaveBeenCalledWith(
      "opaque-session","daorg_buyer_a",cartId,customerId)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
    expect(res.setHeader).toHaveBeenCalledWith("Vary","Cookie")
    const body=JSON.stringify(res.json.mock.lastCall?.[0])
    for(const hidden of ["daprs_owner_a","cus_owner_a","cart_owner_a",
      "payment_collection","audit","metadata","shipping_address"])
      expect(body).not.toContain(hidden)
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({
      entity:"order_cart",filters:{cart_id:cartId}
    }))
  })

  it("denies unknown/foreign Organization without touching native order data",async()=>{
    svc.personalBuyerOrganization.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith(denied())
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })

  it("denies absent, revoked or cross-Person Customer binding before group discovery",async()=>{
    for(const value of [null,{person_id:"daprs_other",actor_id:customerId,revoked_at:null},
      {person_id:"daprs_owner_a",actor_id:customerId,revoked_at:"2026-11-10"},
      {person_id:"daprs_owner_a",actor_id:"cus_invalid!",revoked_at:null}]){
      req.scope.resolve.mockClear()
      svc.personalActorBinding.mockResolvedValue(value)
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(req.scope.resolve).not.toHaveBeenCalled()
    }
  })

  it("denies a group belonging to a different Customer or Cart",async()=>{
    for(const changed of [
      {...groups[0],customer_id:"cus_foreign"},
      {...groups[0],cart_id:"cart_wrong"},
      {...groups[0],cart_id:"not-a-cart"},
    ]){
      groups=[changed]
      if(changed.cart_id==="cart_wrong")
        svc.personalBuyerCartAttribution.mockResolvedValue(false)
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith(denied())
      svc.personalBuyerCartAttribution.mockResolvedValue(true)
    }
  })

  it("denies ambiguous duplicate OrderGroups for the same completed Cart",async()=>{
    groups.push({id:"og_duplicate",cart_id:cartId,customer_id:customerId})
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith(denied())
    expect(graph).not.toHaveBeenCalled()
  })

  it("denies a valid Customer whose cart lacks immutable audited attribution",async()=>{
    svc.personalBuyerCartAttribution.mockResolvedValue(false)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(graph).not.toHaveBeenCalled()
  })

  it("denies an unfinished Cart or different native Customer",async()=>{
    for(const row of [
      {id:cartId,customer_id:customerId,completed_at:null},
      {id:cartId,customer_id:"cus_other",completed_at:"2026-11-10T09:00:00Z"}
    ]){
      carts=[row]
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(graph).not.toHaveBeenCalled()
    }
  })

  it("rejects orphaned, incomplete, foreign or duplicated order-cart links",async()=>{
    for(const links of [
      [],
      [{order_id:"order_other",cart_id:cartId}],
      [{order_id:"order_a",cart_id:"cart_foreign"}],
      [{order_id:"order_a",cart_id:cartId},{order_id:"order_b",cart_id:cartId}]
    ]){
      cartLinks=links
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith(denied())
    }
  })

  it("denies partial group and invalid native line items without leaking the DTO",async()=>{
    for(const mutated of [
      {...groupGraph,orders:[]},
      {...groupGraph,orders:[...groupGraph.orders,groupGraph.orders[0]]},
      {...groupGraph,orders:[{...groupGraph.orders[0],items:[]}]},
      {...groupGraph,orders:[{...groupGraph.orders[0],
        items:[{id:"item_a",title:"test",quantity:0}]}]},
      {...groupGraph,customer_id:"cus_foreign"}
    ]){
      groupGraph=mutated
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith(denied())
    }
  })

  it("denies revocation between native query and outgoing response",async()=>{
    svc.personalBuyerOrganization
      .mockResolvedValueOnce({person_id:"daprs_owner_a",organization_id:"daorg_buyer_a"})
      .mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })

  it("denies attribution revocation after native read",async()=>{
    svc.personalBuyerCartAttribution.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })

  it("rejects injected fields, bearer, forged seller and missing session before touching native modules",async()=>{
    const invalid=[
      {query:{...req.query,fields:"*"},headers:{}},
      {query:{organization_id:["daorg_buyer_a"],order_group_id:groupId},headers:{}},
      {query:{...req.query},headers:{authorization:"Bearer stolen"}},
      {query:{...req.query},headers:{"x-seller-id":"sel_foreign"}}
    ]
    for(const value of invalid){
      req.query=value.query;req.headers=value.headers
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
      expect(req.scope.resolve).not.toHaveBeenCalled()
    }
    req.query={organization_id:"daorg_buyer_a",order_group_id:groupId}
    req.headers={}
    ;(sessionToken as jest.Mock).mockReturnValue("")
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })

  it("returns generic no-store errors for unexpected native failures; no logger dumps",async()=>{
    graph.mockRejectedValue(Error("INTERNAL CUSTOMER ADDRESS AND TOKEN"))
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({message:"Service unavailable"})
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("INTERNAL")
  })

  it("fails closed when session ledger raises identity denial",async()=>{
    svc.personalBuyerOrganization.mockRejectedValue(new IdentityAccessDenied())
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })
})
