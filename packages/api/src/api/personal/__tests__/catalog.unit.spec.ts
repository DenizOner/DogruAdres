import {GET} from "../catalog/route"
import {access,enabled,sessionToken} from "../security"
import {MercurModules} from "@mercurjs/types"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
import {nativeDirectTryListPrice} from "../catalog/native-try-list-price"
import {nativeBuyerGroupTryReference} from "../catalog/native-group-try-reference"

jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()
}))
jest.mock("../catalog/native-try-list-price",()=>({
  nativeDirectTryListPrice:jest.fn()
}))
jest.mock("../catalog/native-group-try-reference",()=>({
  nativeBuyerGroupTryReference:jest.fn()
}))

describe("B22 selected Buyer Organization's bounded published Store Offer discovery",()=>{
  let req:any,res:any,svc:any,stores:any[],offers:any[],products:any[],
      sellerRead:jest.Mock,offerRead:jest.Mock,productRead:jest.Mock
  beforeEach(()=>{
    jest.resetAllMocks()
    stores=[
      {id:"sel_a",name:"First",status:"open",approved_at:"2026-11-02"},
      {id:"sel_b",name:"Second",status:"open",approved_at:"2026-11-02"}
    ]
    offers=[
      {id:"offer_a",seller_id:"sel_a",product_id:"prod_a",variant_id:"variant_a"},
      {id:"offer_b",seller_id:"sel_b",product_id:"prod_b",variant_id:"variant_b"}
    ]
    products=[
      {id:"prod_a",title:"Published A",status:"published"},
      {id:"prod_b",title:"Published B",status:"published"}
    ]
    sellerRead=jest.fn(async(filter:any,config:any={})=>{
      const found=filter.id?stores.filter(s=>s.id===filter.id):
        stores.filter(s=>s.status===filter.status).sort((a,b)=>a.id.localeCompare(b.id))
      const skip=config.skip??0,take=config.take??found.length
      return found.slice(skip,skip+take)
    })
    offerRead=jest.fn(async(filter:any)=>offers.filter(o=>o.seller_id===filter.seller_id&&
      (!filter.id||filter.id.includes(o.id))))
    productRead=jest.fn(async(filter:any)=>products.filter(p=>filter.id.includes(p.id)&&
      p.status===filter.status))
    svc={
      personalBuyerOrganization:jest.fn().mockResolvedValue({
        person_id:"daprs_a",organization_id:"daorg_a"
      }),
      personalStoreBuyerBlockDecision:jest.fn().mockResolvedValue({
        blocked:false,ownership_verified:true
      }),
      personalBuyerStorePriceGroupIds:jest.fn(async(_token:string,_org:string,sid:string)=>({
        person_id:"daprs_a",organization_id:"daorg_a",
        seller_id:sid,customer_group_ids:[]
      }))
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("opaque")
    ;(access as jest.Mock).mockReturnValue(svc)
    ;(nativeDirectTryListPrice as jest.Mock).mockResolvedValue(null)
    ;(nativeBuyerGroupTryReference as jest.Mock).mockResolvedValue(null)
    req={query:{organization_id:"daorg_a"},headers:{},scope:{resolve:jest.fn((k:string)=>{
      if(k==="seller")return {listSellers:sellerRead}
      if(k===MercurModules.OFFER)return {listOffers:offerRead}
      if(k==="product")return {listProducts:productRead}
      throw Error("Unexpected native module")
    })}}
    res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()}
    res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  })
  it("returns only approved Seller linked Offer titles under the selected buyer, no price or inventory",async()=>{
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      organization_id:"daorg_a",
      stores:[
        {id:"sel_a",name:"First",products:[
          {offer_id:"offer_a",product_id:"prod_a",title:"Published A"}]},
        {id:"sel_b",name:"Second",products:[
          {offer_id:"offer_b",product_id:"prod_b",title:"Published B"}]}
      ],prices_available:false,checkout_ready:false
    })
    expect(svc.personalBuyerOrganization).toHaveBeenCalledTimes(2)
    expect(svc.personalStoreBuyerBlockDecision).toHaveBeenCalledTimes(4)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","private, no-store")
    expect(res.setHeader).toHaveBeenCalledWith("X-Robots-Tag","noindex, nofollow, noarchive")
  })
  it("renders direct TRY list amount for exact Store Offer but no final checkout price",async()=>{
    ;(nativeDirectTryListPrice as jest.Mock).mockImplementation(async(_req:any,o:any)=>
      ({amount:o.id==="offer_a"?1000:1100,currency_code:"try"}))
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",stores:[
        {id:"sel_a",name:"First",products:[
          {offer_id:"offer_a",product_id:"prod_a",title:"Published A",
            list_price_try:{amount:1000,currency_code:"try"}}]},
        {id:"sel_b",name:"Second",products:[
          {offer_id:"offer_b",product_id:"prod_b",title:"Published B",
            list_price_try:{amount:1100,currency_code:"try"}}]}
      ],prices_available:false,checkout_ready:false
    })
    expect(nativeDirectTryListPrice).toHaveBeenCalledTimes(4)
  })
  it("displays native private TRY only for current Store-specific Buyer Organization group",async()=>{
    ;(nativeDirectTryListPrice as jest.Mock).mockImplementation(async(_req:any,o:any)=>({
      amount:o.id==="offer_a"?1250.5:2000,currency_code:"try"
    }))
    svc.personalBuyerStorePriceGroupIds.mockImplementation(async(_t:string,_o:string,sid:string)=>({
      person_id:"daprs_a",organization_id:"daorg_a",seller_id:sid,
      customer_group_ids:sid==="sel_a"?["cusgroup_allowed"]:[]
    }))
    ;(nativeBuyerGroupTryReference as jest.Mock).mockResolvedValue({
      amount:950.25,currency_code:"try"
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    const value=res.json.mock.calls.at(-1)?.[0]
    expect(value.checkout_ready).toBe(false)
    expect(value.prices_available).toBe(false)
    expect(value.stores[0].products[0].list_price_try.amount).toBe(1250.5)
    expect(value.stores[0].products[0].buyer_reference_try).toEqual({
      amount:950.25,currency_code:"try"
    })
    expect(value.stores[1].products[0].buyer_reference_try).toBeUndefined()
    expect(nativeBuyerGroupTryReference).toHaveBeenCalledTimes(2)
    expect(nativeBuyerGroupTryReference).toHaveBeenCalledWith(req,offers[0],"cusgroup_allowed")
  })
  it("withholds private TRY if Store group was revoked after calculation but before response",async()=>{
    ;(nativeDirectTryListPrice as jest.Mock).mockResolvedValue({
      amount:1250.5,currency_code:"try"
    })
    let first=true
    svc.personalBuyerStorePriceGroupIds.mockImplementation(async(_t:string,_o:string,sid:string)=>{
      const ids=sid==="sel_a"&&first?["cusgroup_allowed"]:[]
      if(sid==="sel_a")first=false
      return {person_id:"daprs_a",organization_id:"daorg_a",
        seller_id:sid,customer_group_ids:ids}
    })
    ;(nativeBuyerGroupTryReference as jest.Mock).mockResolvedValue({
      amount:950.25,currency_code:"try"
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("does not trust a group grant for another Seller or Person",async()=>{
    svc.personalBuyerStorePriceGroupIds.mockImplementation(async(_t:string,_o:string,sid:string)=>({
      person_id:"daprs_wrong",organization_id:"daorg_a",
      seller_id:sid==="sel_a"?"sel_foreign":sid,customer_group_ids:["cusgroup_allowed"]
    }))
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(nativeBuyerGroupTryReference).not.toHaveBeenCalled()
  })
  it("refuses a native PriceList whose owner or Offer proof fails",async()=>{
    ;(nativeDirectTryListPrice as jest.Mock).mockResolvedValue({
      amount:1250.5,currency_code:"try"
    })
    svc.personalBuyerStorePriceGroupIds.mockImplementation(async(_t:string,_o:string,sid:string)=>({
      person_id:"daprs_a",organization_id:"daorg_a",seller_id:sid,
      customer_group_ids:sid==="sel_a"?["cusgroup_allowed"]:[]
    }))
    ;(nativeBuyerGroupTryReference as jest.Mock).mockRejectedValue(
      new IdentityAccessDenied())
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
  })
  it("fails closed if a Store's native direct TRY price changes before response",async()=>{
    let count=0
    ;(nativeDirectTryListPrice as jest.Mock).mockImplementation(async()=>({
      amount:++count===3?999:1000,currency_code:"try"
    }))
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("never reads native catalogue before Person/Buyer Organization authorization",async()=>{
    svc.personalBuyerOrganization.mockResolvedValue(null)
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(sellerRead).not.toHaveBeenCalled()
    expect(offerRead).not.toHaveBeenCalled()
    expect(productRead).not.toHaveBeenCalled()
  })
  it("lets an authorized Buyer reach the twenty-first native Store without exposing global Seller counts",async()=>{
    stores=Array.from({length:21},(_,i)=>({
      id:"sel_"+String(i).padStart(3,"0"),
      name:"Store "+i,status:"open",approved_at:"2026-11-02"
    }))
    offers=[{id:"offer_last",seller_id:"sel_020",
      product_id:"prod_last",variant_id:"variant_last"}]
    products=[{id:"prod_last",title:"Later visible Offer",status:"published"}]
    req.query={organization_id:"daorg_a",page:"1"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(sellerRead).toHaveBeenCalledWith({status:"open"},{
      take:20,skip:20,order:{id:"ASC"}
    })
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",page:1,
      stores:[{id:"sel_020",name:"Store 20",products:[
        {offer_id:"offer_last",product_id:"prod_last",title:"Later visible Offer"}
      ]}],
      prices_available:false,checkout_ready:false
    })
    const payload=res.json.mock.lastCall?.[0]
    expect(payload).not.toHaveProperty("count")
    expect(payload).not.toHaveProperty("has_more")
    expect(payload).not.toHaveProperty("next_seller")
    expect(svc.personalBuyerStorePriceGroupIds).toHaveBeenCalledWith(
      "opaque","daorg_a","sel_020"
    )
    expect(svc.personalStoreBuyerBlockDecision).toHaveBeenCalledTimes(2)
  })
  it("keeps foreign/blocked Stores invisible on later Seller windows",async()=>{
    stores=Array.from({length:21},(_,i)=>({
      id:"sel_"+String(i).padStart(3,"0"),
      name:"Store "+i,status:"open",approved_at:"2026-11-02"
    }))
    offers=[{id:"offer_last",seller_id:"sel_020",
      product_id:"prod_last",variant_id:"variant_last"}]
    products=[{id:"prod_last",title:"Private",status:"published"}]
    req.query={organization_id:"daorg_a",page:"1"}
    svc.personalStoreBuyerBlockDecision.mockResolvedValue({
      ownership_verified:true,blocked:true
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",page:1,stores:[],
      prices_available:false,checkout_ready:false
    })
    expect(offerRead).not.toHaveBeenCalled()
    svc.personalStoreBuyerBlockDecision.mockResolvedValue({
      ownership_verified:true,blocked:false
    })
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("rejects unbounded or forged Seller-page parameters before native service reads",async()=>{
    for(const page of ["-1","5","10000","1.5","00","01","",["1","2"]]){
      req.query={organization_id:"daorg_a",page}
      await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    req.query={organization_id:"daorg_a",page:"1",seller_id:"sel_foreign"}
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(sellerRead).not.toHaveBeenCalled()
  })
  it("requires exact Organization query and refuses forged native context",async()=>{
    for(const query of [{},{organization_id:"daorg_a",seller_id:"sel_a"},
      {organization_id:"daorg_invalid!"}]){
      req.query=query;await GET(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    req.query={organization_id:"daorg_a"};req.headers["x-seller-id"]="sel_a"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    delete req.headers["x-seller-id"];req.headers.authorization="Bearer forged"
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(400)
    expect(sellerRead).not.toHaveBeenCalled()
  })
  it("omits blocked, unapproved, unowned or unpublished Stores and products",async()=>{
    svc.personalStoreBuyerBlockDecision.mockImplementation(async(_t:string,_o:string,ids:string[])=>
      ({blocked:ids[0]==="sel_b",ownership_verified:true}))
    products[0].status="draft"
    await GET(req,res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      organization_id:"daorg_a",stores:[],prices_available:false,checkout_ready:false
    })
    stores[0].approved_at=null;products[0].status="published"
    await GET(req,res)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",stores:[],prices_available:false,checkout_ready:false
    })
  })
  it("denies if Buyer Org is revoked or Store blocked at the response boundary",async()=>{
    svc.personalBuyerOrganization.mockResolvedValueOnce({
      person_id:"daprs_a",organization_id:"daorg_a"
    }).mockResolvedValueOnce(null)
    await GET(req,res);expect(res.status).toHaveBeenLastCalledWith(403)
    svc.personalBuyerOrganization.mockReset().mockResolvedValue({
      person_id:"daprs_a",organization_id:"daorg_a"
    })
    let calls=0
    svc.personalStoreBuyerBlockDecision.mockImplementation(async()=>{
      calls++;return calls===3?{blocked:true,ownership_verified:true}:
        {blocked:false,ownership_verified:true}
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("omits an inactive legal Seller Organization while other approved Stores remain visible",async()=>{
    svc.personalStoreBuyerBlockDecision.mockImplementation(async(_token:string,_org:string,ids:string[])=>{
      if(ids[0]==="sel_a")throw new IdentityAccessDenied()
      return {blocked:false,ownership_verified:true}
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",stores:[
        {id:"sel_b",name:"Second",products:[
          {offer_id:"offer_b",product_id:"prod_b",title:"Published B"}]}
      ],prices_available:false,checkout_ready:false
    })
  })
  it("denies a Store whose legal Seller Organization is suspended between discovery and response",async()=>{
    let a=0
    svc.personalStoreBuyerBlockDecision.mockImplementation(async(_token:string,_org:string,ids:string[])=>{
      if(ids[0]==="sel_a"&&++a===2)throw new IdentityAccessDenied()
      return {blocked:false,ownership_verified:true}
    })
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(res.json).toHaveBeenLastCalledWith({message:"Access denied"})
  })
  it("never trusts an Offer with another Seller ID, duplicated records or missing proof",async()=>{
    offers[0].seller_id="sel_foreign"
    await GET(req,res)
    expect(res.status).toHaveBeenLastCalledWith(200)
    offers[0].seller_id="sel_a"
    svc.personalStoreBuyerBlockDecision.mockResolvedValue({
      blocked:false,ownership_verified:false
    })
    await GET(req,res)
    expect(res.json).toHaveBeenLastCalledWith({
      organization_id:"daorg_a",stores:[],prices_available:false,checkout_ready:false
    })
  })
})
