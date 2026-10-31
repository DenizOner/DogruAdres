import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, csrf, enabled, sessionToken } from "../security"
import { provisionOrganizationBody } from "../../dogruadres/validators"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
export const AUTHENTICATE = false
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled()) return res.status(503).json({message:"Unavailable"})
  const grant = await access(req).personalStaff(sessionToken(req),"organization.provision","platform")
  return grant ? res.json({allowed:true}) : res.status(403).json({message:"Access denied or strong authentication required"})
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled()||!await csrf(req))return res.status(403).json({message:"Access denied"})
  const staff=await access(req).personalStaff(sessionToken(req),"organization.provision","platform")
  if(!staff)return res.status(403).json({message:"Access denied or strong authentication required"})
  const parsed=provisionOrganizationBody.strict().safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const query=req.scope.resolve(ContainerRegistrationKeys.QUERY)
  for(const owner of parsed.data.initial_owners){
    const {data}=await query.graph({entity:owner.actor_type,fields:["id"],filters:{id:owner.actor_id},pagination:{take:2}},{cache:{enable:false}})
    if(data.length!==1)return res.status(400).json({message:"Invalid initial Owner"})
  }
  try {
    const result=await access(req).provisionPersonalOrganization(sessionToken(req),parsed.data)
    return res.status(201).json({organization:{id:result.organization.id,name:result.organization.name,status:result.organization.status},initial_owner_count:result.memberships.length})
  } catch(error: any) {
    if(error instanceof MedusaError && error.type === MedusaError.Types.INVALID_DATA) {
      return res.status(400).json({message: error.message})
    }
    throw error
  }
}

