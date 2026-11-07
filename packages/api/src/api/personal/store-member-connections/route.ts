import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import {z} from "@medusajs/framework/zod"
import {addSellerMemberWorkflow} from "@mercurjs/core/workflows"
import {SellerRole} from "@mercurjs/types"
import {access,csrf,enabled,sessionToken} from "../security"
import {IdentityAccessDenied} from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE=false
const payload=z.object({
  organization_id:z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/),
  seller_id:z.string().regex(/^sel_[A-Za-z0-9_-]+$/),
  membership_id:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
}).strict()

type NativeSeller={
  listMembers(filter:object):Promise<any[]>
  listSellers(filter:object):Promise<any[]>
  listSellerMembers(filter:object):Promise<any[]>
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  let allowed=false
  try{allowed=await csrf(req)}catch{}
  if(!allowed||req.headers.authorization||req.headers["x-seller-id"]!==undefined)
    return res.status(403).json({message:"Access denied"})
  if(Object.keys(req.query??{}).length)return res.status(400).json({message:"Invalid request"})
  const parsed=payload.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid request"})
  const svc=access(req),token=sessionToken(req)
  try{
    const decision=await svc.personalWithStoreMemberConnectionLock(
      token,parsed.data,async memberId=>{
        const native=req.scope.resolve<NativeSeller>("seller")
        const [members,sellers,linked]=await Promise.all([
          native.listMembers({id:memberId,is_active:true}),
          native.listSellers({id:parsed.data.seller_id}),
          native.listSellerMembers({seller_id:parsed.data.seller_id,member_id:memberId})
        ])
        if(members.length!==1||members[0].id!==memberId||
           members[0].is_active!==true||
           sellers.length!==1||sellers[0].id!==parsed.data.seller_id||
           sellers[0].status!=="open"||!sellers[0].approved_at||
           linked.length>1)throw new IdentityAccessDenied()
        const matches=(link:any)=>link.seller_id===parsed.data.seller_id &&
          link.member_id===memberId && link.is_owner===false &&
          link.role_id===SellerRole.SUPPORT
        if(linked.length){
          if(!matches(linked[0]))throw new IdentityAccessDenied()
          return {created:false}
        }
        // Least-privileged native role; the separately audited products.edit
        // permission is still mandatory for every DoğruAdres product action.
        const {result}=await addSellerMemberWorkflow(req.scope).run({
          input:{seller_id:parsed.data.seller_id,member_id:memberId,
            role_id:SellerRole.SUPPORT}
        })
        if(!result||!matches(result))throw new Error("Native membership outcome uncertain")
        // Never claim success before a matching native persistence read.
        const recorded=await native.listSellerMembers({
          seller_id:parsed.data.seller_id,member_id:memberId
        })
        if(recorded.length!==1||!matches(recorded[0]))
          throw new Error("Native membership outcome uncertain")
        return {created:true}
      })
    if(!decision)return res.status(403).json({message:"Access denied"})
    return res.status(decision.created?201:200).json({status:"connected"})
  }catch(e){
    if(e instanceof IdentityAccessDenied)
      return res.status(403).json({message:"Access denied"})
    // A native workflow may have committed before a lost response.
    // Do not automatically replay a potentially completed write.
    return res.status(503).json({message:"Connection outcome uncertain; check before retry"})
  }
}
