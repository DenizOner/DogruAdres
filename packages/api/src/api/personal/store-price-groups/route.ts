import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {ContainerRegistrationKeys} from "@medusajs/framework/utils"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const group=z.string().regex(/^cusgroup_[A-Za-z0-9_-]+$/)
const ids=z.object({
  organization_id:org,seller_id:seller,
  buyer_organization_id:org,customer_group_id:group
}).strict()
const write=ids.extend({action:z.enum(["grant","revoke"])}).strict()
const listing=z.object({
  organization_id:org,seller_id:seller,view:z.literal("list")
}).strict()

/** First-party, read-only native group choices for one verified Store Owner.
 * The group link is authoritative; never enumerate global CustomerGroups.
 * Choosing a group grants neither the Buyer Org nor the Person a price.
 */
async function listStoreGroups(req:MedusaRequest,res:MedusaResponse,
  input:z.infer<typeof listing>){
  const denied=()=>res.status(403).json({message:"Access denied"})
  const svc=access(req),token=sessionToken(req)
  try{
    const native=req.scope.resolve<{
      listMembers(f:object):Promise<any[]>
      listSellerMembers(f:object):Promise<any[]>
      listSellers(f:object):Promise<any[]>
    }>("seller")
    const query=req.scope.resolve<{
      graph(input:object):Promise<{data:any[]}>
    }>(ContainerRegistrationKeys.QUERY)
    const customer=req.scope.resolve<{
      listCustomerGroups(f:object):Promise<any[]>
    }>("customer")
    const current=async()=>{
      const [owner,legal,binding]=await Promise.all([
        svc.personalManagerOrganization(token,input.organization_id),
        svc.personalLegalSellerIds(token,input.organization_id),
        svc.personalActorBinding(token,"member")
      ])
      if(!owner||!legal||owner.person_id!==legal.person_id||
         !Array.isArray(legal.seller_ids)||
         !legal.seller_ids.includes(input.seller_id)||
         !binding||binding.revoked_at||
         binding.actor_type!=="member"||
         typeof binding.id!=="string"||
         binding.person_id!==owner.person_id||
         typeof binding.actor_id!=="string")return null
      const [members,links,stores]=await Promise.all([
        native.listMembers({id:binding.actor_id,is_active:true}),
        native.listSellerMembers({seller_id:input.seller_id,
          member_id:binding.actor_id}),
        native.listSellers({id:input.seller_id})
      ])
      if(members.length!==1||members[0].id!==binding.actor_id||
         members[0].is_active!==true||
         links.length!==1||links[0].seller_id!==input.seller_id||
         links[0].member_id!==binding.actor_id||
         stores.length!==1||stores[0].id!==input.seller_id||
         stores[0].status!=="open"||!stores[0].approved_at)return null
      return {person_id:owner.person_id,
        binding_id:binding.id,actor_id:binding.actor_id}
    }
    const before=await current()
    if(!before)return denied()
    // The explicit, bounded native Seller link is the only discovery source.
    const {data:links}=await query.graph({
      entity:"customer_group_seller",
      fields:["seller_id","customer_group_id"],
      filters:{seller_id:input.seller_id},
      pagination:{skip:0,take:100}
    })
    if(!Array.isArray(links)||links.length>100||
       links.some(x=>x.seller_id!==input.seller_id||
         !group.safeParse(x.customer_group_id).success))return denied()
    const ids=[...new Set(links.map(x=>x.customer_group_id as string))]
    const records=ids.length?await customer.listCustomerGroups({id:ids}):[]
    if(!Array.isArray(records))return denied()
    const allowed=new Set(ids)
    const groups=records.filter(x=>allowed.has(x.id)&&
      typeof x.name==="string"&&group.safeParse(x.id).success)
      .map(x=>({id:String(x.id),name:String(x.name).slice(0,160)}))
      .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))
    if(groups.length!==ids.length||new Set(groups.map(x=>x.id)).size!==ids.length)
      return denied()
    // A stale or revoked Owner/Member/Store must not receive the names.
    const after=await current()
    if(!after||after.person_id!==before.person_id||
       after.binding_id!==before.binding_id||
       after.actor_id!==before.actor_id)return denied()
    return res.status(200).json({
      organization_id:input.organization_id,
      seller_id:input.seller_id,groups
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?
        "Access denied":"Unavailable"})
  }
}

