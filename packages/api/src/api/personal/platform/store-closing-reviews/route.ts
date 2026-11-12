import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../../security"
import {IdentityAccessDenied} from "../../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const pageSchema=z.object({page:z.coerce.number().int().min(0).max(1000).optional()}).strict()
const decisionSchema=z.object({
  organization_id:org,seller_id:seller,
  source_request_id:z.string().regex(/^(dapa_|dasfr_)[a-f0-9]{32}$/),
  request_id:z.string().regex(/^dasdr_[a-f0-9]{32}$/),
  decision:z.enum(["accepted","rejected"]),
  reason:z.string().trim().min(10).max(500)
}).strict()

/** Dedicated Staff review grant, never implied by store.closing.manage. */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers.authorization!==undefined||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=pageSchema.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const rows=await access(req).personalReviewablePlatformClosingAppeals(
      sessionToken(req),parsed.data.page??0)
    if(!rows)return res.status(403).json({message:"Access denied"})
    return res.status(200).json(rows)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
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
  const parsed=decisionSchema.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalDecidePlatformClosingAppeal(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict")
      return res.status(409).json({message:"Review case changed; reread"})
    if(result.status!=="decided")
      return res.status(503).json({message:"Outcome uncertain; reread"})
    return res.status(200).json({
      ...result,organization_id:parsed.data.organization_id,
      seller_id:parsed.data.seller_id,source_request_id:parsed.data.source_request_id,
      permanent_finalization_enabled:false,store_reopened:false
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; reread"})
  }
}
