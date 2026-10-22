import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { timingSafeEqual } from "node:crypto"
import { access,enabled,sessionToken,trustedOrigin,secureCookies } from "../security"
import { csrfToken } from "../../../modules/dogruadres-access/identity-session"
import { z } from "@medusajs/framework/zod"
import { bindServerActor } from "../server-actor"
// "recovery_code" is a native Medusa 2.21.2 single-use challenge method,
// NOT a DoğruAdres OTP or an alternative unauthenticated login endpoint.
const input=z.union([
  z.object({code:z.string().regex(/^\d{6}$/)}).strict(),
  z.object({method:z.literal("totp"),code:z.string().regex(/^\d{6}$/)}).strict(),
  z.object({method:z.literal("recovery_code"),
    code:z.string().min(8).max(128).regex(/^[A-Za-z0-9-]+$/)}).strict(),
])
export const AUTHENTICATE=false
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader("Cache-Control","no-store")
  if(!enabled()||!trustedOrigin(req))return res.status(403).json({message:"Access denied"})
  const cookies=(req.headers.cookie??"").split(";").map(s=>s.trim()).filter(s=>s.startsWith("da_challenge="))
  const token=cookies.length===1?cookies[0].slice(13):""
  const csrf=req.headers["x-csrf-token"]
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||typeof csrf!=="string"||csrf.length!==43||!timingSafeEqual(Buffer.from(csrf),Buffer.from(csrfToken(token))))return res.status(403).json({message:"Access denied"})
  const parsed=input.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid input"})
  const pending=await access(req).readPersonalChallenge(token)
  if(!pending)return res.status(401).json({message:"Access denied"})
  const auth:IAuthModuleService=req.scope.resolve("auth")
  // Medusa validates that the selected method belongs to the challenge,
  // verifies the factor and consumes a recovery code at most once.
  const method=("method" in parsed.data?parsed.data.method:"totp") as "totp"|"recovery_code"
  let challenge
  try{
    challenge=await auth.verifyAuthMfaChallenge({
      id:pending.challenge_id,auth_identity_id:pending.auth_identity_id,
      method,code:parsed.data.code,
    })
  }catch{return res.status(401).json({message:"Access denied"})}
  if(!challenge.completed_at||challenge.auth_identity_id!==pending.auth_identity_id)
    return res.status(401).json({message:"Access denied"})
  let session
  try{session=await access(req).completePersonalChallenge(token,new Date(challenge.completed_at))}
  catch{return res.status(401).json({message:"Access denied"})}
  try{
    if(!await bindServerActor(req,session.token))throw new Error("Session unavailable")
  }catch{
    // The credential must never be returned if compensating revocation fails.
    try{await access(req).closePersonalSession(session.token,false)}catch{}
    return res.status(503).json({message:"Service unavailable"})
  }
  const previous=sessionToken(req)
  if(previous && previous!==session.token){
    try{
      await access(req).closePersonalSession(previous,false)
    }catch{
      // Do not expose a newly created full session if retiring the old
      // session failed. Cleanup is best effort; the token is never returned.
      try{await access(req).closePersonalSession(session.token,false)}catch{}
      return res.status(503).json({message:"Service unavailable"})
    }
  }
  res.clearCookie("da_challenge",{path:"/personal"})
  res.cookie("da_session",session.token,{httpOnly:true,secure:secureCookies(),sameSite:"strict",path:"/",maxAge:43200000})
  return res.json({csrf_token:session.csrf})
}
