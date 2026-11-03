import type {MedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {MercurModules} from "@mercurjs/types"
import {access,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
import {nativeDirectTryListPrice,type DirectTryListPrice} from "./native-try-list-price"
import {nativeBuyerGroupTryReference,type BuyerGroupTryReference} from "./native-group-try-reference"

export const AUTHENTICATE=false
const selection=z.object({
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  // Deliberately capped. An untrusted client never chooses native take/skip.
  page:z.enum(["0","1","2","3","4"]).optional()
}).strict()
const sellerId=/^sel_[A-Za-z0-9_-]+$/
const productId=/^prod_[A-Za-z0-9_-]+$/
const offerId=/^offer_[A-Za-z0-9_-]+$/

/** B22 first positive discovery slice: no price, inventory, discount, cart or
 * global native Store route. All data is bound to a current BUYER Organization,
 * a platform-approved native Store and the Store's active buyer-block ledger.
 * The installed Mercur Offer service owns the seller/product/variant mapping.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=selection.safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined||
     req.headers.authorization!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const organizationId=parsed.data.organization_id,token=sessionToken(req)
  const service=access(req)
  const denied=()=>res.status(403).json({message:"Access denied"})
  try{
    const buyer=await service.personalBuyerOrganization(token,organizationId)
    if(!buyer||buyer.organization_id!==organizationId||
       !/^daprs_[A-Za-z0-9_-]+$/.test(buyer.person_id))return denied()

    const seller=req.scope.resolve<{
      listSellers(filters:object,config?:object):Promise<any[]>
    }>("seller")
    const offers=req.scope.resolve<{
      listOffers(filters:object,config?:object):Promise<any[]>
    }>(MercurModules.OFFER)
    const product=req.scope.resolve<{
      listProducts(filters:object,config?:object):Promise<any[]>
    }>("product")

    // Bounded native candidate discovery; open Seller alone is NOT authority.
    // Pagination and full catalogue/search remain a separate acceptance.
    // Stable unique-ID ordering avoids the non-unique timestamp offset trap.
    // An authorized buyer may inspect up to five bounded Seller windows.
    // Do not expose native Seller counts or a global has_more value.
    const page=Number(parsed.data.page??"0")
    const candidates=await seller.listSellers({status:"open"},{
      take:20,skip:page*20,order:{id:"ASC"}
    })
    if(!Array.isArray(candidates)||candidates.length>20||
       new Set(candidates.map(s=>s.id)).size!==candidates.length)
      return denied()
    const stores:Array<{
      id:string;name:string;products:Array<{
        offer_id:string;product_id:string;title:string;
        list_price_try?:DirectTryListPrice;buyer_reference_try?:BuyerGroupTryReference
      }>
    }>=[]
    // Internal-only entitlement IDs. Never serialize group context to clients.
    const eligibleBySeller=new Map<string,string[]>()
    for(const candidate of candidates){
      if(!candidate||!sellerId.test(candidate.id)||candidate.status!=="open"||
         !candidate.approved_at||typeof candidate.name!=="string")continue
      // Foundation's current approved Org→Seller origin and explicit per-Store
      // Buyer Organization block are checked together, never via SellerMember.
      // One suspended/revoked seller must be absent, not mask other approved
      // Stores. A Buyer/session revocation is independently rechecked below.
      const choice=await service.personalStoreBuyerBlockDecision(
        token,organizationId,[candidate.id]).catch((error:unknown)=>{
          if(error instanceof IdentityAccessDenied)return null
          throw error
        })
      if(choice?.ownership_verified!==true||choice.blocked!==false)continue
      const grants=await service.personalBuyerStorePriceGroupIds(token,organizationId,candidate.id)
      if(!grants||grants.person_id!==buyer.person_id||
         grants.organization_id!==organizationId||grants.seller_id!==candidate.id||
         !Array.isArray(grants.customer_group_ids)||
         grants.customer_group_ids.length>20||
         new Set(grants.customer_group_ids).size!==grants.customer_group_ids.length||
         grants.customer_group_ids.some((g:unknown)=>typeof g!=="string"||
           !/^cusgroup_[A-Za-z0-9_-]+$/.test(g)))return denied()
      const groupIds=grants.customer_group_ids as string[]
      eligibleBySeller.set(candidate.id,groupIds)
      const found=await offers.listOffers({seller_id:candidate.id},{take:5,skip:0})
      if(!Array.isArray(found)||found.length>5||
         new Set(found.map(o=>o.id)).size!==found.length)return denied()
      if(!found.length)continue
      const ids:string[]=[]
      for(const row of found){
        if(!row||!offerId.test(row.id)||row.seller_id!==candidate.id||
           !productId.test(row.product_id))return denied()
        if(!ids.includes(row.product_id))ids.push(row.product_id)
      }
      const published=await product.listProducts(
        {id:ids,status:"published"},{take:ids.length})
      if(!Array.isArray(published)||published.length>ids.length||
         new Set(published.map(p=>p.id)).size!==published.length)return denied()
      const titles=new Map<string,string>()
      for(const row of published){
        if(!row||!ids.includes(row.id)||row.status!=="published"||
           typeof row.title!=="string"||row.title.length>500)return denied()
        titles.set(row.id,row.title)
      }
      // Store-specific, direct TRY list price only; no FX/group/checkout
      // assumptions. The Medusa calculated amount must refer to the Price
      // linked to THIS Mercur Offer, not to its shared Product/variant.
      const visible:Array<{
        offer_id:string;product_id:string;title:string;
        list_price_try?:DirectTryListPrice;buyer_reference_try?:BuyerGroupTryReference
      }>=[]
      for(const row of found){
        const title=titles.get(row.product_id)
        if(!title)continue
        const listPrice=await nativeDirectTryListPrice(req,row)
        // Only one unambiguous eligible group is supported in this first
        // slice. No invented priority/FX/tax between multiple price groups.
        const buyerReference=listPrice&&groupIds.length===1?
          await nativeBuyerGroupTryReference(req,row,groupIds[0]):null
        visible.push({
          offer_id:row.id,product_id:row.product_id,title,
          ...(listPrice?{list_price_try:listPrice}:{}),
          ...(buyerReference?{buyer_reference_try:buyerReference}:{})
        })
      }
      if(visible.length)stores.push({id:candidate.id,name:candidate.name,products:visible})
    }

    // Revalidate real Person/Buyer scope and every included Store at response
    // boundary. This is a read consistency guard, NOT a cross-module lock.
    const live=await service.personalBuyerOrganization(token,organizationId)
    if(!live||live.person_id!==buyer.person_id||
       live.organization_id!==organizationId)return denied()
    for(const store of stores){
      const [native]=await seller.listSellers({id:store.id},{take:2})
      if(!native||native.id!==store.id||native.status!=="open"||
         !native.approved_at||native.name!==store.name)return denied()
      const fresh=await service.personalStoreBuyerBlockDecision(
        token,organizationId,[store.id])
      if(fresh?.ownership_verified!==true||fresh.blocked!==false)return denied()
      const groupsWas=eligibleBySeller.get(store.id)
      const groupsNow=await service.personalBuyerStorePriceGroupIds(
        token,organizationId,store.id)
      if(!groupsWas||!groupsNow||groupsNow.person_id!==buyer.person_id||
         groupsNow.organization_id!==organizationId||
         groupsNow.seller_id!==store.id||
         !Array.isArray(groupsNow.customer_group_ids)||
         groupsWas.length!==groupsNow.customer_group_ids.length||
         groupsWas.some((g,i)=>g!==groupsNow.customer_group_ids[i]))return denied()
      const existing=await offers.listOffers(
        {id:store.products.map(p=>p.offer_id),seller_id:store.id},
        {take:store.products.length})
      if(!Array.isArray(existing)||existing.length!==store.products.length||
         existing.some(o=>!store.products.some(p=>p.offer_id===o.id&&
           p.product_id===o.product_id&&o.seller_id===store.id)))return denied()
      const freshProducts=await product.listProducts(
        {id:store.products.map(p=>p.product_id),status:"published"},
        {take:store.products.length})
      if(!Array.isArray(freshProducts)||
         store.products.some(p=>!freshProducts.some(item=>item.id===p.product_id&&
           item.status==="published"&&item.title===p.title)))return denied()
      // Re-read the same linked native price before returning a value. This
      // protects against ordinary stale reads, not a cross-module price lock.
      for(const p of store.products){
        if(!p.list_price_try)continue
        const [current]=existing.filter(o=>o.id===p.offer_id)
        const livePrice=await nativeDirectTryListPrice(req,current)
        if(!livePrice||livePrice.currency_code!==p.list_price_try.currency_code||
           livePrice.amount!==p.list_price_try.amount)return denied()
        if(p.buyer_reference_try){
          if(groupsWas.length!==1)return denied()
          const liveReference=await nativeBuyerGroupTryReference(
            req,current,groupsWas[0])
          if(!liveReference||
             liveReference.currency_code!==p.buyer_reference_try.currency_code||
             liveReference.amount!==p.buyer_reference_try.amount)return denied()
        }
      }
    }
    return res.status(200).json({
      organization_id:organizationId,stores,
      ...(parsed.data.page===undefined?{}:{page}),
      prices_available:false,checkout_ready:false
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}
