import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {approveSellerWorkflow} from "@mercurjs/core/workflows"
import {access,csrf,enabled,sessionToken} from "../../security"
import {IdentityAccessDenied} from "../../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const paging=z.object({before:z.string().regex(/^daapp_[0-9a-f]{32}$/).optional()}).strict()
const approval=z.object({
  application_id:z.string().regex(/^daapp_[0-9a-f]{32}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
}).strict()

/** Platform staff sees ONLY Owner-origin candidates; no SellerMember or
 * native User role implies approval authority. Native lifecycle stays Mercur's.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const query=paging.safeParse(req.query)
  if(!query.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid input"})
  const service=access(req),token=sessionToken(req)
  const page=query.data.before?{before:query.data.before}:undefined
  try{
    const result=await service.personalReviewableStoreApplications(token,page)
    if(!result)return res.status(403).json({message:"Access denied"})
    const candidates=result.applications
    const native=req.scope.resolve<{listSellers(filter:object):Promise<any[]>}>("seller")
    const pending:Array<{application_id:string;seller_id:string;organization_id:string;organization_name:string;name:string}>=[]
    for(const item of candidates){
      const sellers=await native.listSellers({id:item.seller_id})
      if(sellers.length!==1||sellers[0].id!==item.seller_id)continue
      if(sellers[0].status==="pending_approval"&&!sellers[0].approved_at)
        pending.push({...item,name:String(sellers[0].name??"")})
    }
    const final=await service.personalReviewableStoreApplications(token,page)
    if(!final||final.next_before!==result.next_before||
       final.applications.length!==candidates.length||
       final.applications.some((row,i)=>row.application_id!==candidates[i].application_id||
         row.seller_id!==candidates[i].seller_id))
      return res.status(403).json({message:"Access denied"})
    return res.status(200).json({pending,next_before:result.next_before})
  }catch{return res.status(503).json({message:"Unavailable"})}
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=approval.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const svc=access(req),token=sessionToken(req)
  try{
    const check=await svc.personalReviewableStoreApplications(token,parsed.data)
    if(!check||check.applications.length!==1)return res.status(403).json({message:"Access denied"})
    const native=req.scope.resolve<{listSellers(filter:object):Promise<any[]>}>("seller")
    const before=await native.listSellers({id:parsed.data.seller_id})
    if(before.length!==1||before[0].id!==parsed.data.seller_id||
       before[0].status!=="pending_approval"||before[0].approved_at)
      return res.status(409).json({message:"Store is not pending approval"})
    // Verify the exact same task and origin immediately before the native
    // workflow. This is bounded revalidation, NOT cross-module atomicity.
    const fresh=await svc.personalReviewableStoreApplications(token,parsed.data)
    if(!fresh||fresh.applications.length!==1)return res.status(403).json({message:"Access denied"})
    await approveSellerWorkflow(req.scope).run({input:{seller_id:parsed.data.seller_id}})
    const after=await native.listSellers({id:parsed.data.seller_id})
    const final=await svc.personalReviewableStoreApplications(token,parsed.data)
    if(after.length!==1||after[0].id!==parsed.data.seller_id||
      after[0].status!=="open"||!after[0].approved_at||
      !final||final.applications.length!==1)
      return res.status(503).json({message:"Outcome uncertain; check approval status"})
    return res.status(200).json({...parsed.data,status:"open"})
  }catch(e){
    if(e instanceof IdentityAccessDenied)return res.status(403).json({message:"Access denied"})
    return res.status(503).json({message:"Outcome uncertain; check approval status"})
  }
}
