import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const read=z.object({organization_id:org,seller_id:seller}).strict()
const change=z.object({
  organization_id:org,seller_id:seller,
  action:z.enum(["start","withdraw"]),
  request_id:z.string().regex(/^dasc_[a-f0-9]{32}$/),
  expected_version:z.number().int().min(0).max(2147483646),
  consequences_acknowledged:z.literal(true)
}).strict()

/** Strict first-party private ingress. Never delegate to a caller-controlled
 * Seller actor or accept a browser-supplied Organization authorization claim.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers.authorization!==undefined||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=read.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid context"})
  try{
    const result=await access(req).personalOwnerClosingState(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
    if(!result)return res.status(403).json({message:"Access denied"})
    return res.status(200).json(result)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let trusted=false;try{trusted=await csrf(req)}catch{}
  if(!trusted||req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=change.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalOwnerClosingChange(sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict")
      return res.status(409).json({message:"Closing state changed; reread before retry"})
    if(result.status!==(parsed.data.action==="start"?"closing":"withdrawn"))
      return res.status(503).json({message:"Outcome uncertain; reread state"})
    return res.status(200).json({organization_id:parsed.data.organization_id,
      seller_id:parsed.data.seller_id,status:result.status,
      version:result.version,due_at:result.due_at,replayed:result.replayed})
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; reread state"})
  }
}
