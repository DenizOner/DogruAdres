import type {MedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {z} from '@medusajs/framework/zod'
import {access,csrf,enabled,sessionToken} from '../security'
const org=z.string().regex(/^daorg_[A-Za-z0-9_-]+$/)
const input=z.object({organization_id:org,membership_id:z.string().min(1).max(255)}).strict()
export const AUTHENTICATE=false
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader('Cache-Control','no-store')
  if(!enabled())return res.status(503).json({message:'Unavailable'})
  const id=org.safeParse(req.query.organization)
  if(!id.success||Object.keys(req.query).length!==1)return res.status(400).json({message:'Invalid input'})
  const memberships=await access(req).personalMemberships(sessionToken(req),id.data)
  return res.json({memberships})
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader('Cache-Control','no-store')
  if(!enabled()||!await csrf(req))return res.status(403).json({message:'Access denied'})
  const parsed=input.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Invalid input'})
  const membership=await access(req).personalRevokeMembership(sessionToken(req),parsed.data.organization_id,parsed.data.membership_id)
  return res.json({membership})
}
