import type { MedusaRequest } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { generateJwtToken } from "@medusajs/framework/utils"
import { createCipheriv,createHash,randomBytes,randomUUID } from "node:crypto"
import { access } from "./security"
import { digest } from "../../modules/dogruadres-access/identity-session"

/** Supported Medusa signing helper after real provider/MFA verification and
 * authoritative actor ownership. Never accepts browser claims or returns JWTs
 * to the browser. Native middleware remains responsible for signature/actor auth.
 */
export async function bindServerActor(req:MedusaRequest,sessionToken:string,strongAt:Date|null) {
  const session=await access(req).personalSession(sessionToken)
  if(!session)throw new Error("Session unavailable")
  const auth:IAuthModuleService=req.scope.resolve("auth")
  const identity=await auth.retrieveAuthIdentity(session.auth_identity_id)
  if(identity.app_metadata?.[session.actor_type+"_id"]!==session.actor_id)throw new Error("Actor binding unavailable")
  const {projectConfig:{http}}=req.scope.resolve("configModule")
  const token=generateJwtToken({jti:randomUUID(),actor_id:session.actor_id,actor_type:session.actor_type,auth_identity_id:identity.id,
    auth_provider:"emailpass",app_metadata:identity.app_metadata,mfa_enabled:!!strongAt,
    mfa_challenge_completed_at:strongAt?.toISOString()??null},{secret:http.jwtSecret,expiresIn:"15m",jwtOptions:http.jwtOptions})
  const key=process.env.COOKIE_SECRET
  if(!key || key.length<32)throw new Error("Credential encryption unavailable")
  const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",createHash("sha256").update("native-credential:"+key).digest(),iv)
  const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()])
  await access(req).bindPersonalNativeCredential(sessionToken,digest(token),[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString("base64url")).join("."))
}
