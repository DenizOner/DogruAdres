import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"
import { access,csrfEnrollment,enabled,sessionToken,secureCookies } from "../../security"
import { mfaRuntimeEnforced } from "../../../../modules/dogruadres-access/identity-session"
import { bindServerActor } from "../../server-actor"
import { digest } from "../../../../modules/dogruadres-access/identity-session"
import { readNativeMfaSummary, findResumablePendingTotpId } from "../../../../modules/dogruadres-access/native-mfa-summary"

// CLOSED by default. Separate rollout review MUST precede enabling both gates.
// This is an enrollment-only capability, never a Person/Organization grant.
export const AUTHENTICATE=false
export const enrollmentEnabled=()=>enabled() &&
  process.env.DOGRUADRES_MFA_SETTINGS_ENABLED==="true" &&
  process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED==="true" &&
  mfaRuntimeEnforced()

const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("start"),email:z.string().email().max(254),
    password:z.string().min(1).max(1024)}).strict(),
  z.object({action:z.literal("verify"),code:z.string().regex(/^\d{6}$/)}).strict(),
  // Resume requires the same fresh password proof as start; never accepts a
  // client-supplied factor or Person identifier.
  z.object({action:z.literal("resume"),email:z.string().email().max(254),
    password:z.string().min(1).max(1024)}).strict(),
  z.object({action:z.literal("reset_pending"),email:z.string().email().max(254),
    password:z.string().min(1).max(1024)}).strict(),
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
  if(!await csrfEnrollment(req))return res.status(403).json({message:"Access denied"})
  const parsed=input.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const token=sessionToken(req),service=access(req)
  const current=await service.personalEnrollmentSession(token)
  if(!current)return res.status(403).json({message:"Access denied"})
  const settings=await service.personalEnrollmentMfaSettings(token)
  if(!settings || settings.personal.person_id!==current.person_id ||
     settings.platform.platform_mode==="disabled")
    return res.status(403).json({message:"Enrollment not permitted"})
  const auth:IAuthModuleService=req.scope.resolve("auth")
  if(["start","resume","reset_pending"].includes(parsed.data.action)){
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
    if(parsed.data.action==="reset_pending"){
      // Separately guarded destructive mutation: only a pending factor
      // belonging to this exact password-verified AuthIdentity can be reset.
      if(process.env.DOGRUADRES_MFA_PENDING_RESET_ENABLED!=="true")
        return res.status(503).json({message:"Pending MFA reset unavailable"})
      const pendingId=await findResumablePendingTotpId(auth,current.auth_identity_id)
      if(!pendingId)return res.status(409).json({message:"No pending TOTP enrollment"})
      const verified=await auth.retrieveAuthMfa({
        id:pendingId,auth_identity_id:current.auth_identity_id,
      })
      if(verified.id!==pendingId||verified.auth_identity_id!==current.auth_identity_id||
         verified.status!=="pending"||verified.provider!=="totp")
        return res.status(409).json({message:"Pending factor changed"})
      const revoked=await service.personalRevokePendingMfaEnrollment(token,pendingId)
      if(!revoked)return res.status(403).json({message:"Enrollment not permitted"})
      // Medusa v2.21.2 itself denies disabling an enabled factor without
      // challenge. A concurrent activation therefore fails closed.
      let disabled
      try{disabled=await auth.disableAuthMfa({id:pendingId})}
      catch{return res.status(409).json({message:"Pending factor changed; refresh state"})}
      if(disabled.id!==pendingId || disabled.auth_identity_id!==current.auth_identity_id ||
         disabled.status!=="disabled")
        return res.status(503).json({message:"Native MFA reset could not be confirmed"})
      res.clearCookie("da_mfa_setup",{path:"/personal/mfa/enroll"})
      return res.json({reset:true})
    }
    let factorId:string
    let secret:string|undefined,otpauth_url:string|undefined
    if(parsed.data.action==="resume"){
      // Recovery uses the *existing* pending factor with no metadata/secret
      // disclosed. A user who lost the old authenticator secret must instead
      // use a separately authorized pending-reset workflow.
      const pendingId=await findResumablePendingTotpId(auth,current.auth_identity_id)
      if(!pendingId)return res.status(409).json({message:"No pending TOTP enrollment to resume"})
      factorId=pendingId
    }else{
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
      factorId=setup.mfa.id
      secret=setup.secret
      otpauth_url=setup.otpauth_url
    }
    const ticket=await service.personalBeginMfaEnrollment(token,current.auth_identity_id,factorId)
    if(!ticket)return res.status(403).json({message:"Enrollment not permitted"})
    res.cookie("da_mfa_setup",ticket.ticket,{
      httpOnly:true,secure:secureCookies(),sameSite:"strict",
      path:"/personal/mfa/enroll",maxAge:300000,
    })
    // The one-time TOTP setup material must be displayed locally once and
    // never logged, cached, persisted in DoğruAdres tables, or sent as telemetry.
    return parsed.data.action==="resume"
      ? res.json({setup_required:true,resumed:true})
      : res.json({setup_required:true,secret,otpauth_url})
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
