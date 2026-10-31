import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { access, csrf, csrfEnrollment, enabled, sessionToken, trustedOrigin, secureCookies } from "../security"
import { csrfToken, digest, mfaRuntimeEnforced } from "../../../modules/dogruadres-access/identity-session"
import { readNativeMfaSummary } from "../../../modules/dogruadres-access/native-mfa-summary"
import { z } from "@medusajs/framework/zod"
import { bindServerActor } from "../server-actor"
import { verifiedEmailForActorContext } from "../../dogruadres/invitations/accept/route"
const credentials = z.object({email:z.string().email().max(254),password:z.string().min(1).max(1024)}).strict()

export const AUTHENTICATE = false
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled()) return res.status(503).json({message:"Unavailable"})
  const token=sessionToken(req)
  // An absent or malformed credential is an ordinary unauthenticated request,
  // not a database-level exception or an unexpected HTTP 500.
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))
    return res.status(401).json({message:"Access denied"})
  let s
  try{s=await access(req).personalSession(token)}
  catch{return res.status(503).json({message:"Service unavailable"})}
  if(!s)return res.status(401).json({message:"Access denied"})
  try{
    if(!await bindServerActor(req,token))
      return res.status(401).json({message:"Access denied"})
  }catch{return res.status(503).json({message:"Service unavailable"})}
  // Native email proof is distinct from password/MFA and real-world identity.
  let emailVerification: "verified" | "not_verified" | "unavailable" = "unavailable"
  try {
    emailVerification = await verifiedEmailForActorContext(req, {
      actor_type: s.actor_type, actor_id: s.actor_id,
      auth_identity_id: s.auth_identity_id, auth_provider: "emailpass",
      user_metadata: {},
    }) ? "verified" : "not_verified"
  } catch {
    // Never assert verification or expose provider details on a failed read.
  }
  return res.json({person_id:s.person_id,csrf_token:csrfToken(token),email_verification:emailVerification})
}
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled()) return res.status(503).json({message:"Unavailable"})
  if (!trustedOrigin(req)) return res.status(403).json({message:"Access denied"})
  // On first rollout, the immutable DB latch must be explicitly armed.
  // If environment flags and persisted activation disagree, deny password
  // login BEFORE issuing a legacy cookie or native actor binding.
  let activated:boolean
  try{activated=await access(req).personalMfaRuntimeActivation()}
  catch{return res.status(503).json({message:"Authentication temporarily unavailable"})}
  if(activated!==mfaRuntimeEnforced())
    return res.status(503).json({message:"Authentication temporarily unavailable"})
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
    res.cookie("da_challenge",pending.token,{httpOnly:true,secure:secureCookies(),sameSite:"strict",path:"/personal",maxAge:300000})
    return res.status(202).json({challenge_required:true,csrf_token:pending.csrf})
  }
  let purpose:"legacy"|"mfa_enroll"|"full"="legacy"
  let expectedRevision:Readonly<{platform:number;person:number}>|undefined
  if(mfaRuntimeEnforced()){
    let native
    try{native=await readNativeMfaSummary(auth,result.authIdentity.id)}
    catch{return res.status(503).json({message:"Native MFA state unavailable"})}
    // A pending or enabled native factor cannot be promoted without a
    // completed native challenge; recovery is a distinct, audited flow.
    if(native.state==="enabled")
      return res.status(401).json({message:"Additional verification required"})
    try{
      const decision=await access(req).personalLoginMfaDecision(result.authIdentity.id,native.state)
      purpose=decision.purpose
      expectedRevision=decision.expectedRevision
    }catch{return res.status(403).json({message:"Access denied"})}
  }
  const session = await access(req).openPersonalSession(result.authIdentity.id,purpose,expectedRevision)
  if(purpose!=="mfa_enroll"){
    try { if(!await bindServerActor(req,session.token))throw new Error("Session unavailable") }
    catch {
      // Do not return the newly minted credential even if compensation fails.
      try{await access(req).closePersonalSession(session.token,false)}catch{}
      return res.status(503).json({message:"Service unavailable"})
    }
  }
  // Never return a new full or setup-only cookie when retiring the prior
  // browser session failed. Rollback is best effort, not a cross-DB guarantee.
  const previous=sessionToken(req)
  if(previous && previous!==session.token){
    try{
      await access(req).closePersonalSession(previous,false)
    }catch{
      try{await access(req).closePersonalSession(session.token,false)}catch{}
      return res.status(503).json({message:"Service unavailable"})
    }
  }
  res.cookie("da_session",session.token,{httpOnly:true,secure:secureCookies(),sameSite:"strict",path:"/",maxAge:43200000})
  return purpose==="mfa_enroll"
    ? res.status(202).json({enrollment_required:true,csrf_token:session.csrf})
    : res.json({csrf_token:session.csrf})
}
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  const token=sessionToken(req)
  if(!enabled() || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return res.status(403).json({message:"Access denied"})
  let authorized=false
  try{authorized=await csrf(req) || await csrfEnrollment(req)}
  catch{return res.status(503).json({message:"Service unavailable"})}
  if(!authorized)return res.status(403).json({message:"Access denied"})
  if(req.query.all!==undefined && req.query.all!=="true")
    return res.status(400).json({message:"Invalid input"})
  if(Object.keys(req.query).some(k=>k!=="all"&&k!=="action") ||
    (req.query.action!==undefined && req.query.action!=="lock") ||
    (req.query.action==="lock" && req.query.all!==undefined))
    return res.status(400).json({message:"Invalid input"})
  try{
    if(req.query.action==="lock")await access(req).lockPersonalSession(token)
    else await access(req).closePersonalSession(token,req.query.all==="true")
  }
  catch{return res.status(503).json({message:"Service unavailable"})}
  res.clearCookie("da_session",{httpOnly:true,secure:secureCookies(),sameSite:"strict",path:"/"})
  return res.json({success:true})
}
