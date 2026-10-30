import {GET} from "../buyer-context/route"
import {access,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
describe("B22 selected buyer Organization is not Customer checkout authority",()=>{
  let req:any,res:any,svc:any
  beforeEach(()=>{
    jest.resetAllMocks()
    svc={personalBuyerOrganization:jest.fn().mockResolvedValue({
      person_id:"daprs_a",organization_id:"daorg_a"
    }),personalActorBinding:jest.fn().mockResolvedValue({
      id:"dabind_a",person_id:"daprs_a",actor_id:"cus_a",revoked_at:null
    })}
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    ;(access as jest.Mock).mockReturnValue(svc)
    req={query:{organization_id:"daorg_a"},headers:{},
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
