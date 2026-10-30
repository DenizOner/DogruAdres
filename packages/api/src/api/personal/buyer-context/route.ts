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
  const parsed=z.object({organization_id:org}).strict().safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const svc=access(req),token=sessionToken(req)
  try{
    const checked=await svc.personalBuyerOrganization(token,parsed.data.organization_id)
    if(!checked||checked.organization_id!==parsed.data.organization_id||
       typeof checked.person_id!=="string"||
       !/^daprs_[A-Za-z0-9_-]+$/.test(checked.person_id))
      return res.status(403).json({message:"Access denied"})
    // A second live read before returning avoids advertising revoked access
    // across a remote query boundary. It is NOT a cross-module checkout lock.
    const current=await svc.personalBuyerOrganization(token,parsed.data.organization_id)
    if(!current||current.person_id!==checked.person_id||
       current.organization_id!==checked.organization_id)
      return res.status(403).json({message:"Access denied"})
    return res.status(200).json({
      organization_id:checked.organization_id,
      status:"buyer_permission_verified",
      checkout_ready:false
    })
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}
