import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../../security"
import {IdentityAccessDenied} from "../../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const id=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const search=z.object({page:z.coerce.number().int().min(0).max(1000).optional()}).strict()
const start=z.object({
  organization_id:org,seller_id:id,
  request_id:z.string().regex(/^dascp_[a-f0-9]{32}$/),
  reason:z.string().trim().min(10).max(500)
}).strict()

/** A dedicated strong platform Staff grant, never store.approve by implication. */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers.authorization!==undefined||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=search.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const candidates=await access(req).personalReviewablePlatformStoreClosings(
      sessionToken(req),parsed.data.page??0)
    if(!candidates)return res.status(403).json({message:"Access denied"})
    const next=await access(req).personalReviewablePlatformStoreClosings(
      sessionToken(req),(parsed.data.page??0)+1)
    if(!next)return res.status(403).json({message:"Access denied"})
    return res.status(200).json({
      candidates,page:parsed.data.page??0,has_more:next.length>0
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"
    })
  }
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let verified=false;try{verified=await csrf(req)}catch{}
  if(!verified||req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=start.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalStartPlatformStoreClosing(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict")
      return res.status(409).json({message:"Closing has already been initiated"})
    if(!["notification_unverified","appealed"].includes(result.status))
      return res.status(503).json({message:"Outcome uncertain; reread before retry"})
    return res.status(200).json({...result,
      organization_id:parsed.data.organization_id,seller_id:parsed.data.seller_id,
      mandatory_email_verified:false,deadline_started:false})
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; reread before retry"
    })
  }
}
