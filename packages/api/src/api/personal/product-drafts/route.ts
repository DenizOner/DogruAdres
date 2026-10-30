import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { createProductsWorkflow } from "@mercurjs/core/workflows"
import { access,csrf,enabled,sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const draft=z.object({
  request_id:z.string().regex(/^dapd_[0-9a-f]{32}$/),
  organization_id:org,seller_id:seller,
  title:z.string().min(2).max(120).trim()
}).strict()

type NativeSeller={
  listSellerMembers(filter:object):Promise<any[]>
  listMembers(filter:object):Promise<any[]>
  listSellers(filter:object):Promise<any[]>
}
function cleanNativeRows(rows:any[],binding:any,sellerId:string):boolean{
  return rows.length===3&&
    Array.isArray(rows[0])&&rows[0].length===1&&
    rows[0][0].seller_id===sellerId&&rows[0][0].member_id===binding.actor_id&&
    Array.isArray(rows[1])&&rows[1].length===1&&
    rows[1][0].id===binding.actor_id&&
    Array.isArray(rows[2])&&rows[2].length===1&&
    rows[2][0].id===sellerId&&rows[2][0].status==="open"&&
    !!rows[2][0].approved_at
}
async function liveNative(req:MedusaRequest,token:string,personId:string,sellerId:string){
  const binding=await access(req).personalActorBinding(token,"member")
  if(!binding||binding.revoked_at||binding.person_id!==personId||
     typeof binding.actor_id!=="string")return false
  const native=req.scope.resolve<NativeSeller>("seller")
  const rows=await Promise.all([
    native.listSellerMembers({member_id:binding.actor_id,seller_id:sellerId}),
    native.listMembers({id:binding.actor_id,is_active:true}),
    native.listSellers({id:sellerId})
  ])
  return cleanNativeRows(rows,binding,sellerId)
}

export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  const receiptMode=req.query.request_id!==undefined||req.query.seller_id!==undefined
  if(receiptMode){
    const receiptParams=z.object({organization_id:org,seller_id:seller,
      request_id:z.string().regex(/^dapd_[0-9a-f]{32}$/)}).strict().safeParse(req.query)
    if(!receiptParams.success||req.headers["x-seller-id"]!==undefined)
      return res.status(400).json({message:"Invalid context"})
    const {organization_id,seller_id,request_id}=receiptParams.data
    const service=access(req),token=sessionToken(req)
    try{
      const current=await service.personalProductDraftScope(token,organization_id,seller_id)
      if(!current||!await liveNative(req,token,current.person_id,seller_id))
        return res.status(403).json({message:"Access denied"})
      const outcome=await service.personalProductDraftReceipt(
        token,organization_id,seller_id,request_id)
      if(!outcome)return res.status(403).json({message:"Access denied"})
      const after=await service.personalProductDraftScope(token,organization_id,seller_id)
      if(!after||after.person_id!==current.person_id||
         !await liveNative(req,token,current.person_id,seller_id))
        return res.status(403).json({message:"Access denied"})
      return res.status(200).json(outcome)
    }catch(e){
      return res.status(e instanceof IdentityAccessDenied?403:503)
        .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
    }
  }
  const parsed=z.object({organization_id:org}).strict().safeParse(req.query)
  if(!parsed.success||req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const service=access(req),token=sessionToken(req)
  try{
    const scope=await service.personalProductDraftCandidates(token,parsed.data.organization_id)
    if(!scope)return res.status(403).json({message:"Access denied"})
    const native=req.scope.resolve<NativeSeller>("seller")
    const binding=await service.personalActorBinding(token,"member")
    if(!binding||binding.revoked_at||binding.person_id!==scope.person_id)
      return res.status(403).json({message:"Access denied"})
    const stores:Array<{id:string;name:string}>=[]
    for(const id of scope.seller_ids){
      const rows=await Promise.all([
        native.listSellerMembers({member_id:binding.actor_id,seller_id:id}),
        native.listMembers({id:binding.actor_id,is_active:true}),
        native.listSellers({id})
      ])
      if(cleanNativeRows(rows,binding,id)){
        const name=rows[2][0].name
        stores.push({id,name:typeof name==="string"?name:""})
      }
    }
    const final=await service.personalProductDraftCandidates(token,parsed.data.organization_id)
    const freshBinding=await service.personalActorBinding(token,"member")
    if(!final||final.person_id!==scope.person_id||
       final.seller_ids.length!==scope.seller_ids.length||
       final.seller_ids.some((s:string,i:number)=>s!==scope.seller_ids[i])||
       !freshBinding||freshBinding.revoked_at||
       freshBinding.id!==binding.id||freshBinding.person_id!==binding.person_id)
      return res.status(403).json({message:"Access denied"})
    for(const item of stores)if(!await liveNative(req,token,scope.person_id,item.id))
      return res.status(403).json({message:"Access denied"})
    return res.status(200).json({organization_id:parsed.data.organization_id,stores})
  }catch(e){
    return res.status(e instanceof IdentityAccessDenied?403:503)
      .json({message:e instanceof IdentityAccessDenied?"Access denied":"Unavailable"})
  }
}

export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let valid=false;try{valid=await csrf(req)}catch{}
  if(!valid||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  const parsed=draft.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const data=parsed.data,svc=access(req),token=sessionToken(req)
  try{
    const scope=await svc.personalProductDraftScope(token,data.organization_id,data.seller_id)
    if(!scope||!await liveNative(req,token,scope.person_id,data.seller_id))
      return res.status(403).json({message:"Access denied"})
    const attempt=await svc.personalReserveProductDraft(token,data)
    if(!attempt)return res.status(403).json({message:"Access denied"})
    if(attempt.status==="uncertain")
      return res.status(409).json({message:"Outcome uncertain; do not retry this operation"})
    if(attempt.status==="created"){
      // Never reveal even a previously-created product after permission revoke.
      const final=await svc.personalProductDraftScope(token,data.organization_id,data.seller_id)
      if(!final||final.person_id!==scope.person_id||
         !await liveNative(req,token,scope.person_id,data.seller_id))
        return res.status(403).json({message:"Access denied"})
      return res.status(200).json({status:"created",product_id:attempt.product_id})
    }
    // Foundation reserved this key. If anything below fails, leave it
    // reserved and do not re-run an uncertain Mercur transaction.
    const fresh=await svc.personalProductDraftScope(token,data.organization_id,data.seller_id)
    if(!fresh||fresh.person_id!==scope.person_id||
       !await liveNative(req,token,scope.person_id,data.seller_id))
      return res.status(409).json({message:"Outcome uncertain; do not retry this operation"})
    const {result}=await createProductsWorkflow(req.scope).run({
      input:{products:[{
        title:data.title,status:"draft",seller_ids:[data.seller_id],
        metadata:{dogruadres_draft_request_id:data.request_id}
      }],created_by:data.seller_id}
    })
    if(result.length!==1||typeof result[0]?.id!=="string"||
       !/^prod_[A-Za-z0-9_-]+$/.test(result[0].id))
      return res.status(503).json({message:"Outcome uncertain; check product record"})
    const completed=await svc.personalCompleteProductDraft(token,data,result[0].id)
    if(!completed)return res.status(503).json({message:"Outcome uncertain; check product record"})
    const authorized=await svc.personalProductDraftScope(token,data.organization_id,data.seller_id)
    if(!authorized||authorized.person_id!==scope.person_id||
       !await liveNative(req,token,scope.person_id,data.seller_id))
      return res.status(403).json({message:"Access denied"})
    return res.status(201).json({status:"created",product_id:result[0].id})
  }catch(e){
    if(e instanceof IdentityAccessDenied)return res.status(403).json({message:"Access denied"})
    return res.status(503).json({message:"Outcome uncertain; do not retry this operation"})
  }
}
