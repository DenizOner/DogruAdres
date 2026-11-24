import type {MedusaRequest} from "@medusajs/framework/http"
import {ContainerRegistrationKeys,Modules} from "@medusajs/framework/utils"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

type Offer=Readonly<{id:string;seller_id:string;product_id:string;variant_id:string}>
export type BuyerGroupTryReference=Readonly<{amount:number;currency_code:"try"}>

/**
 * Only invoked with a CustomerGroup ID derived on the server from a current,
 * audited Store×BuyerOrganization grant. This selector does NOT enroll a
 * native Person/Customer in a group, authorize checkout or calculate FX.
 *
 * The installed Medusa 2.22 native PriceList selection is the authority;
 * source/Store/Offer/group attribution must independently match before
 * returning a commercial reference amount to the browser.
 */
export async function nativeBuyerGroupTryReference(
  req:MedusaRequest,offer:Offer,groupId:string
):Promise<BuyerGroupTryReference|null>{
  if(!/^offer_[A-Za-z0-9_-]+$/.test(offer.id)||
     !/^sel_[A-Za-z0-9_-]+$/.test(offer.seller_id)||
     !/^prod_[A-Za-z0-9_-]+$/.test(offer.product_id)||
     !/^variant_[A-Za-z0-9_-]+$/.test(offer.variant_id)||
     !/^cusgroup_[A-Za-z0-9_-]+$/.test(groupId))
    throw new IdentityAccessDenied()

  const query=req.scope.resolve<{
    graph(input:object):Promise<{data:any[]}>
  }>(ContainerRegistrationKeys.QUERY)
  const pricing=req.scope.resolve<{
    calculatePrices(filters:object,context:object):Promise<any[]>
    listPrices(filters:object,config:object):Promise<any[]>
    listPriceLists(filters:object,config:object):Promise<any[]>
  }>(Modules.PRICING)

  const [{data:offers},{data:groups}]=await Promise.all([
    query.graph({entity:"offer",fields:[
      "id","seller_id","product_id","variant_id",
      "product_variant.price_set.id","prices.id","prices.currency_code"
    ],filters:{id:offer.id}}),
    query.graph({entity:"customer_group_seller",fields:[
      "seller_id","customer_group_id"
    ],filters:{seller_id:offer.seller_id,customer_group_id:groupId}})
  ])
  if(!Array.isArray(offers)||offers.length!==1||
     offers[0]?.id!==offer.id||offers[0]?.seller_id!==offer.seller_id||
     offers[0]?.product_id!==offer.product_id||
     offers[0]?.variant_id!==offer.variant_id||
     !/^pset_[A-Za-z0-9_-]+$/.test(offers[0]?.product_variant?.price_set?.id)||
     !Array.isArray(offers[0]?.prices)||offers[0].prices.length>20||
     !offers[0].prices.length||
     offers[0].prices.some((p:any)=>!/^price_[A-Za-z0-9_-]+$/.test(p?.id)||
       p?.currency_code!=="try")||
     !Array.isArray(groups)||groups.length!==1||
     groups[0]?.seller_id!==offer.seller_id||
     groups[0]?.customer_group_id!==groupId)
    throw new IdentityAccessDenied()
  const priceSetId=offers[0].product_variant.price_set.id as string
  const calculated=await pricing.calculatePrices({id:[priceSetId]},{
    context:{currency_code:"try",offer_id:offer.id,quantity:1,
      "customer.groups.id":groupId}
  })
  if(!Array.isArray(calculated)||calculated.length>1)
    throw new IdentityAccessDenied()
  if(!calculated.length)return null
  const current=calculated[0]
  if(current?.id!==priceSetId||current.currency_code!=="try")
    throw new IdentityAccessDenied()
  if(current.is_calculated_price_price_list===false)return null
  const priceId=current?.calculated_price?.id
  const listId=current?.calculated_price?.price_list_id
  if(current.is_calculated_price_price_list!==true||
     !/^price_[A-Za-z0-9_-]+$/.test(priceId)||
     !/^plist_[A-Za-z0-9_-]+$/.test(listId))
    throw new IdentityAccessDenied()

  // Never assume that the native price list belongs to the Offer's Seller.
  const [{data:listOwners},prices,lists]=await Promise.all([
    query.graph({entity:"price_list_seller",
      fields:["seller_id","price_list_id"],filters:{price_list_id:listId}}),
    pricing.listPrices({id:[priceId]},{relations:["price_rules"]}),
    pricing.listPriceLists({id:[listId]},{relations:["price_list_rules"]})
  ])
  if(!Array.isArray(listOwners)||listOwners.length!==1||
     listOwners[0]?.seller_id!==offer.seller_id||
     listOwners[0]?.price_list_id!==listId||
     !Array.isArray(prices)||prices.length!==1||
     prices[0]?.id!==priceId||prices[0]?.price_list_id!==listId||
     prices[0]?.currency_code!=="try"||
     !Array.isArray(prices[0]?.price_rules)||
     prices[0].price_rules.length!==1||
     prices[0].price_rules[0]?.attribute!=="offer_id"||
     prices[0].price_rules[0]?.value!==offer.id||
     !Array.isArray(lists)||lists.length!==1||
     lists[0]?.id!==listId||lists[0]?.status!=="active"||
     !Array.isArray(lists[0]?.price_list_rules)||
     lists[0].price_list_rules.length!==1||
     lists[0].price_list_rules[0]?.attribute!=="customer.groups.id")
    throw new IdentityAccessDenied()
  const permitted=lists[0].price_list_rules[0].value
  if(!(typeof permitted==="string"&&permitted===groupId) &&
     !(Array.isArray(permitted)&&permitted.length>0&&
       permitted.length<=20&&permitted.includes(groupId)&&
       permitted.every((x:unknown)=>typeof x==="string"&&
         /^cusgroup_[A-Za-z0-9_-]+$/.test(x))))
    throw new IdentityAccessDenied()
  const amount=current.calculated_amount
  if(typeof amount!=="number"||!Number.isFinite(amount)||amount<=0||
     amount>1_000_000_000||!/^\d+(?:\.\d{1,2})?$/.test(String(amount)))
    return null
  return {amount,currency_code:"try"}
}
