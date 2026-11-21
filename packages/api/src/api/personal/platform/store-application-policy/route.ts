import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../../security"
import { IdentityAccessDenied } from "../../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false

const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const query=z.object({organization_id:org}).strict()
const change=z.object({
  organization_id:org,
  expected_enabled:z.boolean(),
  expected_version:z.number().int().min(0).max(2147483646),
  enabled:z.boolean(),
  reason:z.string().trim().min(10).max(500)
}).strict().refine(x=>x.expected_enabled!==x.enabled)

export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=query.safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid input"})
  try{
    const record=await access(req).personalPlatformStoreApplicationRight(
      sessionToken(req),parsed.data.organization_id)
    return record?res.status(200).json(record):
      res.status(403).json({message:"Access denied"})
  }catch{return res.status(503).json({message:"Unavailable"})}
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=change.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const outcome=await access(req).personalSetStoreApplicationRight(
      sessionToken(req),parsed.data)
    if(!outcome)return res.status(403).json({message:"Access denied"})
    if(outcome.status==="conflict")
      return res.status(409).json({message:"Changed by another operator; reload"})
    return res.status(200).json(outcome)
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?
        "Access denied":"Outcome uncertain; reload before retrying"})
  }
}