/** Real first-party SellerOwner -> BuyerOrg -> native SellerCustomerGroup.
 * Native Customer is Person-scoped and cannot represent BuyerOrg membership.
 * The audited Foundation grant does not yet expose group or checkout prices.
 */
async function handle(req:MedusaRequest,res:MedusaResponse,action:"read"|"grant"|"revoke",
  input:z.infer<typeof ids>){
  const denied=()=>res.status(403).json({message:"Access denied"})
  const service=access(req),token=sessionToken(req)
  try{
    const binding=await service.personalActorBinding(token,"member")
    if(!binding||binding.revoked_at||typeof binding.id!=="string"||
       typeof binding.person_id!=="string"||typeof binding.actor_id!=="string"||
       binding.actor_type!=="member")return denied()
    const native=req.scope.resolve<{
      listMembers(f:object):Promise<any[]>
      listSellerMembers(f:object):Promise<any[]>
      listSellers(f:object):Promise<any[]>
    }>("seller")
    const query=req.scope.resolve<{
      graph(input:object):Promise<{data:any[]}>
    }>(ContainerRegistrationKeys.QUERY)
    const live=async()=>{
      const [members,links,stores]=await Promise.all([
        native.listMembers({id:binding.actor_id,is_active:true}),
        native.listSellerMembers({seller_id:input.seller_id,member_id:binding.actor_id}),
        native.listSellers({id:input.seller_id})
      ])
      if(members.length!==1||members[0].id!==binding.actor_id||
         members[0].is_active!==true||links.length!==1||
         links[0].seller_id!==input.seller_id||
         links[0].member_id!==binding.actor_id||
         stores.length!==1||stores[0].id!==input.seller_id||
         (action!=="revoke"&&(stores[0].status!=="open"||!stores[0].approved_at)))
        return false
      // A Seller cannot borrow another Seller's native CustomerGroup,
      // even when both share the same ProductVariant or native Customer.
      if(action==="revoke")return true
      const {data}=await query.graph({
        entity:"customer_group_seller",
        fields:["customer_group_id","seller_id"],
        filters:{seller_id:input.seller_id,customer_group_id:input.customer_group_id}
      })
      return Array.isArray(data)&&data.length===1&&
        data[0].seller_id===input.seller_id&&
        data[0].customer_group_id===input.customer_group_id
    }
    if(!await live())return denied()
    const result=await service.personalStorePriceGroupAccess(token,{
      action,...input,
      member_binding_id:binding.id,member_actor_id:binding.actor_id,
      member_person_id:binding.person_id
    })
    if(!result)return denied()
    // The HTTP response must never confirm a grant after the exact
    // Person->Member binding was unlinked while leaving the native
    // SellerMember in place. This is a second read, not the write lock:
    // the Foundation transaction serializes with unlink before mutating.
    const freshBinding=await service.personalActorBinding(token,"member")
    if(!freshBinding||freshBinding.revoked_at||
       freshBinding.id!==binding.id||freshBinding.person_id!==binding.person_id||
       freshBinding.actor_id!==binding.actor_id)
      return res.status(503).json({message:"Outcome uncertain; recheck group"})
    if(!await live())
      return res.status(503).json({message:"Outcome uncertain; recheck group"})
    return res.status(200).json(result)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?
        "Access denied":"Outcome uncertain; recheck group"})
  }
}

export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers["x-seller-id"]!==undefined||
     req.headers.authorization!==undefined)
    return res.status(403).json({message:"Access denied"})
  if(req.query.view!==undefined){
    const selected=listing.safeParse(req.query)
    if(!selected.success)return res.status(400).json({message:"Invalid input"})
    return listStoreGroups(req,res,selected.data)
  }
  const parsed=ids.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  return handle(req,res,"read",parsed.data)
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let trusted=false
  try{trusted=await csrf(req)}catch{}
  if(!trusted||req.headers["x-seller-id"]!==undefined||
     req.headers.authorization!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=write.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  return handle(req,res,parsed.data.action,parsed.data)
}
