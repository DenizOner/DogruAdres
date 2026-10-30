import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { timingSafeEqual } from "node:crypto"
import { digest } from "../../modules/dogruadres-access/identity-session"
import Access from "../../modules/dogruadres-access/service"

export const enabled = () => process.env.DOGRUADRES_IDENTITY_ENABLED === "true"
export const secureCookies = () => process.env.NODE_ENV==='production'||process.env.DOGRUADRES_PUBLIC_ORIGIN?.startsWith('https://')===true
export const access = (req: MedusaRequest): Access => req.scope.resolve("dogruadresAccess")
export function sessionToken(req: MedusaRequest): string {
  const entries = (req.headers.cookie ?? "").split(";").map(s=>s.trim()).filter(s=>s.startsWith("da_session="))
  return entries.length === 1 ? entries[0].slice("da_session=".length) : ""
}
export function trustedOrigin(req: MedusaRequest): boolean {
  const expected = process.env.DOGRUADRES_PUBLIC_ORIGIN
  if (!expected || req.headers.origin !== expected) return false
  try {
    const u = new URL(expected)
    return u.protocol === "https:" || (process.env.NODE_ENV !== "production" &&
      u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
  } catch { return false }
}
export async function csrf(req: MedusaRequest): Promise<boolean> {
  if (!trustedOrigin(req)) return false
  const header = req.headers["x-csrf-token"]
  if (typeof header !== "string" || header.length !== 43) return false
  const s = await access(req).personalSession(sessionToken(req))
  if (!s) return false
  return timingSafeEqual(Buffer.from(digest(header)),Buffer.from(s.csrf_hash))
}

/**
 * Only purpose-limited setup and already-authorized full sessions can submit
 * enrollment, using the same exact-origin CSRF requirements.
 */
export async function csrfEnrollment(req:MedusaRequest):Promise<boolean>{
  if(!trustedOrigin(req))return false
  const header=req.headers["x-csrf-token"]
  if(typeof header!=="string"||header.length!==43)return false
  const session=await access(req).personalEnrollmentSession(sessionToken(req))
  if(!session)return false
  return timingSafeEqual(Buffer.from(digest(header)),Buffer.from(session.csrf_hash))
}

/** Explicit native ingress. Public catalog/auth remain available; unsupported
 * native actor delegation is CLOSED until a verified credential-binding adapter
 * is implemented. This is NOT a claim of full D9/machine compatibility.
 */
export async function nativeIngress(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  // Disabling the personal UI must NEVER reopen the legacy Bearer bypass.
  let path:string
  try { path=decodeURIComponent(req.originalUrl.split("?")[0]).replace(/\/{2,}/g,"/").replace(/\/$/,"").toLowerCase() }
  catch { return res.status(400).json({message:"Invalid path"}) }
  const authorization=req.headers.authorization??""
  const nativeSession = "session" in req && !!(req.session as {auth_context?:unknown}|undefined)?.auth_context
  const anonymous = !authorization && !nativeSession && !("auth_context" in req && req.auth_context)
  const publicAuth = /^\/auth\/(user|member|customer)\/emailpass(?:\/callback)?$/
  const publicStore = /^\/store\/(regions|products|product-categories|collections|currencies|locales|offers|sellers|reviews|product-attributes|product-options|product-tags|product-types|product-variants|shipping-options|payment-providers|return-reasons)(?:\/[^/]+)?\/?$/
  if ((path==="/personal" && req.method==="GET") ||
      (path==="/personal/session" && ["GET","POST","DELETE"].includes(req.method)) ||
      (path==="/personal/challenge" && req.method==="POST") ||
      (path==="/personal/organizations" && req.method==="GET") ||
      (path==="/personal/contexts" && req.method==="GET") ||
      (path==="/personal/organization-stores" && req.method==="GET") ||
      (path==="/personal/store-applications" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/store-product-permissions" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/product-drafts" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/platform/stores" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/audit-timeline" && req.method==="GET") ||
      (path==="/personal/launcher" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/notifications" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/links" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/memberships" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/invitations" && ["GET","POST"].includes(req.method)) ||
      ((path==="/personal/platform" || path==="/personal/platform/smtp") && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/mfa" && ["GET","POST"].includes(req.method)) ||
      (path==="/personal/mfa/enroll" && req.method==="POST") ||
      (path==="/personal/mfa/manage" && req.method==="POST") ||
      ((path==="/health" || path==="/cloud/auth") && req.method==="GET") ||
      (anonymous && /^\/dashboard(?:\/.*)?$/.test(path) && req.method==="GET") ||
      (anonymous && publicAuth.test(path) && ["GET","POST"].includes(req.method)) ||
      (anonymous && /^\/auth\/(user|member|customer)\/emailpass\/(register|reset-password)$/.test(path) && req.method==="POST") ||
      (anonymous && /^\/auth\/(user|member|customer)\/providers$/.test(path) && req.method==="GET") ||
      // Confirm accepts an anonymous single-use verification code. Request does NOT.
      (anonymous && path==="/auth/verification/confirm" && req.method==="POST") ||
      (anonymous && path==="/auth/verify-email" && ["GET","POST"].includes(req.method)) ||
      // Medusa validateToken verifies signature, purpose=reset and atomically
      // consumes the persisted jti. A session JWT cannot pass that middleware.
      (!nativeSession && /^\/auth\/(user|member|customer)\/emailpass\/update$/.test(path) && req.method==="POST") ||
      // Native payment hook validates provider payload downstream; no other
      // /hooks operation is public. No bearer/session authority on this path.
      (anonymous && /^\/hooks\/payment\/[^/]+$/.test(path) && req.method==="POST") ||
      (path==="/store/search" && req.method==="POST") ||
      (publicStore.test(path) && req.method === "GET")) return next()
  // A machine key is still authenticated by the native framework. No staff or
  // Organization authority is inferred from it. Only this read-only operation.
  if (path === "/admin/api-keys" && req.method === "GET" && /^Basic /i.test(req.headers.authorization ?? "")) {
    const auth="auth_context" in req?req.auth_context:null
    try {
      if(auth && typeof auth==="object" && "actor_type" in auth && auth.actor_type==="api-key" &&
        "actor_id" in auth && typeof auth.actor_id==="string" && await access(req).personalMachineGrant(auth.actor_id,req.method,path))return next()
    } catch { return res.status(503).json({message:"Service unavailable"}) }
    return res.status(403).json({message:"Machine scope denied"})
  }
  if ((["/admin/users/me","/vendor/members/me","/store/customers/me"].includes(path) && req.method==="GET" ||
       ["/auth/token/refresh","/auth/verification/request","/auth/verification/confirm"].includes(path) && req.method==="POST") && /^Bearer /i.test(authorization)) {
    try {
      const session=await access(req).personalNativeCredential(digest(authorization.slice(7)))
      if(session)return next() // Native framework still verifies JWT and actor type.
    } catch { return res.status(503).json({message:"Service unavailable"}) }
  }
  // Unknown plugin namespaces are closed too. Static dashboards/assets are
  // served by their existing loaders outside this API route middleware; no
  // wildcard namespace or OPTIONS exception can authorize a future handler.
  return res.status(401).json({message:"Personal session ingress required"})
}
