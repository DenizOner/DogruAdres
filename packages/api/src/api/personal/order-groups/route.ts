import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const selection=z.object({
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  order_group_id:z.string().regex(/^og_[A-Za-z0-9_-]{1,123}$/)
}).strict()
const customerIdPattern=/^cus_[A-Za-z0-9_-]+$/
const cartIdPattern=/^cart_[A-Za-z0-9_-]{1,123}$/
const orderIdPattern=/^order_[A-Za-z0-9_-]+$/

type NativeGroup={
  id:string;cart_id:string;customer_id?:string|null
}
type NativeCart={
  id:string;customer_id?:string|null;completed_at?:string|Date|null
}
type NativeOrder={
  id:string;display_id?:number|null;status?:string|null
  items?:Array<{id:string;title?:string|null;quantity?:number|null}>
}
type OrderGroupGraph={
  id:string;cart_id:string;customer_id?:string|null
  display_id?:number|null;created_at?:string|Date|null
  orders?:NativeOrder[]
}

/**
 * B22's first read-only, Organization-owned historic order detail.
 * The native /store/order-groups route stays CLOSED: the native customer
 * identity alone does not prove the legal Buyer Organization.
 * No payment/checkout, metadata, address, seller private data or new writes.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive")
  res.setHeader("Referrer-Policy","no-referrer")
  res.setHeader("X-Content-Type-Options","nosniff")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=selection.safeParse(req.query)
  if(!parsed.success||req.headers.authorization!==undefined||
      req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})

  const {organization_id:orgId,order_group_id:groupId}=parsed.data
  const token=sessionToken(req)
  const denied=()=>res.status(403).json({message:"Access denied"})
  if(!token)return denied()

  try{
    const foundation=access(req)
    const buyer=await foundation.personalBuyerOrganization(token,orgId)
    if(!buyer||buyer.organization_id!==orgId||
       !/^daprs_[A-Za-z0-9_-]+$/.test(buyer.person_id))return denied()

    // Verified Customer remains only an adapter of this canonical Person.
    // Do not accept an actor, native token or Customer ID from a browser.
    const binding=await foundation.personalActorBinding(token,"customer")
    const customerId=binding?.actor_id
    if(binding?.person_id!==buyer.person_id||binding.revoked_at||
       typeof customerId!=="string"||!customerIdPattern.test(customerId))
      return denied()
    const customers=req.scope.resolve<{
      listCustomers(filter:{id:string}):Promise<Array<{id:string}>>
    }>("customer")
    const customerRows=await customers.listCustomers({id:customerId})
    if(customerRows.length!==1||customerRows[0]?.id!==customerId)return denied()

    const seller=req.scope.resolve<{
      listOrderGroups(filter:{id:string},config?:object):Promise<NativeGroup[]>
    }>("seller")
    const groupRows=await seller.listOrderGroups({id:groupId},{take:2})
    if(groupRows.length!==1||groupRows[0]?.id!==groupId||
       groupRows[0].customer_id!==customerId||
       !cartIdPattern.test(groupRows[0].cart_id))return denied()
    const cartId=groupRows[0].cart_id

    // Reuse Foundation's immutable audited Cart -> Buyer Organization
    // attribution plus its live Person/Customer binding proof. A native
    // customer_id on a group, by itself, MUST NEVER grant an order read.
    if(await foundation.personalBuyerCartAttribution(token,orgId,cartId,customerId)!==true)
      return denied()

    const carts=req.scope.resolve<{
      listCarts(filter:{id:string;customer_id:string}):Promise<NativeCart[]>
    }>("cart")
    const cartRows=await carts.listCarts({id:cartId,customer_id:customerId})
    if(cartRows.length!==1||cartRows[0]?.id!==cartId||
       cartRows[0].customer_id!==customerId||
       cartRows[0].completed_at==null)return denied()

    // Query only deliberately selected fields; no native wildcard DTO,
    // arbitrary fields selector, shipping/payment identity or private metadata.
    const query=req.scope.resolve<{
      graph(input:object):Promise<{data:any[]}>
    }>("query")
    const response=await query.graph({
      entity:"order_group",
      filters:{id:groupId},
      fields:[
        "id","cart_id","customer_id","display_id","created_at",
        "orders.id","orders.display_id","orders.status",
        "orders.items.id","orders.items.title","orders.items.quantity"
      ]
    })
    const rows=response.data as OrderGroupGraph[]
    if(!Array.isArray(rows)||rows.length!==1||
       rows[0]?.id!==groupId||rows[0].cart_id!==cartId||
       rows[0].customer_id!==customerId)return denied()
    const nativeOrders=rows[0].orders
    if(!Array.isArray(nativeOrders)||nativeOrders.length<1||
       nativeOrders.length>50)return denied()

    const ids=new Set<string>()
    const orders:Array<{
      id:string;display_id:number;status:string;
      items:Array<{title:string;quantity:number}>
    }>=[]
    for(const order of nativeOrders){
      if(!order||typeof order.id!=="string"||
         !orderIdPattern.test(order.id)||ids.has(order.id)||
         !Number.isSafeInteger(order.display_id)||Number(order.display_id)<1||
         typeof order.status!=="string"||order.status.length>60||
         !Array.isArray(order.items)||order.items.length<1||
         order.items.length>100)return denied()
      ids.add(order.id)
      const itemIds=new Set<string>()
      const items:Array<{title:string;quantity:number}>=[]
      for(const item of order.items){
        if(!item||typeof item.id!=="string"||itemIds.has(item.id)||
           typeof item.title!=="string"||item.title.length>500||
           !Number.isSafeInteger(item.quantity)||Number(item.quantity)<1)
          return denied()
        itemIds.add(item.id)
        items.push({title:item.title,quantity:item.quantity as number})
      }
      orders.push({id:order.id,display_id:order.display_id as number,
        status:order.status,items})
    }

    // Crash-interrupted or orphaned Orders are never advertised as history:
    // every group child must have the exact same native order_cart link.
    const linked=await query.graph({
      entity:"order_cart",filters:{cart_id:cartId},
      fields:["cart_id","order_id"]
    })
    if(!Array.isArray(linked.data)||linked.data.length!==ids.size)return denied()
    const remaining=new Set(ids)
    for(const entry of linked.data){
      if(!entry||entry.cart_id!==cartId||
         typeof entry.order_id!=="string"||!remaining.delete(entry.order_id))
        return denied()
    }
    if(remaining.size)return denied()

    // Recheck the current legal scope and binding at the response boundary.
    // This is a read consistency guard, not a claimed cross-module lock.
    const current=await foundation.personalBuyerOrganization(token,orgId)
    const currentBinding=await foundation.personalActorBinding(token,"customer")
    if(!current||current.person_id!==buyer.person_id||
       current.organization_id!==orgId||!currentBinding||
       currentBinding.person_id!==buyer.person_id||
       currentBinding.actor_id!==customerId||currentBinding.revoked_at||
       await foundation.personalBuyerCartAttribution(token,orgId,cartId,customerId)!==true)
      return denied()

    if(!Number.isSafeInteger(rows[0].display_id)||
       Number(rows[0].display_id)<1)return denied()
    const createdAt=rows[0].created_at
    if(!(createdAt instanceof Date)&&typeof createdAt!=="string")return denied()
    const date=createdAt instanceof Date?createdAt.toISOString():createdAt
    if(!Number.isFinite(Date.parse(date)))return denied()

    return res.status(200).json({
      organization_id:orgId,
      order_group:{
        id:groupId,display_id:rows[0].display_id,created_at:date,orders
      }
    })
  }catch(error){
    if(error instanceof IdentityAccessDenied)return denied()
    // No request URL, internal IDs, headers, provider response or error body.
    return res.status(503).json({message:"Service unavailable"})
  }
}
