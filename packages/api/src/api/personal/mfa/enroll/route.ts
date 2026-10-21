import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"
import { access,csrf,enabled,sessionToken,secureCookies } from "../../security"
import { bindServerActor } from "../../server-actor"
import { digest } from "../../../../modules/dogruadres-access/identity-session"
import { readNativeMfaSummary } from "../../../../modules/dogruadres-access/native-mfa-summary"

// CLOSED by default. Separate rollout review MUST precede enabling both gates.
// This is an enrollment-only capability, never a Person/Organization grant.
export const AUTHENTICATE=false
export const enrollmentEnabled=()=>enabled() &&
  process.env.DOGRUADRES_MFA_SETTINGS_ENABLED==="true" &&
  process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED==="true"

const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("start"),email:z.string().email().max(254),
    password:z.string().min(1).max(1024)}).strict(),
  z.object({action:z.literal("verify"),code:z.string().regex(/^\d{6}$/)}).strict(),
])
function setupCookie(req:MedusaRequest):string {
  const matches=(req.headers.cookie??"").split(";").map(s=>s.trim())
    .filter(s=>s.startsWith("da_mfa_setup="))
  return matches.length===1?matches[0].slice("da_mfa_setup=".length):""
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  if(!enrollmentEnabled())return res.status(503).json({message:"MFA enrollment unavailable"})
  if(!await csrf(req))return res.status(403).json({message:"Access denied"})
  const parsed=input.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const token=sessionToken(req),service=access(req)
  const current=await service.personalSession(token)
  if(!current)return res.status(403).json({message:"Access denied"})
  const settings=await service.personalMfaSettings(token)
  if(!settings || settings.personal.person_id!==current.person_id ||
     settings.platform.platform_mode==="disabled")
    return res.status(403).json({message:"Enrollment not permitted"})
  const auth:IAuthModuleService=req.scope.resolve("auth")
  if(parsed.data.action==="start"){
    const email=parsed.data.email.toLowerCase()
    if(!await service.personalLoginAttempt(digest(email),
      digest(req.socket?.remoteAddress??"unknown")))
      return res.status(429).json({message:"Try again later"})
    const result=await auth.authenticate("emailpass",{
      body:{email,password:parsed.data.password},headers:{},query:{},
      url:req.url,protocol:req.protocol,
    })
    if(!result.success || result.authIdentity?.id!==current.auth_identity_id)
      return res.status(403).json({message:"Access denied"})
    // A previous pending setup is not silently replaced with another secret.
    // Native lifecycle recovery must be reviewed separately.
    const native=await readNativeMfaSummary(auth,current.auth_identity_id)
    if(native.state!=="not_enrolled")
      return res.status(409).json({message:"Existing MFA factor needs verification or recovery"})
    const setup=await auth.startAuthMfa({
      auth_identity_id:current.auth_identity_id,provider:"totp",
      label:"DoğruAdres",issuer:"DoğruAdres",
    })
    if(setup.mfa.status!=="pending" ||
       setup.mfa.auth_identity_id!==current.auth_identity_id ||
       !setup.mfa.id || (!setup.secret&&!setup.otpauth_url))
      return res.status(503).json({message:"MFA setup unavailable"})
    const ticket=await service.personalBeginMfaEnrollment(token,current.auth_identity_id,setup.mfa.id)
    if(!ticket)return res.status(403).json({message:"Enrollment not permitted"})
    res.cookie("da_mfa_setup",ticket.ticket,{
      httpOnly:true,secure:secureCookies(),sameSite:"strict",
      path:"/personal/mfa/enroll",maxAge:300000,
    })
    // The one-time TOTP setup material must be displayed locally once and
    // never logged, cached, persisted in DoğruAdres tables, or sent as telemetry.
    return res.json({setup_required:true,secret:setup.secret,otpauth_url:setup.otpauth_url})
  }
  const ticket=setupCookie(req)
  const intent=await service.personalClaimMfaVerification(token,ticket)
  if(!intent || intent.auth_identity_id!==current.auth_identity_id)
    return res.status(403).json({message:"Enrollment ticket unavailable"})
  let factor
  try{
    factor=await auth.verifyAuthMfa({
      id:intent.factor_id,auth_identity_id:current.auth_identity_id,code:parsed.data.code,
    })
  }catch{
    return res.status(403).json({message:"MFA verification failed"})
  }
  if(factor.id!==intent.factor_id ||
     factor.auth_identity_id!==current.auth_identity_id || factor.status!=="enabled")
    return res.status(403).json({message:"MFA verification failed"})
  const fresh=await service.personalCompleteMfaEnrollment(token,ticket,intent.factor_id)
  if(!fresh)return res.status(403).json({message:"Enrollment ticket expired or already used"})
  try{
    if(!await bindServerActor(req,fresh.token))throw Error("Native binding unavailable")
  }catch{
    await service.closePersonalSession(fresh.token,false)
    return res.status(503).json({message:"Service unavailable"})
  }
  res.clearCookie("da_mfa_setup",{path:"/personal/mfa/enroll"})
  res.cookie("da_session",fresh.token,{
    httpOnly:true,secure:secureCookies(),sameSite:"strict",
    path:"/",maxAge:43200000,
  })
  return res.json({csrf_token:fresh.csrf,verified:true})
}
