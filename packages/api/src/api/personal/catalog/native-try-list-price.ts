import type {MedusaRequest} from "@medusajs/framework/http"
import {ContainerRegistrationKeys,Modules} from "@medusajs/framework/utils"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

type OfferScope=Readonly<{
  id:string;seller_id:string;product_id:string;variant_id:string
}>
export type DirectTryListPrice=Readonly<{amount:number;currency_code:"try"}>

const id=(value:unknown,prefix:string):value is string=>
  typeof value==="string"&&new RegExp("^"+prefix+"_[A-Za-z0-9_-]+$").test(value)

/**
 * Read-only first TRY list-price slice. The installed Mercur v2.3.7 links each
 * Offer to its own Prices while Offers of a shared variant use the same
 * Medusa v2.21.2 PriceSet. Never calculate using only the variant or the
 * browser's Person/Customer context: both would mix legal Store principals.
 *
 * Deliberately NOT a substitute for Store×Buyer Organization CustomerGroup
 * eligibility, versioned foreign-currency→TRY publication, promotions, taxes,
 * quote/checkout or source-currency settlement. No custom price selection:
 * Medusa calculatePrices remains the only calculated-price authority.
 */
export async function nativeDirectTryListPrice(
  req:MedusaRequest,offer:OfferScope
):Promise<DirectTryListPrice|null>{
  if(!id(offer.id,"offer")||!id(offer.seller_id,"sel")||
     !id(offer.variant_id,"variant")||!id(offer.product_id,"prod"))
    throw new IdentityAccessDenied()
  const query=req.scope.resolve<{
    graph(input:object):Promise<{data:any[]}>
  }>(ContainerRegistrationKeys.QUERY)
  const pricing=req.scope.resolve<{
    calculatePrices(filters:object,context:object):Promise<any[]>
    listPrices(filters:object,config:object):Promise<any[]>
  }>(Modules.PRICING)
  const {data}=await query.graph({
    entity:"offer",
    fields:["id","seller_id","product_id","variant_id",
      "product_variant.price_set.id","prices.id","prices.currency_code"],
    filters:{id:offer.id}
  })
  if(!Array.isArray(data)||data.length!==1)throw new IdentityAccessDenied()
  const record=data[0],ps=record?.product_variant?.price_set?.id
  if(record?.id!==offer.id||record?.seller_id!==offer.seller_id||
     record?.product_id!==offer.product_id||
     record?.variant_id!==offer.variant_id||!id(ps,"pset")||
     !Array.isArray(record.prices)||record.prices.length>20||
     new Set(record.prices.map((p:any)=>p?.id)).size!==record.prices.length||
     record.prices.some((p:any)=>!id(p?.id,"price")||
       typeof p?.currency_code!=="string"))
    throw new IdentityAccessDenied()

  // The FX publication/version contract is not implemented. Do not convert or
  // guess a TRY value from foreign-currency source Offers.
  if(!record.prices.length||
     record.prices.some((p:any)=>p.currency_code!=="try"))return null

  const calculated=await pricing.calculatePrices(
    {id:[ps]},{context:{currency_code:"try",offer_id:offer.id,quantity:1}}
  )
  if(!Array.isArray(calculated)||calculated.length>1)
    throw new IdentityAccessDenied()
  if(!calculated.length)return null
  const native=calculated[0],priceId=native?.calculated_price?.id
  // A group/PriceList-specific discount cannot be attributed to a Buyer
  // Organization until its verified activities and Store group link exist.
  if(native?.is_calculated_price_price_list!==false||
     native?.calculated_price?.price_list_id||
     native?.is_original_price_price_list!==false)return null
  if(native.id!==ps||native.currency_code!=="try"||
     !id(priceId,"price")||
     !record.prices.some((p:any)=>p.id===priceId))
    throw new IdentityAccessDenied()
  const amount=native.calculated_amount
  // No invented FX/financial rounding. This first display accepts only
  // directly stored, non-negative TRY amounts representable to the kuruş.
  if(typeof amount!=="number"||!Number.isFinite(amount)||
     amount<=0||amount>1_000_000_000||
     !/^\\d+(?:\\.\\d{1,2})?$/.test(String(amount)))
    return null

  const selected=await pricing.listPrices({id:[priceId]},{relations:["price_rules"]})
  if(!Array.isArray(selected)||selected.length!==1||
     selected[0]?.id!==priceId||selected[0]?.price_list_id)
    throw new IdentityAccessDenied()
  const rules=selected[0].price_rules
  if(!Array.isArray(rules)||rules.length!==1||
     rules[0]?.attribute!=="offer_id"||rules[0]?.value!==offer.id||
     (rules[0]?.operator!==undefined&&rules[0].operator!=="eq"))
    throw new IdentityAccessDenied()
  return {amount,currency_code:"try"}
}
