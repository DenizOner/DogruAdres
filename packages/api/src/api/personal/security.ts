import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { timingSafeEqual } from "node:crypto"
import { digest } from "../../modules/dogruadres-access/identity-session"
import Access from "../../modules/dogruadres-access/service"

export const enabled = () => process.env.DOGRUADRES_IDENTITY_ENABLED === "true"
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

/** Explicit native ingress. Public catalog/auth remain available; unsupported
 * native actor delegation is CLOSED until a verified credential-binding adapter
 * is implemented. This is NOT a claim of full D9/machine compatibility.
 */
export async function nativeIngress(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  // Disabling the personal UI must NEVER reopen the legacy Bearer bypass.
  let path:string
  try { path=decodeURIComponent(req.originalUrl.split("?")[0]).replace(/\/{2,}/g,"/").replace(/\/$/,"").toLowerCase() }
  catch { return res.status(400).json({message:"Invalid path"}) }
  const publicAuth = /^\/auth\/(user|member|customer)\/emailpass(?:\/(register|reset-password|update|callback))?\/?$/
  const publicStore = /^\/store\/(regions|products|product-categories|collections|currencies|locales|offers|sellers|reviews|product-attributes|product-options|product-tags|product-types|product-variants|shipping-options|payment-providers|return-reasons)(?:\/[^/]+)?\/?$/
  if (path.startsWith("/personal") || path === "/health" ||
      (publicAuth.test(path) && ["GET","POST"].includes(req.method)) ||
      (/^\/auth\/(user|member|customer)\/providers\/?$/.test(path) && req.method==="GET") ||
      (/^\/auth\/verification\/(request|confirm)\/?$/.test(path) && req.method==="POST") ||
      (path==="/store/search" && req.method==="POST") ||
      (publicStore.test(path) && req.method === "GET") || req.method === "OPTIONS") return next()
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
  const authorization=req.headers.authorization??""
  if ((path==="/admin/users/me" && req.method==="GET" || path==="/auth/token/refresh" && req.method==="POST") && authorization.startsWith("Bearer ")) {
    try {
      const session=await access(req).personalNativeCredential(digest(authorization.slice(7)))
      if(session)return next() // Native framework still verifies JWT and actor type.
    } catch { return res.status(503).json({message:"Service unavailable"}) }
  }
  if (/^\/(admin|vendor|store|auth|dogruadres)(\/|$)/.test(path)) return res.status(401).json({message:"Personal session ingress required"})
  return next()
}
