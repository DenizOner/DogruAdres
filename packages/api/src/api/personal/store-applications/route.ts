import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import type {Context} from "@medusajs/framework/types"
import {createSellerAccountWorkflow} from "@mercurjs/core/workflows"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"
import {storeDraftPayload} from "../../../modules/dogruadres-access/store-application-draft"
import type {StoreRequest} from "../../../modules/dogruadres-access/store-application"
import {validStoreName} from "../../../modules/dogruadres-access/store-name-policy"

export const AUTHENTICATE=false
// Store display-name contract is separate from a legal Organization title.
// Human evaluation of misleading brands/generic categories remains an Admin
// review decision; automatic checks here cover only objective invalid forms.

const payload=z.object({
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  application_id:z.string().regex(/^daapp_[0-9a-f]{32}$/),
  name:z.string().trim().refine(validStoreName),
  email:z.string().email().max(254),
  currency_code:z.string().regex(/^[a-z]{3}$/),
}).strict()
const query=z.object({organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)}).strict()
const draftSubmission=z.object({
  action:z.literal("submit_draft"),
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  draft_id:z.string().regex(/^dasdraft_[0-9a-f]{32}$/),
  expected_version:z.number().int().min(1).max(2147483647),
  application_id:z.string().regex(/^daapp_[0-9a-f]{32}$/)
}).strict()
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=query.safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  try{
    const result=await access(req).personalStoreApplications(sessionToken(req),parsed.data.organization_id)
    if(!result)return res.status(403).json({message:"Access denied"})
    // Official applications are visible only to the current protected Owner,
    // never to a delegated draft Member. Native Seller is the ONLY status
    // authority; a DoğruAdres created-application row is not approval.
    const native=req.scope.resolve<{listSellers(filter:object):Promise<any[]>}>("seller")
    const applications:Array<(typeof result.applications)[number]&{seller_status:string;rejection_reason:string|null}>=[]
    for(const entry of result.applications){
      // Never serialize the internal ownership proof to a browser response.
      const {live_seller_authorized,...app}=entry
      let seller_status="unknown",rejection_reason:null|string=null
      if(app.status==="created"&&app.seller_id&&live_seller_authorized===true){
        const sellers=await native.listSellers({id:app.seller_id})
        if(sellers.length===1&&sellers[0].id===app.seller_id){
          const value=sellers[0].status
          if(["pending_approval","open","suspended","terminated"].includes(value))
            seller_status=value
          if(value==="terminated"&&typeof sellers[0].status_reason==="string"&&
             sellers[0].status_reason.length>=10&&
             sellers[0].status_reason.length<=500)
            rejection_reason=sellers[0].status_reason
        }
      }
      applications.push({...app,seller_status,rejection_reason})
    }
    return res.status(200).json({...result,applications})
  }catch{return res.status(503).json({message:"Unavailable"})}
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let validCsrf=false;try{validCsrf=await csrf(req)}catch{}
  if(!validCsrf||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  if((req.body as {action?:unknown}|null)?.action==="save_draft"){
    const draft=storeDraftPayload.safeParse(req.body)
    if(!draft.success)return res.status(400).json({message:"Invalid draft"})
    try{
      const saved=await access(req).personalSaveStoreApplicationDraft(
        sessionToken(req),draft.data)
      if(!saved)return res.status(403).json({message:"Access denied"})
      if(saved.conflict)return res.status(409).json({message:"Draft changed; read current version"})
      return res.status(draft.data.expected_version===0?201:200)
        .json({draft_id:saved.draft_id,status:"draft",version:saved.version})
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":
          "Outcome uncertain; read drafts"})
    }
  }
  const token=sessionToken(req),svc=access(req)
  let input:StoreRequest
  if((req.body as {action?:unknown}|null)?.action==="submit_draft"){
    const parsed=draftSubmission.safeParse(req.body)
    if(!parsed.success)return res.status(400).json({message:"Invalid draft submission"})
    try{
      const prepared=await svc.personalPrepareStoreApplicationFromDraft(token,parsed.data)
      if(!prepared)return res.status(403).json({message:"Recent MFA and Organization Owner required"})
      if("conflict" in prepared)return res.status(409).json({message:"Draft changed; refresh before submitting"})
      // Persisted draft values are revalidated before the irreversible native call.
      const valid=payload.safeParse({
        organization_id:prepared.organization_id,application_id:prepared.application_id,
        name:prepared.name,email:prepared.email,currency_code:prepared.currency_code
      })
      if(!valid.success)return res.status(403).json({message:"Invalid stored draft"})
      input=prepared
    }catch(error){
      return res.status(error instanceof IdentityAccessDenied?403:503)
        .json({message:error instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
    }
  }else{
    const parsed=payload.safeParse(req.body)
    if(!parsed.success)return res.status(400).json({message:"Invalid application"})
    input=parsed.data
  }
  try{
    // The first transaction reserves a unique ID, actor and exact payload.
    // A retry can NEVER create a second Seller. Unknown outcome stays locked
    // for operator reconciliation, never guessed from name/email matches.
    const result=await svc.reserveStoreApplication(token,input)
    if(!result)return res.status(403).json({message:"Recent MFA and Organization Owner required"})
    if(result.status==="conflict")return res.status(409).json({message:"Draft was already submitted or changed"})
    if(result.status==="name_taken")return res.status(409).json({message:"Store name unavailable; choose another name"})
    if(result.status==="name_unverified")return res.status(409).json({
      message:"Existing application requires a current name review"
    })
    if(result.status==="created")return res.status(200).json({application_id:input.application_id,seller_id:result.seller_id,status:"pending_approval",...(input.draft_id?{draft_id:input.draft_id}:{})})
    if(result.status!=="reserved")
      return res.status(409).json({message:"Application processing; check status instead of retrying"})
    const claimed=await svc.claimStoreApplication(token,input)
    if(!claimed)return res.status(409).json({message:"Application processing"})
    const native=req.scope.resolve<{listMembers(filter:object):Promise<any[]>}>("seller")
    // A completed claim is intentionally COMMITTED before any native create.
    // The protected Owner membership row is held across native create AND
    // Foundation completion. A concurrent revoke either wins before this
    // guard (no native create) or waits for both records to complete.
    const outcome=await svc.personalWithStoreApplicationOwnerLock(
      token,input,async(context:Context)=>{
        const members=await native.listMembers({id:claimed.member_id,is_active:true})
        if(members.length!==1||members[0].id!==claimed.member_id)
          throw new IdentityAccessDenied()
        try{
          const {result:seller}=await createSellerAccountWorkflow(req.scope).run({
            input:{
              auth_identity_id:claimed.member_auth_identity_id,
              member_id:claimed.member_id,
              seller:{name:input.name,email:input.email,
                currency_code:input.currency_code}
            }
          })
          if(!seller||!/^sel_[A-Za-z0-9_-]+$/.test(seller.id)||
             seller.status!=="pending_approval"||seller.approved_at)
            throw new Error("Native Seller outcome uncertain")
          const completed=await svc.finishStoreApplication(token,input,seller.id,context)
          if(!completed)throw new Error("Native Seller outcome uncertain")
          return {seller_id:seller.id as string}
        }catch{
          // Never roll back the *prior committed* creating claim or pretend
          // an uncertain native Seller write has been undone; no automatic
          // second Seller creation from the same request key.
          throw new Error("Native Seller outcome uncertain")
        }
      })
    if(!outcome)return res.status(403).json({message:"Access denied"})
    return res.status(201).json({application_id:input.application_id,seller_id:outcome.seller_id,status:"pending_approval",...(input.draft_id?{draft_id:input.draft_id}:{})})
  }catch(e){
    if(e instanceof IdentityAccessDenied)return res.status(403).json({message:"Access denied"})
    // This may be a successful native write followed by a lost confirmation.
    // Never retry native creation from this endpoint using the same key.
    return res.status(503).json({message:"Outcome uncertain; check application status"})
  }
}
