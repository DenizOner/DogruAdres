import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
/** Read-only live Organization/Customer/Cart candidate checks. A native cart
 * belonging to a Customer is NOT yet a legal Organization-attributed cart.
 * No checkout token, cart writer, cart line item, or persisted buyer grant.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=z.object({organization_id:org,customer:z.literal("verified").optional(),
    cart_id:z.string().regex(/^cart_[A-Za-z0-9_-]{1,123}$/).optional(),
    seller_scope:z.literal("inspect").optional()
  }).strict().safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined||
     (parsed.success&&parsed.data.cart_id&&parsed.data.customer!=="verified")||
     (parsed.success&&parsed.data.seller_scope&&!parsed.data.cart_id))
    return res.status(400).json({message:"Invalid context"})
  const svc=access(req),token=sessionToken(req)
  try{
    const checked=await svc.personalBuyerOrganization(token,parsed.data.organization_id)
    if(!checked||checked.organization_id!==parsed.data.organization_id||
       typeof checked.person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(checked.person_id))
      return res.status(403).json({message:"Access denied"})
    // The existing dual-proof native Customer link is Person-scoped. It does
    // NOT itself confer Organization purchase or cart access. Customer ID is
    // never accepted from the browser, and native credentials are not minted.
    let customerActorId:string|null=null
    if(parsed.data.customer==="verified"){
      const binding=await svc.personalActorBinding(token,"customer")
      if(!binding||binding.revoked_at||
         binding.person_id!==checked.person_id||
         typeof binding.actor_id!=="string"||
         !/^cus_[A-Za-z0-9_-]+$/.test(binding.actor_id))
        return res.status(403).json({message:"Access denied"})
      const customer=req.scope.resolve<{listCustomers(filter:object):Promise<any[]>}>("customer")
      const rows=await customer.listCustomers({id:binding.actor_id})
      if(rows.length!==1||rows[0].id!==binding.actor_id)
        return res.status(403).json({message:"Access denied"})
      customerActorId=binding.actor_id
    }
    // Medusa Cart Module has a native, indexed Customer-to-Cart relation.
    // Verify ownership without exposing Cart contents. A Person-verified
    // Customer can act for multiple Organizations: this does NOT attribute
    // a native Cart to the selected legal Organization or authorize checkout.
    const cartId=parsed.data.cart_id??null
    let cartForCustomer=false
    const carts=req.scope.resolve<{
      listCarts(filter:{id:string;customer_id:string}):Promise<
        Array<{id:string;customer_id?:string|null;completed_at?:Date|string|null}>>
    }>("cart")
    if(cartId&&customerActorId){
      const nativeCarts=await carts.listCarts({id:cartId,customer_id:customerActorId})
      if(nativeCarts.length!==1||nativeCarts[0].id!==cartId||
         nativeCarts[0].customer_id!==customerActorId||
         nativeCarts[0].completed_at!=null)
        return res.status(403).json({message:"Access denied"})
      cartForCustomer=true
    }
    // A second live read before returning avoids advertising revoked access
    // across a remote query boundary. It is NOT a cross-module checkout lock.
    const current=await svc.personalBuyerOrganization(token,parsed.data.organization_id)
    if(!current||current.person_id!==checked.person_id||
       current.organization_id!==checked.organization_id)
      return res.status(403).json({message:"Access denied"})
    if(customerActorId){
      const bindingNow=await svc.personalActorBinding(token,"customer")
      if(!bindingNow||bindingNow.revoked_at||
         bindingNow.person_id!==current.person_id||
         bindingNow.actor_id!==customerActorId)
        return res.status(403).json({message:"Access denied"})
      const freshCustomers=await req.scope.resolve<{listCustomers(filter:object):Promise<any[]>}>
        ("customer").listCustomers({id:customerActorId})
      if(freshCustomers.length!==1||freshCustomers[0].id!==customerActorId)
        return res.status(403).json({message:"Access denied"})
      if(cartForCustomer&&cartId){
        const freshCarts=await carts.listCarts({id:cartId,customer_id:customerActorId})
        if(freshCarts.length!==1||freshCarts[0].id!==cartId||
           freshCarts[0].customer_id!==customerActorId||
           freshCarts[0].completed_at!=null)
          return res.status(403).json({message:"Access denied"})
      }
    }
    const attributed=cartForCustomer&&cartId&&customerActorId?
      await svc.personalBuyerCartAttribution(token,parsed.data.organization_id,
        cartId,customerActorId)===true:false
    if(parsed.data.seller_scope==="inspect"){
      // Read-only mapping, NOT buyer-block or checkout eligibility. Require
      // immutable Foundation attribution before inspecting commerce resources.
      if(!attributed||!cartId||!customerActorId)
        return res.status(403).json({message:"Access denied"})
      const nativeCart=req.scope.resolve<{
        retrieveCart(id:string,opts:object):Promise<{
          id:string;customer_id?:string|null;completed_at?:unknown;
          items?:Array<{id:string}>
        }>
      }>("cart")
      const cart=await nativeCart.retrieveCart(cartId,{
        relations:["items"],select:["id","customer_id","completed_at"]
      })
      if(cart.id!==cartId||cart.customer_id!==customerActorId||
         cart.completed_at!=null||!Array.isArray(cart.items)||
         cart.items.length>100||
         new Set(cart.items.map(item=>item.id)).size!==cart.items.length)
        return res.status(403).json({message:"Access denied"})
      // Mercur v2.3.7 official Offer link: cart.items.offer.seller_id.
      // Compare every native item ID to Graph, denying truncated joins,
      // omitted offers and duplicate/missing sellers. Never use item metadata.
      const query=req.scope.resolve<{
        graph(input:object):Promise<{data:any[]}>
      }>("query")
      const {data:rows}=await query.graph({
        entity:"cart",fields:[
          "id","items.id","items.offer.id","items.offer.seller_id"
        ],filters:{id:cartId}
      })
      if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==cartId||
         !Array.isArray(rows[0].items)||
         rows[0].items.length!==cart.items.length)
        return res.status(403).json({message:"Access denied"})
      const expected=new Set(cart.items.map(i=>i.id))
      const sellers=new Set<string>()
      for(const item of rows[0].items){
        if(!item||typeof item.id!=="string"||
           !expected.delete(item.id)||!item.offer||
           typeof item.offer.id!=="string"||
           !/^offer_[A-Za-z0-9_-]+$/.test(item.offer.id)||
           typeof item.offer.seller_id!=="string"||
           !/^sel_[A-Za-z0-9_-]+$/.test(item.offer.seller_id))
          return res.status(403).json({message:"Access denied"})
        sellers.add(item.offer.seller_id)
      }
      if(expected.size!==0)return res.status(403).json({message:"Access denied"})
      const last=await svc.personalBuyerOrganization(token,parsed.data.organization_id)
      const currentBinding=await svc.personalActorBinding(token,"customer")
      const finalAttribution=await svc.personalBuyerCartAttribution(
        token,parsed.data.organization_id,cartId,customerActorId)
      if(!last||last.person_id!==checked.person_id||
         !currentBinding||currentBinding.revoked_at||
         currentBinding.person_id!==checked.person_id||
         currentBinding.actor_id!==customerActorId||
         finalAttribution!==true)
        return res.status(403).json({message:"Access denied"})
      return res.status(200).json({
        organization_id:checked.organization_id,
        status:sellers.size?"seller_scope_mapped":"seller_scope_empty",
        seller_count:sellers.size,
        seller_block_verified:false,
        checkout_ready:false
      })
    }
    return res.status(200).json({
      organization_id:checked.organization_id,
      status:cartForCustomer?"native_customer_cart_verified":
        customerActorId?"buyer_customer_verified":"buyer_permission_verified",
      checkout_ready:false,
      ...(cartForCustomer&&cartId&&customerActorId?{
        organization_attributed:
          await svc.personalBuyerCartAttribution(token,parsed.data.organization_id,
            cartId,customerActorId)===true
      }: {})
    })
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}

const claim=z.object({
  action:z.literal("attribute"),
  organization_id:org,
  cart_id:z.string().regex(/^cart_[A-Za-z0-9_-]{1,123}$/)
}).strict()

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=claim.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const {organization_id,cart_id}=parsed.data,svc=access(req),token=sessionToken(req)
  try{
    const check=async()=>{
      const buyer=await svc.personalBuyerOrganization(token,organization_id)
      if(!buyer||buyer.organization_id!==organization_id||
         !/^daprs_[A-Za-z0-9_-]+$/.test(buyer.person_id))return null
      const binding=await svc.personalActorBinding(token,"customer")
      if(!binding||binding.revoked_at||binding.person_id!==buyer.person_id||
         typeof binding.actor_id!=="string"||
         !/^cus_[A-Za-z0-9_-]+$/.test(binding.actor_id))return null
      const customer=req.scope.resolve<{
        listCustomers(filter:object):Promise<Array<{id:string}>>
      }>("customer")
      const carts=req.scope.resolve<{
        listCarts(filter:{id:string;customer_id:string}):Promise<Array<{
          id:string;customer_id?:string|null;completed_at?:Date|string|null
        }>>
      }>("cart")
      const [customers,rows]=await Promise.all([
        customer.listCustomers({id:binding.actor_id}),
        carts.listCarts({id:cart_id,customer_id:binding.actor_id})
      ])
      if(customers.length!==1||customers[0].id!==binding.actor_id||
         rows.length!==1||rows[0].id!==cart_id||
         rows[0].customer_id!==binding.actor_id||rows[0].completed_at!=null)return null
      return {person_id:buyer.person_id,customer_id:binding.actor_id}
    }
    const first=await check()
    if(!first)return res.status(403).json({message:"Access denied"})
    const second=await check()
    if(!second||second.person_id!==first.person_id||
       second.customer_id!==first.customer_id)
      return res.status(403).json({message:"Access denied"})
    const result=await svc.personalClaimBuyerCart(
      token,organization_id,cart_id,first.customer_id)
    if(!result)return res.status(403).json({message:"Access denied"})
    const last=await check()
    if(!last||last.person_id!==first.person_id||
       last.customer_id!==first.customer_id)
      return res.status(403).json({message:"Access denied"})
    const verified=await svc.personalBuyerCartAttribution(
      token,organization_id,cart_id,first.customer_id)
    if(verified!==true)return res.status(403).json({message:"Access denied"})
    return res.status(200).json({
      status:"attributed",organization_id,checkout_ready:false
    })
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; recheck cart attribution"})
  }
}
