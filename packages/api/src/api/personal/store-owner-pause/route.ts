import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const read=z.object({organization_id:org,seller_id:seller}).strict()
const change=z.object({
  organization_id:org,seller_id:seller,
  action:z.enum(["pause","resume"]),
  request_id:z.string().regex(/^dasp_[a-f0-9]{32}$/),
  expected_version:z.number().int().min(0).max(2147483646)
}).strict()

/** Person session + protected Organization Owner + canonical Store origin and
 * current native Member/Seller link are all verified inside the Foundation
 * service, on every request. A native x-seller-id header is not authority.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers["x-seller-id"]!==undefined||req.headers.authorization!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=read.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid context"})
  try{
    const result=await access(req).personalOwnerStorePauseState(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
    if(!result)return res.status(403).json({message:"Access denied"})
    return res.status(200).json(result)
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let trusted=false;try{trusted=await csrf(req)}catch{}
  if(!trusted||req.headers["x-seller-id"]!==undefined||
     req.headers.authorization!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=change.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalOwnerStorePauseChange(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict")
      return res.status(409).json({message:"Store pause version changed; reread state"})
    if(result.status!==(parsed.data.action==="pause"?"paused":"resumed"))
      return res.status(503).json({message:"Outcome uncertain; reread state"})
    return res.status(200).json({organization_id:parsed.data.organization_id,
      seller_id:parsed.data.seller_id,status:result.status,
      version:result.version,replayed:result.replayed})
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; reread state"})
  }
}
