import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import { InvalidTaxCertificate } from "../../../modules/dogruadres-access/tax-certificate-policy"
import {
  draftPayload,
  withdrawDraftPayload,
  uploadDocumentPayload,
  submitApplicationPayload,
  decodeOrganizationDraftCursor
} from "../../../modules/dogruadres-access/organization-application"

export const AUTHENTICATE=false
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const query=req.query??{}
  if(req.headers.authorization)
    return res.status(400).json({message:"Invalid request"})

  // Document download request: ?action=document&application_id=...
  if(query.action==="document"){
    if(Object.keys(query).some(key=>!["action","application_id"].includes(key)))
      return res.status(400).json({message:"Invalid request"})
    const appId=typeof query.application_id==="string"?query.application_id:""
    if(!/^daorgapp_[0-9a-f]{32}$/.test(appId))
      return res.status(400).json({message:"Invalid request"})
    try{
      const doc=await access(req).personalReadOrganizationApplicationDocument(
        sessionToken(req),appId
      )
      if(!doc)return res.status(403).json({message:"Access denied"})
      res.setHeader("Content-Type",doc.mimeType)
      res.setHeader("Content-Disposition",`attachment; filename="${doc.filename}"`)
      res.setHeader("X-Content-Type-Options","nosniff")
      return res.status(200).send(doc.content)
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
    }
  }

  // Admin submitted queue request: ?action=review_queue
  if(query.action==="review_queue"){
    if(Object.keys(query).some(key=>!["action","cursor"].includes(key)))
      return res.status(400).json({message:"Invalid request"})
    const cursor=query.cursor===undefined?undefined:decodeOrganizationDraftCursor(query.cursor)
    if(cursor===null)
      return res.status(400).json({message:"Invalid request"})
    try{
      const page=await access(req).personalSubmittedOrganizationApplications(sessionToken(req),cursor)
      return page?res.status(200).json(page):
        res.status(403).json({message:"Access denied"})
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
    }
  }

  if(Object.keys(query).some(key=>key!=="cursor"))
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

  const action=(req.body as {action?:unknown}|undefined)?.action

  if(action==="withdraw"){
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

  if(action==="upload_document"){
    const cl=req.headers["content-length"]
    if(cl && Number(cl)>15*1024*1024)
      return res.status(413).json({message:"Payload too large"})
    const parsedUpload=uploadDocumentPayload.safeParse(req.body)
    if(!parsedUpload.success)return res.status(400).json({message:"Invalid document upload"})
    try{
      const result=await access(req).personalSaveOrganizationApplicationDocument(
        sessionToken(req),parsedUpload.data)
      if(!result)return res.status(403).json({message:"Access denied"})
      if(result.conflict)return res.status(409).json({message:"Draft changed; read the current version"})
      return res.status(200).json(result)
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:error instanceof InvalidTaxCertificate?400:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":error instanceof InvalidTaxCertificate?"Invalid tax certificate":"Outcome uncertain; read drafts"})
    }
  }

  if(action==="submit"){
    const parsedSubmit=submitApplicationPayload.safeParse(req.body)
    if(!parsedSubmit.success)return res.status(400).json({message:"Invalid submit request"})
    try{
      const result=await access(req).personalSubmitOrganizationApplication(
        sessionToken(req),parsedSubmit.data)
      if(!result)return res.status(403).json({message:"Access denied"})
      if(result.conflict)return res.status(409).json({message:"Draft changed; read the current version"})
      if(result.missing_tax_identifier)return res.status(400).json({message:"Tax identifier (VKN/TCKN) required before submission"})
      if(result.missing_document)return res.status(400).json({message:"Tax certificate required before submission"})
      return res.status(200).json({application_id:result.application_id,status:"submitted",version:result.version})
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
