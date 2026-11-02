import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import type {Context} from "@medusajs/framework/types"
import {createSellerAccountWorkflow} from "@mercurjs/core/workflows"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const payload=z.object({
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  application_id:z.string().regex(/^daapp_[0-9a-f]{32}$/),
  name:z.string().trim().min(2).max(120),
  email:z.string().email().max(254),
  currency_code:z.string().regex(/^[a-z]{3}$/),
}).strict()
const query=z.object({organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)}).strict()
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const parsed=query.safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  try{
    const applications=await access(req).personalStoreApplications(sessionToken(req),parsed.data.organization_id)
    return applications?res.status(200).json({applications}):
      res.status(403).json({message:"Access denied"})
  }catch{return res.status(503).json({message:"Unavailable"})}
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let validCsrf=false;try{validCsrf=await csrf(req)}catch{}
  if(!validCsrf||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=payload.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid application"})
  const token=sessionToken(req),svc=access(req)
  try{
    // The first transaction reserves a unique ID, actor and exact payload.
    // A retry can NEVER create a second Seller. Unknown outcome stays locked
    // for operator reconciliation, never guessed from name/email matches.
    const result=await svc.reserveStoreApplication(token,parsed.data)
    if(!result)return res.status(403).json({message:"Recent MFA and Organization Owner required"})
    if(result.status==="created")return res.status(200).json({application_id:parsed.data.application_id,seller_id:result.seller_id,status:"pending_approval"})
    if(result.status!=="reserved")
      return res.status(409).json({message:"Application processing; check status instead of retrying"})
    const claimed=await svc.claimStoreApplication(token,parsed.data)
    if(!claimed)return res.status(409).json({message:"Application processing"})
    const native=req.scope.resolve<{listMembers(filter:object):Promise<any[]>}>("seller")
    // A completed claim is intentionally COMMITTED before any native create.
    // The protected Owner membership row is held across native create AND
    // Foundation completion. A concurrent revoke either wins before this
    // guard (no native create) or waits for both records to complete.
    const outcome=await svc.personalWithStoreApplicationOwnerLock(
      token,parsed.data,async(context:Context)=>{
        const members=await native.listMembers({id:claimed.member_id,is_active:true})
        if(members.length!==1||members[0].id!==claimed.member_id)
          throw new IdentityAccessDenied()
        try{
          const {result:seller}=await createSellerAccountWorkflow(req.scope).run({
            input:{
              auth_identity_id:claimed.member_auth_identity_id,
              member_id:claimed.member_id,
              seller:{name:parsed.data.name,email:parsed.data.email,
                currency_code:parsed.data.currency_code}
            }
          })
          if(!seller||!/^sel_[A-Za-z0-9_-]+$/.test(seller.id)||
             seller.status!=="pending_approval"||seller.approved_at)
            throw new Error("Native Seller outcome uncertain")
          const completed=await svc.finishStoreApplication(token,parsed.data,seller.id,context)
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
    return res.status(201).json({application_id:parsed.data.application_id,seller_id:outcome.seller_id,status:"pending_approval"})
  }catch(e){
    if(e instanceof IdentityAccessDenied)return res.status(403).json({message:"Access denied"})
    // This may be a successful native write followed by a lost confirmation.
    // Never retry native creation from this endpoint using the same key.
    return res.status(503).json({message:"Outcome uncertain; check application status"})
  }
}
