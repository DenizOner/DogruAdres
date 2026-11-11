import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const body=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict()

/** Browser GET, image prefetch and third-party scanners cannot acknowledge
 * this link. A fresh strong first-party Owner session, CSRF and a task-owned
 * single-use-style random token digest are all required on POST.
 */
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=body.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const proof=await access(req).personalPlatformStoreClosingEmailLinkVisit(
      sessionToken(req),parsed.data.token)
    if(!proof)return res.status(403).json({message:"Access denied"})
    return res.status(200).json(proof)
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?
        "Access denied":"Outcome uncertain; check your secure workspace"
    })
  }
}
