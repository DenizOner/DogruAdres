import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,enabled,sessionToken} from "../../security"
import {IdentityAccessDenied} from "../../../../modules/dogruadres-access/identity-session"
import {verifiedEmailForActorContext} from "../../../dogruadres/invitations/accept/route"

export const AUTHENTICATE=false
const query=z.object({
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
}).strict()

/** Task-authorized Staff sees only aggregate readiness; NEVER Owner email,
 * notification contents, private reasons, or an imaginary delivery success.
 * SMTP acceptance would not constitute mailbox delivery or start a timer.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const parsed=query.safeParse(req.query)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  try{
    const owners=await access(req).personalPlatformStoreClosingEmailAudience(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
    if(!owners)return res.status(403).json({message:"Access denied"})
    const grouped=new Map<string,typeof owners>()
    for(const owner of owners){
      const group=grouped.get(owner.person_id)??[]
      group.push(owner)
      grouped.set(owner.person_id,group)
    }
    let verified=0,receipt=0,ambiguous=0
    for(const group of grouped.values()){
      if(group.some(o=>o.receipt_id!==null))receipt++
      if(group.length!==1||!group[0].auth_identity_id||
         !group[0].actor_id||!["user","member","customer"].includes(
           group[0].actor_type??"")){
        ambiguous++
        continue
      }
      const owner=group[0]
      const nativeEmail=await verifiedEmailForActorContext(req,{
        actor_type:owner.actor_type!,actor_id:owner.actor_id!,
        auth_identity_id:owner.auth_identity_id!,
        auth_provider:"emailpass",user_metadata:{}
      })
      if(nativeEmail)verified++
    }
    const progress=await access(req).personalPlatformStoreClosingEmailProgress(
      sessionToken(req),parsed.data.organization_id,parsed.data.seller_id)
    if(!progress)return res.status(403).json({message:"Access denied"})
    const transport=await access(req).getActiveSmtpConfig()
    return res.status(200).json({
      organization_id:parsed.data.organization_id,
      seller_id:parsed.data.seller_id,
      status:progress.deadline_started_at?"clock_started":"not_ready",
      protected_owner_count:grouped.size,
      private_receipt_count:receipt,
      verified_email_identity_count:verified,
      unresolved_identity_count:ambiguous,
      smtp_transport_enabled:transport?.enabled===true,
      smtp_accepted_count:progress.owners.filter(o=>o.status==="accepted").length,
      mailbox_delivery_verified_count:progress.delivery_verified_count,
      mandatory_email_verified:progress.deadline_basis==="owner_delivery",
      deadline_started:!!progress.deadline_started_at,
      deadline_started_at:progress.deadline_started_at,
      deadline_basis:progress.deadline_basis,
      admin_alert_at:progress.admin_alert_at,
      email_statuses:progress.owners,
      permanent_finalization_enabled:false
    })
  }catch(error){
    return res.status(error instanceof IdentityAccessDenied?403:503).json({
      message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"
    })
  }
}
