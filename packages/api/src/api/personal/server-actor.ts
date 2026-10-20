import type { MedusaRequest } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { access } from "./security"

/** Supported Medusa signing helper after real provider/MFA verification and
 * authoritative actor ownership. Never accepts browser claims or returns JWTs
 * to the browser. Native middleware remains responsible for signature/actor auth.
 */
export async function bindServerActor(req:MedusaRequest,sessionToken:string) {
  const session=await access(req).personalSession(sessionToken)
  if(!session)return false
  const auth:IAuthModuleService=req.scope.resolve("auth")
  const identity=await auth.retrieveAuthIdentity(session.auth_identity_id)
  const {projectConfig:{http}}=req.scope.resolve("configModule")
  return !!await access(req).renewPersonalNativeCredential(sessionToken,identity,{secret:http.jwtSecret,jwtOptions:http.jwtOptions})
}
