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
  let attempted=false
  try {
    const managed=await service.personalManageNativeMfa(token,parsed.data.action,async identityId=>{
      const auth:IAuthModuleService=req.scope.resolve("auth")
      const summary=await readNativeMfaSummary(auth,identityId)
      if(!summary.enabled)throw Error("MFA factor unavailable")
      if(parsed.data.action==="recovery_codes") {
        attempted=true
        const {codes}=await auth.generateAuthMfaRecoveryCodes({auth_identity_id:identityId,count:10})
        if(!Array.isArray(codes)||codes.length!==10||new Set(codes).size!==10||codes.some(c=>typeof c!=="string"||!c))throw Error("Invalid native recovery result")
        return {recovery_codes:codes}
      }
      const factors=await auth.listAuthMfa({auth_identity_id:identityId,status:"enabled"},{take:2})
      if(factors.length!==1||factors[0].auth_identity_id!==identityId||factors[0].provider!=="totp")throw Error("MFA factor reconciliation required")
      attempted=true
      const factor=await auth.disableAuthMfa({id:factors[0].id,method:parsed.data.method,code:parsed.data.code})
      if(factor.id!==factors[0].id||factor.auth_identity_id!==identityId||factor.status!=="disabled")throw Error("Native disable result unavailable")
      return {disabled:true}
    })
    if(!managed)return res.status(403).json({message:"Recent MFA proof and permitted policy required"})
    if(managed.sessions_revoked)res.clearCookie("da_session",{path:"/"})
    return res.json({...managed.result as object,sessions_revoked:managed.sessions_revoked})
  }catch {
    return res.status(attempted?503:409).json({message:attempted?
      "INDETERMINATE: native operation may have persisted; do not retry; reconciliation required":
      "Native factor reconciliation required"})
  }
}