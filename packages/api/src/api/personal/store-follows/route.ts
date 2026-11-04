import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const organization=z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const seller=z.string().regex(/^sel_[A-Za-z0-9_-]+$/)
const query=z.object({organization_id:organization,seller_id:seller}).strict()
const listQuery=z.object({organization_id:organization,after:seller.optional()}).strict()
const payload=z.object({
  action:z.enum(["follow","unfollow"]),organization_id:organization,
  seller_id:seller,expected_version:z.number().int().min(0).max(2147483646)
}).strict()

const headers=(res:MedusaResponse)=>{
  res.setHeader("Cache-Control","private, no-store")
  res.setHeader("Vary","Cookie")
  res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive")
  res.setHeader("Referrer-Policy","no-referrer")
}
const denied=(res:MedusaResponse)=>res.status(403).json({message:"Access denied"})

/** Caller only learns their own Buyer Organization's Store follow state.
 * Never a Seller directory, protected customer list or price entitlement.
 */
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  headers(res)
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)
    return res.status(400).json({message:"Invalid context"})
  const listed=req.query?.seller_id===undefined
  const q=listed?listQuery.safeParse(req.query):query.safeParse(req.query)
  if(!q.success)return res.status(400).json({message:"Invalid context"})
  try{
    if(listed){
      const values=q.data as {organization_id:string;after?:string}
      const result=await access(req).personalBuyerStoreFollows(
        sessionToken(req),values.organization_id,values.after)
      return result?res.status(200).json(result):denied(res)
    }
    const values=q.data as {organization_id:string;seller_id:string}
    const state=await access(req).personalBuyerStoreFollowState(
      sessionToken(req),values.organization_id,values.seller_id)
    return state?res.status(200).json(state):denied(res)
  }catch(error){
    return error instanceof IdentityAccessDenied?denied(res):
      res.status(503).json({message:"Unavailable"})
  }
}

/** No implicit member grant. A protected Owner follows an independently
 * approved/open Store with fresh server-owned identity and Buyer Org scope.
 * Unfollow is permitted without native Store visibility: never trap a Buyer
 * Organization in a follow merely because the Store was suspended.
 */
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  headers(res)
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let allowed=false
  try{allowed=await csrf(req)}catch{}
  if(!allowed||req.headers.authorization!==undefined||
     req.headers["x-seller-id"]!==undefined)return denied(res)
  if(Object.keys(req.query??{}).length)
    return res.status(400).json({message:"Invalid request"})
  const parsed=payload.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid request"})
  try{
    if(parsed.data.action==="follow"){
      const native=req.scope.resolve<{
        listSellers(filters:object,config?:object):Promise<any[]>
      }>("seller")
      const candidates=await native.listSellers({id:parsed.data.seller_id},{take:2})
      if(!Array.isArray(candidates)||candidates.length!==1||
         candidates[0]?.id!==parsed.data.seller_id||
         candidates[0]?.status!=="open"||!candidates[0]?.approved_at)
        return denied(res)
    }
    const value=await access(req).personalChangeBuyerStoreFollow(
      sessionToken(req),parsed.data)
    if(!value)return denied(res)
    if(value.conflict)return res.status(409).json({message:"Follow state changed"})
    return res.status(200).json({organization_id:value.organization_id,
      seller_id:value.seller_id,following:value.following,version:value.version})
  }catch(error){
    return error instanceof IdentityAccessDenied?denied(res):
      res.status(503).json({message:"Outcome uncertain; read Store follows"})
  }
}
