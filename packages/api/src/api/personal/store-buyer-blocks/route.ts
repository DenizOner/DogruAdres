import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const input=z.object({
  action:z.enum(["block","unblock"]),
  organization_id:org,seller_id:seller,buyer_organization_id:org
}).strict()

/** Owner-only Store policy, not an employee permission grant. The browser
 * never receives a native Mercur JWT and cannot forge x-seller-id context.
 */
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let trusted=false;try{trusted=await csrf(req)}catch{}
  if(!trusted||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=input.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const svc=access(req),token=sessionToken(req)
  try{
    // Native membership is necessary but NEVER proves Foundation Owner status
    // or Organization→Store origin. The service checks both independently.
    const binding=await svc.personalActorBinding(token,"member")
    if(!binding||binding.revoked_at||typeof binding.person_id!=="string"||
       typeof binding.actor_id!=="string")return res.status(403).json({message:"Access denied"})
    const native=req.scope.resolve<{
      listSellerMembers(f:object):Promise<any[]>
      listMembers(f:object):Promise<any[]>
      listSellers(f:object):Promise<any[]>
    }>("seller")
    const live=async()=>{
      const [members,membership,stores]=await Promise.all([
        native.listMembers({id:binding.actor_id,is_active:true}),
        native.listSellerMembers({seller_id:parsed.data.seller_id,member_id:binding.actor_id}),
        native.listSellers({id:parsed.data.seller_id})
      ])
      return members.length===1&&members[0].id===binding.actor_id&&
        members[0].is_active===true&&membership.length===1&&
        membership[0].seller_id===parsed.data.seller_id&&
        membership[0].member_id===binding.actor_id&&stores.length===1&&
        stores[0].id===parsed.data.seller_id&&
        (parsed.data.action==="unblock"||
          (stores[0].status==="open"&&!!stores[0].approved_at))
    }
    if(!await live())return res.status(403).json({message:"Access denied"})
    const result=await svc.personalChangeStoreBuyerBlock(token,parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    // A native revocation after Foundation commit cannot be rolled back
    // here; the observed outcome must remain explicitly uncertain.
    if(!await live())return res.status(503).json({message:"Outcome uncertain; recheck block"})
    return res.status(200).json(result)
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; recheck block"})
  }
}
