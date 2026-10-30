import {GET,POST} from "../buyer-context/route"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 selected buyer Organization is not Customer checkout authority",()=>{
  let req:any,res:any,svc:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={personalStoreBuyerBlockDecision:jest.fn().mockResolvedValue({blocked:false}),
      personalBuyerCartAttribution:jest.fn().mockResolvedValue(false),
      personalClaimBuyerCart:jest.fn().mockResolvedValue({
        status:"attributed",organization_id:"daorg_a"
      }),
      personalBuyerOrganization:jest.fn().mockResolvedValue({
      person_id:"daprs_a",organization_id:"daorg_a"
    }),personalActorBinding:jest.fn().mockResolvedValue({
      id:"dabind_a",person_id:"daprs_a",actor_id:"cus_a",revoked_at:null
    })}
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    ;(access as jest.Mock).mockReturnValue(svc)
    req={query:{organization_id:"daorg_a"},headers:{},
      body:{action:"attribute",organization_id:"daorg_a",cart_id:"cart_a"},
      scope:{resolve:jest.fn((key:string)=>key==="customer"?
        {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}:
        {listCarts:jest.fn().mockResolvedValue([{id:"cart_a",customer_id:"cus_a",completed_at:null}])})}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("verifies selected Organization twice and never returns native Customer or checkout credentials",async()=>{
    await GET(req,res)
    expect(svc.personalBuyerOrganization).toHaveBeenNthCalledWith(1,"opaque","daorg_a")
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({organization_id:"daorg_a",
      status:"buyer_permission_verified",checkout_ready:false})
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
  })
  it("requires dual-proof Customer binding and native existence for selected Organization",async()=>{
    req.query.customer="verified"
    await GET(req,res)
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(svc.personalActorBinding).toHaveBeenCalledTimes(2)
    expect(req.scope.resolve).toHaveBeenCalledWith("customer")
    expect(res.json).toHaveBeenCalledWith({
      organization_id:"daorg_a",status:"buyer_customer_verified",checkout_ready:false
    })
  })
  it("reads native Customer-owned open cart without attributing it to legal Organization",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a"
    await GET(req,res)
    expect(req.scope.resolve).toHaveBeenCalledWith("cart")
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      organization_id:"daorg_a",status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:false
    })
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(svc.personalActorBinding).toHaveBeenCalledTimes(2)
  })
  it("rejects foreign, anonymous, completed and missing native carts, no details leaked",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a"
    for(const rows of [[{id:"cart_a",customer_id:"cus_other",completed_at:null}],
      [{id:"cart_a",customer_id:null,completed_at:null}],
      [{id:"cart_a",customer_id:"cus_a",completed_at:"2026-10-30T00:00:00Z"}],[]]){
      req.scope.resolve=jest.fn((key:string)=>key==="customer"?
        {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}:
        {listCarts:jest.fn().mockResolvedValue(rows)})
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
    }
  })
  it("rejects cart selector without verified Customer proof or forged cart metadata",async()=>{
    req.query.cart_id="cart_a"
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(400)
    req.query.customer="verified";req.query.seller_id="sel_a"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.query.seller_id;req.query.cart_id="invalid"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("denies Customer cart when Organization buyer permission disappears",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a"
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(403)
  })
  it("returns attribution only from verified Foundation audit, not Cart metadata",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a"
    svc.personalBuyerCartAttribution.mockResolvedValue(true)
    await GET(req,res)
    expect(svc.personalBuyerCartAttribution).toHaveBeenCalledWith(
      "opaque","daorg_a","cart_a","cus_a")
    expect(res.json).toHaveBeenCalledWith({
      organization_id:"daorg_a",status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:true
    })
  })
  it("POST attributes only with CSRF, dual-proof Customer and live native Cart",async()=>{
    // A completed Foundation claim must be readable with matching audit/outbox.
    svc.personalBuyerCartAttribution.mockResolvedValue(true)
    await POST(req,res)
    expect(svc.personalClaimBuyerCart).toHaveBeenCalledWith(
      "opaque","daorg_a","cart_a","cus_a")
    expect(svc.personalBuyerCartAttribution).toHaveBeenCalledWith(
      "opaque","daorg_a","cart_a","cus_a")
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      status:"attributed",organization_id:"daorg_a",checkout_ready:false
    })
  })
  it("POST denies CSRF, extra context and forged Customer before mutations",async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false)
    await POST(req,res);expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalClaimBuyerCart).not.toHaveBeenCalled()
    ;(csrf as jest.Mock).mockResolvedValue(true)
    req.body.customer_id="cus_forged"
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.body.customer_id;req.headers["x-seller-id"]="sel_rogue"
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    expect(svc.personalClaimBuyerCart).not.toHaveBeenCalled()
  })
  it("POST rejects foreign Cart and revocation before Foundation claim",async()=>{
    req.scope.resolve=jest.fn((key:string)=>key==="customer"?
      {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}:
      {listCarts:jest.fn().mockResolvedValue([{id:"cart_a",customer_id:"cus_foreign"}])})
    await POST(req,res);expect(res.status).toHaveBeenCalledWith(403)
    expect(svc.personalClaimBuyerCart).not.toHaveBeenCalled()
    req.scope.resolve=jest.fn((key:string)=>key==="customer"?
      {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}:
      {listCarts:jest.fn().mockResolvedValue([{id:"cart_a",customer_id:"cus_a"}])})
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    expect(svc.personalClaimBuyerCart).not.toHaveBeenCalled()
  })
  it("POST fails closed if later Customer/Cart ownership disappears",async()=>{
    let n=0
    req.scope.resolve=jest.fn((key:string)=>key==="customer"?
      {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}:
      {listCarts:jest.fn().mockImplementation(async()=>{
        n++;return n===3?[]:[{id:"cart_a",customer_id:"cus_a"}]
      })})
    await POST(req,res)
    expect(svc.personalClaimBuyerCart).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("POST never returns another Organization's attribution or inferred cart grant",async()=>{
    svc.personalClaimBuyerCart.mockRejectedValue(new IdentityAccessDenied())
    await POST(req,res);expect(res.status).toHaveBeenCalledWith(403)
    svc.personalClaimBuyerCart.mockRejectedValue(new Error("tx uncertain"))
    await POST(req,res);expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({
      message:"Outcome uncertain; recheck cart attribution"
    })
  })
  it("maps distinct native Offer sellers but cannot claim Store block eligibility",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a";req.query.seller_scope="inspect"
    svc.personalBuyerCartAttribution.mockResolvedValue(true)
    const nativeStates=new Map([["sel_a","open"],["sel_b","open"]])
    const sellerRead=jest.fn(async({id}:{id:string})=>
      nativeStates.has(id)?[{id,status:nativeStates.get(id),
        approved_at:"2026-10-30T00:00:00Z"}]:[])
    req.scope.resolve=jest.fn((key:string)=>{
      if(key==="customer")return {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}
      if(key==="cart")return {
        listCarts:jest.fn().mockResolvedValue([{id:"cart_a",customer_id:"cus_a"}]),
        retrieveCart:jest.fn().mockResolvedValue({id:"cart_a",customer_id:"cus_a",
          completed_at:null,items:[{id:"cali_a"},{id:"cali_b"}]})}
      if(key==="seller")return {listSellers:sellerRead}
      return {graph:jest.fn().mockResolvedValue({data:[{id:"cart_a",items:[
        {id:"cali_a",offer:{id:"offer_a",seller_id:"sel_a"}},
        {id:"cali_b",offer:{id:"offer_b",seller_id:"sel_b"}}
      ]}]})}
    })
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({organization_id:"daorg_a",
      status:"seller_scope_mapped",seller_count:2,
      seller_block_verified:true,checkout_ready:false})
    expect(svc.personalStoreBuyerBlockDecision).toHaveBeenCalledWith(
      "opaque","daorg_a",expect.arrayContaining(["sel_a","sel_b"]))
    expect(sellerRead).toHaveBeenCalledWith({id:"sel_a"})
    expect(sellerRead).toHaveBeenCalledWith({id:"sel_b"})
    nativeStates.set("sel_b","suspended")
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
    nativeStates.set("sel_b","pending_approval")
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    nativeStates.set("sel_b","open")
    svc.personalStoreBuyerBlockDecision.mockResolvedValue({blocked:true})
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
    svc.personalStoreBuyerBlockDecision.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    svc.personalStoreBuyerBlockDecision.mockResolvedValue({blocked:false})
    svc.personalStoreBuyerBlockDecision.mockResolvedValueOnce({blocked:false})
      .mockResolvedValueOnce({blocked:true})
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("denies mid-request Cart line or Offer→Seller changes instead of claiming stale multi-Store scope",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a";req.query.seller_scope="inspect"
    svc.personalBuyerCartAttribution.mockResolvedValue(true)
    const original={id:"cart_a",customer_id:"cus_a",completed_at:null,
      items:[{id:"cali_a"},{id:"cali_b"}]}
    const graph={data:[{id:"cart_a",items:[
      {id:"cali_a",offer:{id:"offer_a",seller_id:"sel_a"}},
      {id:"cali_b",offer:{id:"offer_b",seller_id:"sel_b"}}
    ]}]}
    const staleCases=[
      {secondCart:{...original,items:[{id:"cali_a"}]},secondGraph:graph},
      {secondCart:{...original,completed_at:"2026-10-30T00:00:00Z"},secondGraph:graph},
      {secondCart:original,secondGraph:{data:[{id:"cart_a",items:[
        graph.data[0].items[0],
        {id:"cali_b",offer:{id:"offer_changed",seller_id:"sel_b"}}
      ]}]}},
      {secondCart:original,secondGraph:{data:[{id:"cart_a",items:[
        graph.data[0].items[0],
        {id:"cali_b",offer:{id:"offer_b",seller_id:"sel_other"}}
      ]}]}}
    ]
    for(const scenario of staleCases){
      const readCart=jest.fn().mockResolvedValueOnce(original)
        .mockResolvedValueOnce(scenario.secondCart)
      const readGraph=jest.fn().mockResolvedValueOnce(graph)
        .mockResolvedValueOnce(scenario.secondGraph)
      req.scope.resolve=jest.fn((key:string)=>{
        if(key==="customer")return {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}
        if(key==="cart")return {
          listCarts:jest.fn().mockResolvedValue([{id:"cart_a",customer_id:"cus_a"}]),
          retrieveCart:readCart}
        if(key==="seller")return {listSellers:jest.fn(async({id}:{id:string})=>
          [{id,status:"open",approved_at:"2026-10-30T00:00:00Z"}])}
        return {graph:readGraph}
      })
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
      expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
      expect(readCart).toHaveBeenCalledTimes(2)
      if(scenario.secondCart.completed_at===null&&scenario.secondCart.items.length===2)
        expect(readGraph).toHaveBeenCalledTimes(2)
    }
    expect(svc.personalClaimBuyerCart).not.toHaveBeenCalled()
  })
  it("denies unlinked or truncated Offer rows rather than silently dropping a Store",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a";req.query.seller_scope="inspect"
    svc.personalBuyerCartAttribution.mockResolvedValue(true)
    for(const item of [
      {id:"cali_a",offer:null},
      {id:"cali_a",offer:{id:"offer_a",seller_id:null}},
    ]){
      req.scope.resolve=jest.fn((key:string)=>{
        if(key==="customer")return {listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}
        if(key==="cart")return {
          listCarts:jest.fn().mockResolvedValue([{id:"cart_a",customer_id:"cus_a"}]),
          retrieveCart:jest.fn().mockResolvedValue({id:"cart_a",customer_id:"cus_a",
            completed_at:null,items:[{id:"cali_a"},{id:"cali_b"}]})}
        return {graph:jest.fn().mockResolvedValue({data:[{id:"cart_a",items:[item,
          {id:"cali_b",offer:{id:"offer_b",seller_id:"sel_b"}}]}]})}
      })
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(403)
    }
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("never inspects seller scope without immutable Organization cart attribution",async()=>{
    req.query.customer="verified";req.query.cart_id="cart_a";req.query.seller_scope="inspect"
    svc.personalBuyerCartAttribution.mockResolvedValue(false)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    req.query.cart_id=undefined
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
  })
  it("fails closed for missing, revoked, wrong-Person and stale Customer bindings",async()=>{
    req.query.customer="verified"
    for(const invalid of [null,{person_id:"daprs_a",actor_id:"cus_a",revoked_at:"y"},
      {person_id:"daprs_foreign",actor_id:"cus_a",revoked_at:null},
      {person_id:"daprs_a",actor_id:"mem_a",revoked_at:null}]){
      svc.personalActorBinding.mockResolvedValue(invalid)
      await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    }
    svc.personalActorBinding.mockResolvedValue({
      id:"binding",person_id:"daprs_a",actor_id:"cus_a",revoked_at:null
    }).mockResolvedValueOnce({person_id:"daprs_a",actor_id:"cus_a",revoked_at:null})
      .mockResolvedValueOnce(null)
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("rejects missing native Customer, or purchase grant revoked between reads",async()=>{
    req.query.customer="verified"
    req.scope.resolve=jest.fn(()=>({listCustomers:jest.fn().mockResolvedValue([])}))
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(403)
    req.scope.resolve=jest.fn(()=>({listCustomers:jest.fn().mockResolvedValue([{id:"cus_a"}])}))
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("rejects caller-supplied native customer ID or invalid customer proof selector",async()=>{
    req.query.customer="cus_a"
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(400)
    req.query.customer="verified";req.query.customer_id="cus_a"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    expect(svc.personalActorBinding).not.toHaveBeenCalled()
  })
  it("denies revoked or absent buyer.purchase and foreign organization",async()=>{
    svc.personalBuyerOrganization.mockResolvedValue(null)
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(403)
    svc.personalBuyerOrganization.mockResolvedValue({person_id:"daprs_a",organization_id:"daorg_b"})
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("denies revocation between both live reads",async()=>{
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it("rejects spoofed seller, extra query and malformed IDs",async()=>{
    req.query.organization_id="daorg_a";req.query.actor_id="cus_a"
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(400)
    delete req.query.actor_id;req.headers["x-seller-id"]="sel_b"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.headers["x-seller-id"];req.query.organization_id="different"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    expect(svc.personalBuyerOrganization).not.toHaveBeenCalled()
  })
  it("denies malformed audit and fails closed on unavailable Foundation",async()=>{
    svc.personalBuyerOrganization.mockRejectedValue(new IdentityAccessDenied())
    await GET(req,res);expect(res.status).toHaveBeenCalledWith(403)
    svc.personalBuyerOrganization.mockRejectedValue(new Error("database offline"))
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(503)
  })
})
