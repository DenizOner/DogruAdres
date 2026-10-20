import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { access, csrf, enabled, sessionToken, trustedOrigin } from "../security"
import { csrfToken, digest } from "../../../modules/dogruadres-access/identity-session"
import { z } from "@medusajs/framework/zod"
import { bindServerActor } from "../server-actor"
const credentials = z.object({email:z.string().email().max(254),password:z.string().min(1).max(1024)}).strict()

export const AUTHENTICATE = false
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled()) return res.status(503).json({message:"Unavailable"})
  const s = await access(req).personalSession(sessionToken(req))
  if(s && !await bindServerActor(req,sessionToken(req)))return res.status(401).json({message:"Access denied"})
  return s ? res.json({person_id:s.person_id,csrf_token:csrfToken(sessionToken(req))}) : res.status(401).json({message:"Access denied"})
}
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled()) return res.status(503).json({message:"Unavailable"})
  if (!trustedOrigin(req)) return res.status(403).json({message:"Access denied"})
  const parsed = credentials.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({message:"Invalid input"})
  const body = parsed.data
  if(!await access(req).personalLoginAttempt(digest(body.email.toLowerCase()),digest(req.socket.remoteAddress??"unknown")))return res.status(429).json({message:"Try again later"})
  const auth: IAuthModuleService = req.scope.resolve("auth")
  const result = await auth.authenticate("emailpass",{body:{email:body.email,password:body.password},headers:{},query:{},url:req.url,protocol:req.protocol})
  if (!result.success || !result.authIdentity) return res.status(401).json({message:"Access denied"})
  // Explicit server-verified binding is mandatory. No email-based Person creation.
  // MFA-gated identities are NOT promoted from primary password to strong auth.
  const validation = await auth.validateAuthIdentity(result.authIdentity.id,"emailpass",{})
  if (!validation.authIdentity) return res.status(401).json({message:"Additional verification required"})
  if (validation.mfaChallenge) {
    const pending=await access(req).pendingPersonalChallenge(result.authIdentity.id,validation.mfaChallenge.id)
    res.cookie("da_challenge",pending.token,{httpOnly:true,secure:process.env.NODE_ENV==="production"||req.protocol==="https",sameSite:"strict",path:"/personal",maxAge:300000})
    return res.status(202).json({challenge_required:true,csrf_token:pending.csrf})
  }
  const session = await access(req).openPersonalSession(result.authIdentity.id)
  try { if(!await bindServerActor(req,session.token))throw new Error("Session unavailable") } catch { await access(req).closePersonalSession(session.token,false);return res.status(503).json({message:"Service unavailable"}) }
  // Rotate by revoking the previously presented session after successful login.
  if (sessionToken(req)) await access(req).closePersonalSession(sessionToken(req),false)
  res.cookie("da_session",session.token,{httpOnly:true,secure:process.env.NODE_ENV==="production"||req.protocol==="https",sameSite:"strict",path:"/",maxAge:43200000})
  return res.json({csrf_token:session.csrf})
}
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled() || !await csrf(req)) return res.status(403).json({message:"Access denied"})
  if (req.query.all !== undefined && req.query.all !== "true") return res.status(400).json({message:"Invalid input"})
  await access(req).closePersonalSession(sessionToken(req),req.query.all==="true")
  res.clearCookie("da_session",{httpOnly:true,secure:req.protocol==="https",sameSite:"strict",path:"/"})
  return res.json({success:true})
}
