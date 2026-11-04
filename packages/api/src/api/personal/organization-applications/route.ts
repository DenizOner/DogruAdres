import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import { draftPayload, withdrawDraftPayload, decodeOrganizationDraftCursor } from "../../../modules/dogruadres-access/organization-application"

export const AUTHENTICATE=false
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const query=req.query??{}
  if(Object.keys(query).some(key=>key!=="cursor")||req.headers.authorization)
    return res.status(400).json({message:"Invalid request"})
  const cursor=query.cursor===undefined?undefined:decodeOrganizationDraftCursor(query.cursor)
  if(cursor===null)
    return res.status(400).json({message:"Invalid request"})
  try{
    const page=await access(req).personalOrganizationApplicationDrafts(sessionToken(req),cursor)
    return page?res.status(200).json(page):
      res.status(403).json({message:"Access denied"})
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let allowed=false
  try{allowed=await csrf(req)}catch{}
  if(!allowed||req.headers.authorization)return res.status(403).json({message:"Access denied"})
  if(Object.keys(req.query??{}).length)return res.status(400).json({message:"Invalid request"})
  if((req.body as {action?:unknown}|undefined)?.action==="withdraw"){
    const parsedWithdraw=withdrawDraftPayload.safeParse(req.body)
    if(!parsedWithdraw.success)return res.status(400).json({message:"Invalid request"})
    try{
      const result=await access(req).personalWithdrawOrganizationApplicationDraft(
        sessionToken(req),parsedWithdraw.data)
      if(!result)return res.status(403).json({message:"Access denied"})
      if(result.conflict)return res.status(409).json({message:"Draft changed; read the current version"})
      return res.status(200).json({application_id:result.application_id,
        status:"withdrawn",version:result.version})
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":"Outcome uncertain; read drafts"})
    }
  }
  const parsed=draftPayload.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid draft"})
  try{
    const result=await access(req).personalSaveOrganizationApplicationDraft(
      sessionToken(req),parsed.data)
    if(!result)return res.status(403).json({message:"Access denied"})
    if(result.conflict)return res.status(409).json({message:"Draft changed; read the current version"})
    return res.status(parsed.data.expected_version===0?201:200)
      .json({application_id:result.application_id,status:"draft",version:result.version})
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503)
      .json({message:error instanceof IdentityAccessDenied?"Access denied":"Outcome uncertain; read drafts"})
  }
}
