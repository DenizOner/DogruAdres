import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import type {Context} from "@medusajs/framework/types"
import {approveSellerWorkflow,terminateSellerWorkflow} from "@mercurjs/core/workflows"
import {access,csrf,enabled,sessionToken} from "../../security"
import {IdentityAccessDenied} from "../../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const approval=z.object({
  application_id:z.string().regex(/^daapp_[0-9a-f]{32}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
}).strict()
const rejection=approval.extend({
  action:z.literal("reject"),
  reason:z.string().trim().min(10).max(500)
}).strict()

/** Platform staff sees ONLY Owner-origin candidates; no SellerMember or
 * native User role implies approval authority. Native lifecycle stays Mercur's.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=z.object({page:z.coerce.number().int().min(0).max(1000).optional()}).strict().safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid input"})
  const page=parsed.data.page??0,service=access(req),token=sessionToken(req)
  try{
    const candidates=await service.personalReviewableStoreApplications(token,undefined,{},page)
    if(!candidates)return res.status(403).json({message:"Access denied"})
    const native=req.scope.resolve<{listSellers(filter:object):Promise<any[]>}>("seller")
    const pending:Array<{application_id:string;seller_id:string;organization_id:string;organization_name:string;name:string;on_hold:boolean}>=[]
    for(const item of candidates){
      const sellers=await native.listSellers({id:item.seller_id})
      if(sellers.length!==1||sellers[0].id!==item.seller_id)continue
      if(sellers[0].status==="pending_approval"&&!sellers[0].approved_at)
        pending.push({...item,name:String(sellers[0].name??"")})
    }
    const final=await service.personalReviewableStoreApplications(token,undefined,{},page)
    if(!final||final.length!==candidates.length||
       final.some((row,i)=>row.application_id!==candidates[i].application_id||
         row.seller_id!==candidates[i].seller_id))
      return res.status(403).json({message:"Access denied"})
    const next=page<1000?
      await service.personalReviewableStoreApplications(token,undefined,{},page+1):[]
    if(!next)return res.status(403).json({message:"Access denied"})
    return res.status(200).json({pending,page,has_more:next.length>0})
  }catch{return res.status(503).json({message:"Unavailable"})}
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const rejecting=(req.body as {action?:unknown}|null)?.action==="reject"
  const parsed=(rejecting?rejection:approval).safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const target={application_id:parsed.data.application_id,seller_id:parsed.data.seller_id}
  const reason=rejecting?(parsed.data as {reason:string}).reason:null
  const svc=access(req),token=sessionToken(req)
  try{
    const check=await svc.personalReviewableStoreApplications(token,target)
    if(!check||check.length!==1)return res.status(403).json({message:"Access denied"})
    if(!rejecting&&check[0].on_hold)
      return res.status(409).json({message:"Company Store applications are on hold"})
    const native=req.scope.resolve<{listSellers(filter:object):Promise<any[]>}>("seller")
    const before=await native.listSellers({id:target.seller_id})
    if(before.length!==1||before[0].id!==target.seller_id||
       before[0].status!=="pending_approval"||before[0].approved_at)
      return res.status(409).json({message:"Store is not pending approval"})
    // Hold the live Staff grant row's SHARE lock from the final source
    // check through native Mercur approval and its verified readback.
    // Concurrent platform revoke must commit either before authorization
    // (native never called) or after approval has completed.
    const outcome=await svc.personalWithStoreApprovalStaffLock(
      token,rejecting?{...target,decision:"reject" as const}:target,async(context:Context)=>{
        const fresh=await svc.personalReviewableStoreApplications(token,target,context)
        if(!fresh||fresh.length!==1)return "denied" as const
        if(!rejecting&&fresh[0].on_hold)return "conflict" as const
        const pending=await native.listSellers({id:target.seller_id})
        if(pending.length!==1||pending[0].id!==target.seller_id||
           pending[0].status!=="pending_approval"||pending[0].approved_at)
          return "conflict" as const
        if(rejecting&&reason!==null){
          // Mercur 2.4.1's native TERMINATED lifecycle is the final
          // outcome for a PENDING, separately rejected Seller application.
          // An already open Store can never enter this branch.
          await terminateSellerWorkflow(req.scope).run({
            input:{seller_id:target.seller_id,reason}
          })
          const after=await native.listSellers({id:target.seller_id})
          if(after.length!==1||after[0].id!==target.seller_id||
             after[0].status!=="terminated"||after[0].approved_at||
             after[0].status_reason!==reason)return "uncertain" as const
          const recorded=await svc.personalRecordStoreApplicationRejection(
            token,{...target,reason},context)
          if(!recorded||recorded.status!=="rejected")return "uncertain" as const
          return "rejected" as const
        }
        await approveSellerWorkflow(req.scope).run({input:{seller_id:target.seller_id}})
        const after=await native.listSellers({id:target.seller_id})
        const final=await svc.personalReviewableStoreApplications(token,target,context)
        if(after.length!==1||after[0].id!==target.seller_id||
           after[0].status!=="open"||!after[0].approved_at||
           !final||final.length!==1)return "uncertain" as const
        return "approved" as const
      })
    if(!outcome||outcome==="denied")return res.status(403).json({message:"Access denied"})
    if(outcome==="conflict")return res.status(409).json({message:"Store is not pending approval"})
    if(outcome==="rejected")return res.status(200).json({...target,status:"rejected"})
    if(outcome!=="approved")return res.status(503).json({message:"Outcome uncertain; check approval status"})
    return res.status(200).json({...target,status:"open"})
  }catch(e){
    if(e instanceof IdentityAccessDenied)return res.status(403).json({message:"Access denied"})
    return res.status(503).json({message:"Outcome uncertain; check approval status"})
  }
}
