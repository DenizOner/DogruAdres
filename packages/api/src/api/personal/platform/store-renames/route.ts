/// <reference lib="es2022.intl" />
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { updateSellersWorkflow } from "@mercurjs/core/workflows"
import { access, csrf, enabled, sessionToken } from "../../security"
import { IdentityAccessDenied } from "../../../../modules/dogruadres-access/identity-session"

/** Review and approve through a durable B22 claim and native Mercur
 * update, without exposing native Staff/Admin credentials in the browser.
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

const approval=z.object({
  action:z.literal("approve"),
  request_id:z.string().regex(/^dasrn_[a-f0-9]{32}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
}).strict()
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
  const approving=(req.body as {action?:unknown}|null)?.action==="approve"
  const parsed=(approving?approval:rejection).safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const svc=access(req),token=sessionToken(req)
  const target={request_id:parsed.data.request_id,seller_id:parsed.data.seller_id}
  try{
    if(approving){
      // First transaction persists the name claim. Native Mercur runs only
      // once; a crash or an uncertain native result is never auto-retried.
      const claim=await svc.personalClaimStoreRenameApproval(token,target)
      if(!claim)return res.status(403).json({message:"Access denied"})
      if(claim.status!=="claimed")return res.status(409)
        .json({message:"Request or name is no longer available"})
      const native=req.scope.resolve<{
        listSellers(filters:object):Promise<Array<{
          id:string;name:string;handle:string;status:string;approved_at:unknown
        }>>
      }>("seller")
      const outcome=await svc.personalWithStoreRenameApprovalStaffLock(
        token,target,async(data,context)=>{
          const before=await native.listSellers({id:target.seller_id})
          if(before.length!==1||before[0].id!==target.seller_id||
             before[0].status!=="open"||!before[0].approved_at)
            return "uncertain" as const
          await updateSellersWorkflow(req.scope).run({
            input:{selector:{id:target.seller_id},
              update:{name:data.name,handle:data.handle}}
          })
          const after=await native.listSellers({id:target.seller_id})
          if(after.length!==1||after[0].id!==target.seller_id||
             after[0].status!=="open"||!after[0].approved_at||
             after[0].name!==data.name||after[0].handle!==data.handle)
            return "uncertain" as const
          const recorded=await svc.personalRecordStoreRenameApproval(token,target,context)
          return recorded?.status==="approved"?"approved" as const:"uncertain" as const
        })
      if(outcome!=="approved")
        return res.status(503).json({message:"Outcome uncertain; reread before retrying"})
      return res.status(200).json({...target,status:"approved"})
    }
    const result=await svc.personalRejectStoreRenameRequest(
      token,parsed.data as {request_id:string;seller_id:string;reason:string})
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
