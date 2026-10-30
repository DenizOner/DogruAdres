import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
/** Read-only, live Organization candidate selection. This is never a native
 * Customer login, checkout token, cart authorization or persisted buyer grant.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=z.object({organization_id:org,customer:z.literal("verified").optional()}).strict().safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
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
    }
    return res.status(200).json({
      organization_id:checked.organization_id,
      status:customerActorId?"buyer_customer_verified":"buyer_permission_verified",
      checkout_ready:false
    })
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}
