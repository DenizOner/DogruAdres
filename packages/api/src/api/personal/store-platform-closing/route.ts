import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const read=z.object({organization_id:org,seller_id:seller}).strict()
const appeal=read.extend({
  request_id:z.string().regex(/^dapa_[a-f0-9]{32}$/),
  expected_version:z.literal(1),reason:z.string().trim().min(10).max(500)
}).strict()

/** Only the current protected Owner of this legal Organization sees the reason.
 * No email-delivery, countdown or irreversible closure is claimed.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers.authorization!==undefined||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=read.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalPlatformStoreClosingState(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
    if(!result)return res.status(403).json({message:"Access denied"})
    return res.status(200).json(result)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"
    })
  }
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=appeal.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalAppealPlatformStoreClosing(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict")
      return res.status(409).json({message:"Closing status changed; reread"})
    if(result.status!=="appealed")
      return res.status(503).json({message:"Outcome uncertain; reread"})
    const current=await access(req).personalPlatformStoreClosingState(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
    if(!current)return res.status(503).json({message:"Outcome uncertain; reread"})
    return res.status(200).json({...result,
      organization_id:parsed.data.organization_id,seller_id:parsed.data.seller_id,
      deadline_started:current.deadline_started,
      deadline_started_at:current.deadline_started_at,
      permanent_finalization_enabled:false})
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; reread"
    })
  }
}
