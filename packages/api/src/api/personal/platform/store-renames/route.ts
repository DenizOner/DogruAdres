/// <reference lib="es2022.intl" />
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../../security"
import { IdentityAccessDenied } from "../../../../modules/dogruadres-access/identity-session"

/** The staff queue is private, server-validated and read-only. It does not
 * approve or change Seller.name/handle or release a name for reuse.
 */
export const AUTHENTICATE = false
const query=z.object({page:z.coerce.number().int().min(0).max(1000).optional()}).strict()
const countReadableGraphemes=(reason:string)=>{
  const readable=/[\p{L}\p{N}\p{Extended_Pictographic}]/u
  const ignorable=/\p{Default_Ignorable_Code_Point}/gu
  let count=0
  for(const {segment} of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(reason)){
    if(readable.test(segment.replace(ignorable,"")))count++
  }
  return count
}

const rejection=z.object({
  action:z.literal("reject"),
  request_id:z.string().regex(/^dasrn_[a-f0-9]{32}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/),
  reason:z.string().trim().min(10).max(500).refine(
    value=>countReadableGraphemes(value)>=10,
    "Reason must contain at least 10 readable characters")
}).strict()

export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=query.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid context"})
  try{
    const result=await access(req).personalReviewableStoreRenameRequests(
      sessionToken(req),parsed.data.page??0)
    if(!result)return res.status(403).json({message:"Access denied"})
    return res.status(200).json(result)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=rejection.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalRejectStoreRenameRequest(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict")
      return res.status(409).json({message:"Request is no longer pending"})
    if(result.status!=="rejected")
      return res.status(503).json({message:"Outcome uncertain; reread before retrying"})
    return res.status(200).json(result)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; reread before retrying"})
  }
}
