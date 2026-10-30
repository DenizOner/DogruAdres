import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const request=z.object({
  action:z.enum(["grant","revoke"]),
  organization_id:org,
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/),
  membership_id:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
}).strict()
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=z.object({organization_id:org}).strict().safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  try{
    const grants=await access(req).personalListStoreProductPermissions(
      sessionToken(req),parsed.data.organization_id)
    return grants?res.status(200).json({grants}):
      res.status(403).json({message:"Access denied"})
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let originOk=false;try{originOk=await csrf(req)}catch{}
  if(!originOk||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=request.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const data=parsed.data
  const svc=access(req),token=sessionToken(req)
  try{
    if(data.action==="grant"){
      // Platform approval is independent of Foundation Organization assignment.
      // The native module is never asked to authorize on behalf of a Person.
      const native=req.scope.resolve<{listSellers(f:object):Promise<any[]>}>("seller")
      const before=await native.listSellers({id:data.seller_id})
      if(before.length!==1||before[0].id!==data.seller_id||
        before[0].status!=="open"||!before[0].approved_at)
        return res.status(403).json({message:"Access denied"})
    }
    const decision=await svc.personalChangeStoreProductPermission(token,data)
    if(!decision)return res.status(403).json({message:"Access denied"})
    // Live native Store lifecycle can change between module reads. The grant
    // is still unusable by product writers unless THEY revalidate it.
    return res.status(200).json(decision)
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}
