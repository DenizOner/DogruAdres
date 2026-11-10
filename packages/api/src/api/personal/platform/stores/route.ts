import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import type {Context} from "@medusajs/framework/types"
import {approveSellerWorkflow,terminateSellerWorkflow,unsuspendSellerWorkflow} from "@mercurjs/core/workflows"
import {access,csrf,enabled,sessionToken} from "../../security"
import {IdentityAccessDenied} from "../../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const approval=z.object({
  application_id:z.string().regex(/^daapp_[0-9a-f]{32}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
}).strict()
const reactivation=approval.extend({action:z.literal("unsuspend")}).strict()
const reconcile=approval.extend({action:z.literal("reconcile")}).strict()
const release=approval.extend({action:z.literal("release")}).strict()
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
    const suspended:Array<{application_id:string;seller_id:string;organization_id:string;organization_name:string;on_hold:boolean;name:string;name_review_required:boolean}>=[]
    const reconciliation:Array<{application_id:string;seller_id:string;organization_id:string;organization_name:string;name:string;on_hold:boolean}>=[]
    const release_pending:Array<{application_id:string;seller_id:string;organization_id:string;organization_name:string;name:string;on_hold:boolean}>=[]
    for(const item of candidates){
      const sellers=await native.listSellers({id:item.seller_id})
      if(sellers.length!==1||sellers[0].id!==item.seller_id)continue
      if(sellers[0].status==="pending_approval"&&!sellers[0].approved_at)
        pending.push({...item,name:String(sellers[0].name??"")})
      if(sellers[0].status==="suspended"&&sellers[0].approved_at){
        const claim=await service.personalUnresolvedStoreReactivationClaim(token,item)
        if(claim?.status==="claimed"&&claim.organization_id===item.organization_id)
          release_pending.push({...item,name:String(sellers[0].name??"")})
        else if(claim?.status==="none"){
          // A suspended Seller can keep the same ID while an exceptional,
          // reasoned name-right review is unresolved. Reuse the exact
          // authoritative entitlement guard used by POST unsuspend, rather
          // than assuming that the native Seller name grants opening rights.
          const entitlement=await service.personalCurrentSuspendedStoreName(
            token,{application_id:item.application_id,seller_id:item.seller_id})
          if(!entitlement)continue
          if(!["eligible","conflict"].includes(entitlement.status))continue
          suspended.push({...item,name:String(sellers[0].name??""),
            name_review_required:entitlement.status!=="eligible"})
        }
        // A malformed/ambiguous source claim is never presented as actionable.
      }
      if(sellers[0].status==="open"&&sellers[0].approved_at){
        const claim=await service.personalUnresolvedStoreReactivationClaim(token,item)
        if(claim?.status==="claimed"&&claim.organization_id===item.organization_id&&
           claim.name===sellers[0].name&&claim.handle===sellers[0].handle)
          reconciliation.push({...item,name:String(sellers[0].name??"")})
      }
    }
    const final=await service.personalReviewableStoreApplications(token,undefined,{},page)
    if(!final||final.length!==candidates.length||
       final.some((row,i)=>row.application_id!==candidates[i].application_id||
         row.seller_id!==candidates[i].seller_id))
      return res.status(403).json({message:"Access denied"})
    const next=page<1000?
      await service.personalReviewableStoreApplications(token,undefined,{},page+1):[]
    if(!next)return res.status(403).json({message:"Access denied"})
    return res.status(200).json({pending,suspended,reconciliation,release_pending,page,has_more:next.length>0})
  }catch{return res.status(503).json({message:"Unavailable"})}
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const action=(req.body as {action?:unknown}|null)?.action
  const rejecting=action==="reject",reopening=action==="unsuspend",reconciling=action==="reconcile",releasing=action==="release"
  const parsed=(releasing?release:reconciling?reconcile:reopening?reactivation:rejecting?rejection:approval).safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const target={application_id:parsed.data.application_id,seller_id:parsed.data.seller_id}
  const reason=rejecting?(parsed.data as unknown as {reason:string}).reason:null
  const svc=access(req),token=sessionToken(req)
  try{
    const check=await svc.personalReviewableStoreApplications(token,target)
    if(!check||check.length!==1)return res.status(403).json({message:"Access denied"})
    if(!rejecting&&!reopening&&!reconciling&&!releasing&&check[0].on_hold)
      return res.status(409).json({message:"Company Store applications are on hold"})
    const native=req.scope.resolve<{listSellers(filter:object):Promise<any[]>}>("seller")
    const before=await native.listSellers({id:target.seller_id})
    if(before.length!==1||before[0].id!==target.seller_id||
       (reopening?(before[0].status!=="suspended"||!before[0].approved_at):
        reconciling?(before[0].status!=="open"||!before[0].approved_at):
        releasing?(before[0].status!=="suspended"||!before[0].approved_at):
         (before[0].status!=="pending_approval"||before[0].approved_at)))
      return res.status(409).json({message:"Store is not eligible for this action"})
    // Two committed phases: a canonical claim/outbox is durable BEFORE the
    // separate Mercur workflow. A failure after opening can be reconciled
    // without retrying the native Seller transition.
    let claimAuditId:string|null=null
    if(reopening){
      const claim=await svc.personalWithStoreApprovalStaffLock(
        token,{...target,decision:"unsuspend" as const},async(context:Context)=>{
          const current=await svc.personalCurrentSuspendedStoreName(token,target,context)
          if(!current)return {status:"denied" as const}
          if(current.status!=="eligible")return {status:"conflict" as const}
          const staged=await svc.personalClaimStoreReactivation(token,{
            ...target,organization_id:current.organization_id,
            name:current.name,handle:current.handle
          },context)
          return staged??{status:"denied" as const}
        })
      if(!claim||claim.status==="denied")return res.status(403).json({message:"Access denied"})
      if(claim.status!=="claimed")return res.status(409).json({message:"Store decision needs review"})
      claimAuditId=claim.claim_audit_id
    }
    // Hold the live Staff grant row's SHARE lock from the final source
    // check through native Mercur approval and its verified readback.
    // Concurrent platform revoke must commit either before authorization
    // (native never called) or after approval has completed.
    const outcome=await svc.personalWithStoreApprovalStaffLock(
      token,rejecting?{...target,decision:"reject" as const}:
        reopening?{...target,decision:"unsuspend" as const}:
        reconciling?{...target,decision:"reconcile" as const}:
        releasing?{...target,decision:"release" as const}:target,async(context:Context)=>{
        const fresh=await svc.personalReviewableStoreApplications(token,target,context)
        if(!fresh||fresh.length!==1)return "denied" as const
        if(!rejecting&&!reopening&&!reconciling&&!releasing&&fresh[0].on_hold)return "conflict" as const
        const pending=await native.listSellers({id:target.seller_id})
        if(pending.length!==1||pending[0].id!==target.seller_id||
           (reopening?(pending[0].status!=="suspended"||!pending[0].approved_at):
            reconciling?(pending[0].status!=="open"||!pending[0].approved_at):
            releasing?(pending[0].status!=="suspended"||!pending[0].approved_at):
             (pending[0].status!=="pending_approval"||pending[0].approved_at)))
          return "conflict" as const
        if(reopening){
          // Both the current name and URL must still be owned by this
          // historical Store. Keep the name lock and Staff grant locked
          // through the native workflow and canonical audit readback.
          const current=await svc.personalCurrentSuspendedStoreName(token,target,context)
          if(!current)return "denied" as const
          if(current.status!=="eligible")return "conflict" as const
          const claim=await svc.personalUnresolvedStoreReactivationClaim(token,target,context)
          if(!claimAuditId||claim?.status!=="claimed"||
             claim.claim_audit_id!==claimAuditId||
             claim.organization_id!==current.organization_id||
             claim.name!==current.name||claim.handle!==current.handle)
            return "uncertain" as const
          await unsuspendSellerWorkflow(req.scope).run({input:{seller_id:target.seller_id}})
          const after=await native.listSellers({id:target.seller_id})
          if(after.length!==1||after[0].id!==target.seller_id||
             after[0].status!=="open"||!after[0].approved_at||
             after[0].name!==current.name||after[0].handle!==current.handle||
             String(after[0].approved_at)!==String(pending[0].approved_at))
            return "uncertain" as const
          const recorded=await svc.personalRecordStoreReactivation(token,{
            ...target,organization_id:current.organization_id,
            name:current.name,handle:current.handle,claim_audit_id:claimAuditId
          },context)
          return recorded?.status==="recorded"?"reactivated" as const:"uncertain" as const
        }
        if(releasing){
          // This does not retry Mercur. The shared Staff/Seller lock and
          // native Seller row check serialize a stalled first-party opener.
          const result=await svc.personalReleaseSuspendedStoreReactivationClaim(
            token,target,context)
          if(!result)return "denied" as const
          return result.status==="released"?"released" as const:"conflict" as const
        }
        if(reconciling){
          // This path is only a source-proven audit reconciliation, never
          // another call to native Mercur unsuspend.
          const current=await svc.personalCurrentSuspendedStoreName(token,{
            ...target,expected_status:"open"
          },context)
          if(!current)return "denied" as const
          if(current.status!=="eligible")return "conflict" as const
          const claim=await svc.personalUnresolvedStoreReactivationClaim(token,target,context)
          if(claim?.status!=="claimed"||
             claim.organization_id!==current.organization_id||
             claim.name!==current.name||claim.handle!==current.handle)
            return "conflict" as const
          const recorded=await svc.personalRecordStoreReactivation(token,{
            ...target,organization_id:current.organization_id,
            name:current.name,handle:current.handle,
            claim_audit_id:claim.claim_audit_id
          },context)
          return recorded?.status==="recorded"?"reconciled" as const:"uncertain" as const
        }
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
    if(outcome==="conflict")return res.status(409).json({message:"Store name or decision is no longer available"})
    if(outcome==="rejected")return res.status(200).json({...target,status:"rejected"})
    if(outcome==="reactivated")return res.status(200).json({...target,status:"open",action:"unsuspend"})
    if(outcome==="reconciled")return res.status(200).json({...target,status:"open",action:"reconcile"})
    if(outcome==="released")return res.status(200).json({...target,status:"suspended",action:"release"})
    if(outcome!=="approved")return res.status(503).json({message:"Outcome uncertain; check approval status"})
    return res.status(200).json({...target,status:"open"})
  }catch(e){
    if(e instanceof IdentityAccessDenied)return res.status(403).json({message:"Access denied"})
    return res.status(503).json({message:"Outcome uncertain; check approval status"})
  }
}
