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
