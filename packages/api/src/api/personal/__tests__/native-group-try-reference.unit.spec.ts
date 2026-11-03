import {nativeBuyerGroupTryReference} from "../catalog/native-group-try-reference"
import {ContainerRegistrationKeys,Modules} from "@medusajs/framework/utils"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

describe("B22 Buyer Organization private TRY via native Seller-group PriceList",()=>{
  const offer={id:"offer_alpha",seller_id:"sel_alpha",
    product_id:"prod_shared",variant_id:"variant_shared"}
  let req:any,graph:jest.Mock,calculate:jest.Mock,
      prices:jest.Mock,lists:jest.Mock
  let groupOwners:any[],listOwners:any[],priceRows:any[],listRows:any[]
  beforeEach(()=>{
    groupOwners=[{seller_id:"sel_alpha",customer_group_id:"cusgroup_alpha"}]
    listOwners=[{seller_id:"sel_alpha",price_list_id:"plist_alpha"}]
    priceRows=[{id:"price_special",price_list_id:"plist_alpha",
      currency_code:"try",price_rules:[{
        attribute:"offer_id",value:"offer_alpha",operator:"eq"
      }]}]
    listRows=[{id:"plist_alpha",status:"active",
      price_list_rules:[{attribute:"customer.groups.id",value:["cusgroup_alpha"]}]}]
    graph=jest.fn(async(args:any)=>{
      if(args.entity==="offer")return {data:[{
        ...offer,product_variant:{price_set:{id:"pset_shared"}},
        prices:[{id:"price_base",currency_code:"try"}]
      }]}
      if(args.entity==="customer_group_seller")return {data:groupOwners}
      if(args.entity==="price_list_seller")return {data:listOwners}
      throw Error("Unexpected native graph entity")
    })
    calculate=jest.fn(async()=>[{
      id:"pset_shared",currency_code:"try",
      calculated_amount:950.25,is_calculated_price_price_list:true,
      calculated_price:{id:"price_special",price_list_id:"plist_alpha"}
    }])
    prices=jest.fn(async()=>priceRows)
    lists=jest.fn(async()=>listRows)
    req={scope:{resolve:jest.fn((key:string)=>{
      if(key===ContainerRegistrationKeys.QUERY)return {graph}
      if(key===Modules.PRICING)return {
        calculatePrices:calculate,listPrices:prices,listPriceLists:lists
      }
      throw Error("Unexpected native module")
    })}}
  })
  it("calculates only exact eligible native group + Offer for one Seller",async()=>{
    const result=await nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha")
    expect(result).toEqual({amount:950.25,currency_code:"try"})
    expect(calculate).toHaveBeenCalledWith({id:["pset_shared"]},{
      context:{currency_code:"try",offer_id:"offer_alpha",quantity:1,
        "customer.groups.id":"cusgroup_alpha"}
    })
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({
      entity:"price_list_seller",filters:{price_list_id:"plist_alpha"}
    }))
    expect(lists).toHaveBeenCalledWith({id:["plist_alpha"]},
      {relations:["price_list_rules"]})
  })
  it("never selects a Seller B PriceList for Seller A's Offer",async()=>{
    listOwners[0].seller_id="sel_other"
    await expect(nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha"))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("rejects a native CustomerGroup not owned by the current Store",async()=>{
    groupOwners[0].seller_id="sel_other"
    await expect(nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha"))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
    expect(calculate).not.toHaveBeenCalled()
  })
  it("rejects a PriceList without exact server-approved group rule",async()=>{
    listRows[0].price_list_rules[0].value=["cusgroup_foreign"]
    await expect(nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha"))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("rejects wrong Offer price rule even with shared Product variant",async()=>{
    priceRows[0].price_rules[0].value="offer_other"
    await expect(nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha"))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("returns no Buyer price when native PriceList is not selected",async()=>{
    calculate.mockResolvedValueOnce([{id:"pset_shared",currency_code:"try",
      calculated_amount:1250.5,is_calculated_price_price_list:false,
      calculated_price:{id:"price_base",price_list_id:null}}])
    expect(await nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha")).toBeNull()
    expect(prices).not.toHaveBeenCalled()
    expect(lists).not.toHaveBeenCalled()
  })
  it("rejects EUR source Offer and fabricated native scope",async()=>{
    graph.mockImplementationOnce(async()=>({data:[{
      ...offer,product_variant:{price_set:{id:"pset_shared"}},
      prices:[{id:"price_base",currency_code:"eur"}]
    }]}))
    await expect(nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha"))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
    expect(calculate).not.toHaveBeenCalled()
    await expect(nativeBuyerGroupTryReference(req,offer,"cusgroup_bad!"))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("does not invent sub-kuruş or zero TRY prices",async()=>{
    calculate.mockResolvedValueOnce([{
      id:"pset_shared",currency_code:"try",
      calculated_amount:1.001,is_calculated_price_price_list:true,
      calculated_price:{id:"price_special",price_list_id:"plist_alpha"}
    }])
    expect(await nativeBuyerGroupTryReference(req,offer,"cusgroup_alpha")).toBeNull()
  })
})
