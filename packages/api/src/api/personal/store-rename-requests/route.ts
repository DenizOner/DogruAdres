import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import {
  validStoreName, validStoreHandle, STORE_RENAME_RISK_VERSION
} from "../../../modules/dogruadres-access/store-name-policy"

export const AUTHENTICATE = false
const organization_id=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller_id=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const query=z.object({organization_id,seller_id}).strict()
const request=z.object({
  request_id:z.string().regex(/^dasrn_[a-f0-9]{32}$/),
  organization_id,seller_id,
  name:z.string().trim().refine(validStoreName),
  handle:z.string().refine(validStoreHandle),
  risk_acknowledged:z.literal(true),
  risk_version:z.literal(STORE_RENAME_RISK_VERSION)
}).strict()

const withdraw=z.object({
  action:z.literal("withdraw"),
  request_id:z.string().regex(/^dasrn_[a-f0-9]{32}$/),
  organization_id,seller_id
}).strict()

export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=query.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid context"})
  try{
    const result=await access(req).personalStoreRenameRequests(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
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
  let allowed=false;try{allowed=await csrf(req)}catch{}
  if(!allowed||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  if((req.body as {action?:unknown}|null)?.action==="withdraw"){
    const parsed=withdraw.safeParse(req.body)
    if(!parsed.success)return res.status(400).json({message:"Invalid request"})
    try{
      const result=await access(req).personalWithdrawStoreRenameRequest(
        sessionToken(req),{
          request_id:parsed.data.request_id,
          organization_id:parsed.data.organization_id,
          seller_id:parsed.data.seller_id
        })
      if(!result)return res.status(403).json({message:"Access denied"})
      if(result.status!=="withdrawn")
        return res.status(409).json({message:"Request is no longer pending"})
      if(result.request_id!==parsed.data.request_id||
         result.seller_id!==parsed.data.seller_id)
        return res.status(503).json({
          message:"Outcome uncertain; read existing requests before any retry"
        })
      return res.status(200).json({
        request_id:result.request_id,status:"withdrawn",
        seller_id:result.seller_id
      })
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":
          "Outcome uncertain; read existing requests before any retry"})
    }
  }
  const parsed=request.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid request"})
  try{
    const result=await access(req).personalRequestStoreRename(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.status==="conflict"||result.status==="unavailable")
      return res.status(409).json({message:"Store name or request unavailable"})
    if(result.status==="invalid_change")
      return res.status(400).json({message:"Name and URL must both change"})
    if(result.status!=="pending_review")
      return res.status(409).json({message:"Request status changed; read before retrying"})
    return res.status(result.replayed?200:201).json({
      request_id:result.request_id,status:"pending_review"
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":
        "Outcome uncertain; read existing requests before any retry"})
  }
}
