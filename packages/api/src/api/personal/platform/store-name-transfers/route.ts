import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../../security"
import { IdentityAccessDenied } from "../../../../modules/dogruadres-access/identity-session"
import { validStoreName, validStoreHandle } from "../../../../modules/dogruadres-access/store-name-policy"

/** Platform Staff decision: RIGHT assignment only, no native Seller update. */
export const AUTHENTICATE=false
const payload=z.object({
  transfer_id:z.string().regex(/^dastr_[a-f0-9]{32}$/),
  source_application_id:z.string().regex(/^daapp_[a-f0-9]{32}$/),
  source_seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/),
  target_application_id:z.string().regex(/^daapp_[a-f0-9]{32}$/),
  target_seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/),
  expected_name:z.string().refine(validStoreName),
  expected_handle:z.string().refine(validStoreHandle),
  reason:z.string().trim().min(10).max(500).refine(
    value=>[...value.matchAll(/[\p{L}\p{N}]/gu)].length>=10)
}).strict()

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=payload.safeParse(req.body)
  if(parsed.success&&parsed.data.source_seller_id===parsed.data.target_seller_id)
    return res.status(400).json({message:"Invalid decision"})
  if(!parsed.success)return res.status(400).json({message:"Invalid decision"})
  try{
    const result=await access(req).personalAssignSuspendedStoreNameRight(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status!=="assigned")
      return res.status(409).json({message:"Name right unavailable"})
    return res.status(result.replayed?200:201).json({
      transfer_id:parsed.data.transfer_id,status:"assigned",
      native_status:"suspended",awaiting_source_rename:true
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":
        "Decision uncertain; reread audited state before retrying"})
  }
}
