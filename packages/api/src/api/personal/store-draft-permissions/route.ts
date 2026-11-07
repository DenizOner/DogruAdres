import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const payload=z.object({
  action:z.enum(["grant","revoke"]),organization_id:org,
  membership_id:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
}).strict()

export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const input=z.object({organization_id:org}).strict().safeParse(req.query)
  if(!input.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  try{
    const list=await access(req).personalListStoreDraftPermissions(
      sessionToken(req),input.data.organization_id)
    return list?res.status(200).json(list):
      res.status(403).json({message:"Access denied"})
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let ok=false;try{ok=await csrf(req)}catch{}
  if(!ok||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const input=payload.safeParse(req.body)
  if(!input.success)return res.status(400).json({message:"Invalid input"})
  try{
    const result=await access(req).personalChangeStoreDraftPermission(
      sessionToken(req),input.data)
    return result?res.status(200).json(result):
      res.status(403).json({message:"Access denied"})
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Outcome uncertain; read permissions"})
  }
}
