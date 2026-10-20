import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { timingSafeEqual } from "node:crypto"
import { access,enabled,sessionToken,trustedOrigin } from "../security"
import { csrfToken } from "../../../modules/dogruadres-access/identity-session"
import { z } from "@medusajs/framework/zod"
import { bindServerActor } from "../server-actor"
const input=z.object({code:z.string().regex(/^\d{6}$/)}).strict()
export const AUTHENTICATE=false
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled()||!trustedOrigin(req))return res.status(403).json({message:"Access denied"})
  const cookies=(req.headers.cookie??"").split(";").map(s=>s.trim()).filter(s=>s.startsWith("da_challenge="))
  const token=cookies.length===1?cookies[0].slice(13):""
  const csrf=req.headers["x-csrf-token"]
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||typeof csrf!=="string"||csrf.length!==43||!timingSafeEqual(Buffer.from(csrf),Buffer.from(csrfToken(token))))return res.status(403).json({message:"Access denied"})
  const parsed=input.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const pending=await access(req).readPersonalChallenge(token)
  if(!pending)return res.status(401).json({message:"Access denied"})
  const auth:IAuthModuleService=req.scope.resolve("auth")
  const challenge=await auth.verifyAuthMfaChallenge({id:pending.challenge_id,auth_identity_id:pending.auth_identity_id,method:"totp",code:parsed.data.code})
  if(!challenge.completed_at||challenge.auth_identity_id!==pending.auth_identity_id)return res.status(401).json({message:"Access denied"})
  const session=await access(req).completePersonalChallenge(token,new Date(challenge.completed_at))
  try { if(!await bindServerActor(req,session.token))throw new Error("Session unavailable") } catch { await access(req).closePersonalSession(session.token,false);return res.status(503).json({message:"Service unavailable"}) }
  if(sessionToken(req))await access(req).closePersonalSession(sessionToken(req),false)
  res.clearCookie("da_challenge",{path:"/personal"})
  res.cookie("da_session",session.token,{httpOnly:true,secure:process.env.NODE_ENV==="production"||req.protocol==="https",sameSite:"strict",path:"/",maxAge:43200000})
  return res.json({csrf_token:session.csrf})
}
