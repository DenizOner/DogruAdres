import {nativeDirectTryListPrice} from "../catalog/native-try-list-price"
import {ContainerRegistrationKeys,Modules} from "@medusajs/framework/utils"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

describe("B22 direct TRY Offer list price through installed Medusa Pricing",()=>{
  const offer={id:"offer_alpha",seller_id:"sel_alpha",
    product_id:"prod_shared",variant_id:"variant_shared"}
  let req:any,graph:jest.Mock,calculate:jest.Mock,prices:jest.Mock
  let linked:any[],selected:any
  beforeEach(()=>{
    linked=[{id:"price_alpha",currency_code:"try"}]
    graph=jest.fn(async()=>({data:[{
      ...offer,product_variant:{price_set:{id:"pset_shared"}},
      prices:linked
    }]}))
    selected={id:"pset_shared",currency_code:"try",calculated_amount:1250.5,
      calculated_price:{id:"price_alpha",price_list_id:null},
      is_calculated_price_price_list:false,is_original_price_price_list:false}
    calculate=jest.fn(async()=>[selected])
    prices=jest.fn(async()=>[{
      id:"price_alpha",price_list_id:null,price_rules:[
        {attribute:"offer_id",operator:"eq",value:"offer_alpha"}
      ]
    }])
    req={scope:{resolve:jest.fn((k:string)=>{
      if(k===ContainerRegistrationKeys.QUERY)return {graph}
      if(k===Modules.PRICING)return {
        calculatePrices:calculate,listPrices:prices}
      throw Error("Unexpected native Medusa module")
    })}}
  })
  it("uses genuine Offer linked Price and exact TRY, offer_id, quantity=1 context",async()=>{
    const amount=await nativeDirectTryListPrice(req,offer)
    expect(amount).toEqual({amount:1250.5,currency_code:"try"})
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({
      entity:"offer",filters:{id:"offer_alpha"}
    }))
    expect(calculate).toHaveBeenCalledWith({id:["pset_shared"]},{
      context:{currency_code:"try",offer_id:"offer_alpha",quantity:1}
    })
    expect(prices).toHaveBeenCalledWith({id:["price_alpha"]},
      {relations:["price_rules"]})
  })
  it("never converts EUR or mixed-source Offer prices into guessed TRY",async()=>{
    linked[0].currency_code="eur"
    expect(await nativeDirectTryListPrice(req,offer)).toBeNull()
    expect(calculate).not.toHaveBeenCalled()
    linked.push({id:"price_eur",currency_code:"eur"})
    linked[0].currency_code="try"
    expect(await nativeDirectTryListPrice(req,offer)).toBeNull()
    expect(calculate).not.toHaveBeenCalled()
  })
  it("refuses another Offer's selected Price even in the shared variant PriceSet",async()=>{
    selected.calculated_price.id="price_other"
    await expect(nativeDirectTryListPrice(req,offer)).rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("refuses calculated price with a PriceList until Buyer Group eligibility exists",async()=>{
    selected.is_calculated_price_price_list=true
    selected.calculated_price.price_list_id="pl_buyer_private"
    expect(await nativeDirectTryListPrice(req,offer)).toBeNull()
    expect(prices).not.toHaveBeenCalled()
  })
  it("refuses native price rule bound to another Store's Offer",async()=>{
    prices.mockResolvedValueOnce([{
      id:"price_alpha",price_list_id:null,price_rules:[
        {attribute:"offer_id",operator:"eq",value:"offer_other"}
      ]
    }])
    await expect(nativeDirectTryListPrice(req,offer)).rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("refuses additional CustomerGroup/segment rules rather than leaking special prices",async()=>{
    prices.mockResolvedValueOnce([{
      id:"price_alpha",price_list_id:null,price_rules:[
        {attribute:"offer_id",operator:"eq",value:"offer_alpha"},
        {attribute:"customer_group_id",operator:"eq",value:"cgrp_other"}
      ]
    }])
    await expect(nativeDirectTryListPrice(req,offer)).rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("refuses a graph result with forged Seller or wrong Product link",async()=>{
    graph.mockResolvedValueOnce({data:[{
      ...offer,seller_id:"sel_foreign",
      product_variant:{price_set:{id:"pset_shared"}},prices:linked
    }]})
    await expect(nativeDirectTryListPrice(req,offer)).rejects.toBeInstanceOf(IdentityAccessDenied)
    expect(calculate).not.toHaveBeenCalled()
  })
  it("never invents precision, free price, unavailable price or FX",async()=>{
    selected.calculated_amount=12.345
    expect(await nativeDirectTryListPrice(req,offer)).toBeNull()
    selected.calculated_amount=0
    expect(await nativeDirectTryListPrice(req,offer)).toBeNull()
    calculate.mockResolvedValueOnce([])
    expect(await nativeDirectTryListPrice(req,offer)).toBeNull()
  })
})
