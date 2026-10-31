import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import type {IAuthModuleService} from "@medusajs/framework/types"
import {z} from "@medusajs/framework/zod"
import {access,csrf,sessionToken} from "../../security"
import {mfaSettingsEnabled} from "../route"
import {mfaRuntimeEnforced} from "../../../../modules/dogruadres-access/identity-session"
import {digest} from "../../../../modules/dogruadres-access/identity-session"
import {readNativeMfaSummary} from "../../../../modules/dogruadres-access/native-mfa-summary"
const proof=z.discriminatedUnion("method",[
  z.object({action:z.literal("disable"),method:z.literal("totp"),code:z.string().regex(/^\d{6}$/)}).strict(),
  z.object({action:z.literal("disable"),method:z.literal("recovery_code"),code:z.string().min(8).max(128).regex(/^[A-Za-z0-9-]+$/)}).strict(),
])
const input=z.union([z.object({action:z.literal("recovery_codes")}).strict(),proof])
export const AUTHENTICATE=false
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!mfaSettingsEnabled()||!mfaRuntimeEnforced())return res.status(503).json({message:"MFA management unavailable"})
  if(!await csrf(req))return res.status(403).json({message:"Access denied"})
  const parsed=input.safeParse(req.body)
  if(!parsed.success||Object.keys(req.query??{}).length)return res.status(400).json({message:"Invalid input"})
  const service=access(req),token=sessionToken(req)
  if(!await service.personalLoginAttempt(digest("mfa-management:"+token),digest(req.socket.remoteAddress??"unknown")))return res.status(429).json({message:"Try again later"})
  if(parsed.data.action==="disable"){
    // Native Medusa Auth runs ONLY after a successful, committed Foundation
    // session/epoch revocation AND its canonical security audit/outbox.
    let nativeAttempted=false
    try{
      const auth:IAuthModuleService=req.scope.resolve("auth")
      const session=await service.personalSession(token)
      if(!session)return res.status(403).json({message:"Access denied"})
      const summary=await readNativeMfaSummary(auth,session.auth_identity_id)
      if(!summary.enabled)return res.status(409).json({message:"Native factor reconciliation required"})
      const factors=await auth.listAuthMfa({auth_identity_id:session.auth_identity_id,status:"enabled"},{take:2})
      if(factors.length!==1||factors[0].auth_identity_id!==session.auth_identity_id||factors[0].provider!=="totp")
        return res.status(409).json({message:"Native factor reconciliation required"})
      const prepared=await service.personalPrepareNativeMfaDisable(token)
      if(!prepared||prepared.auth_identity_id!==session.auth_identity_id)
        return res.status(403).json({message:"Recent MFA proof and permitted policy required"})
      res.clearCookie("da_session",{path:"/"})
      nativeAttempted=true
      const factor=await auth.disableAuthMfa({id:factors[0].id,method:parsed.data.method,code:parsed.data.code})
      if(factor.id!==factors[0].id||factor.auth_identity_id!==prepared.auth_identity_id||factor.status!=="disabled")
        throw Error("Native disable result unavailable")
      await service.personalRecordPreparedNativeMfaDisable(prepared)
      return res.json({disabled:true,sessions_revoked:true})
    }catch{
      return res.status(503).json({message:nativeAttempted?
        "INDETERMINATE: native operation may have persisted; do not retry; reconciliation required":
        "Service unavailable"})
    }
  }
  let attempted=false
  try{
    const managed=await service.personalManageNativeMfa(token,"recovery_codes",async identityId=>{
      const auth:IAuthModuleService=req.scope.resolve("auth")
      const summary=await readNativeMfaSummary(auth,identityId)
      if(!summary.enabled)throw Error("MFA factor unavailable")
      attempted=true
      const {codes}=await auth.generateAuthMfaRecoveryCodes({auth_identity_id:identityId,count:10})
      if(!Array.isArray(codes)||codes.length!==10||new Set(codes).size!==10||codes.some(c=>typeof c!=="string"||!c))
        throw Error("Invalid native recovery result")
      return {recovery_codes:codes}
    })
    if(!managed)return res.status(403).json({message:"Recent MFA proof and permitted policy required"})
    return res.json({...managed.result as object,sessions_revoked:false})
  }catch{
    return res.status(attempted?503:409).json({message:attempted?
      "INDETERMINATE: native operation may have persisted; do not retry; reconciliation required":
      "Native factor reconciliation required"})
  }
}
