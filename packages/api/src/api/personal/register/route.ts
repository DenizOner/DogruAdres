import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { access, enabled, trustedOrigin } from "../security"
import { digest } from "../../../modules/dogruadres-access/identity-session"

export const AUTHENTICATE = false

// A Customer is a native authentication adapter, never the legal buyer or
// the canonical DoğruAdres Person. The browser never receives an actor JWT.
const form = z.object({
  first_name:z.string().trim().min(1).max(50),
  last_name:z.string().trim().min(1).max(50),
  email:z.string().trim().email().max(254),
  password:z.string().min(12).max(128),
  mobile_phone:z.string().min(6).max(20).regex(/^\+?[0-9]+$/),
}).strict()

export const POST = async (req:MedusaRequest,res:MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  res.setHeader("Referrer-Policy","no-referrer")
  if(!enabled())return res.status(503).json({message:"Unavailable"})
  if(!trustedOrigin(req))return res.status(403).json({message:"Access denied"})
  if(Object.keys(req.query??{}).length || req.headers.authorization)
    return res.status(400).json({message:"Invalid request"})
  const parsed=form.safeParse(req.body)
  if(!parsed.success)return res.status(400).json({message:"Invalid registration information"})
  const {first_name,last_name,password,mobile_phone}=parsed.data
  const email=parsed.data.email.trim().toLowerCase()
  const service=access(req)
  try{
    if(!await service.personalLoginAttempt(digest("person-register:"+email),
      digest(req.socket.remoteAddress??"unknown")))
      return res.status(429).json({message:"Try again later"})
  }catch{return res.status(503).json({message:"Service unavailable"})}

  const auth:IAuthModuleService=req.scope.resolve("auth")
  const proof={body:{email,password},headers:{},query:{},url:req.url,protocol:req.protocol}
  // Native emailpass registration can commit before its response is lost.
  // Authenticating the same credential also permits safe retry/resumption,
  // without guessing ownership from email or creating a second Person.
  try{await auth.register("emailpass",proof)}catch{}
  let authenticated
  try{authenticated=await auth.authenticate("emailpass",proof)}
  catch{return res.status(503).json({message:"Registration could not be confirmed"})}
  if(!authenticated.success || !authenticated.authIdentity)
    return res.status(409).json({message:"Account could not be created with these credentials"})
  const identity=authenticated.authIdentity
  const metadata=identity.app_metadata??{}
  if(metadata.user_id || metadata.member_id)
    return res.status(409).json({message:"Use the existing account and authorized linking flow"})
  try{
    const validation=await auth.validateAuthIdentity(identity.id,"emailpass",{})
    if(!validation.authIdentity || validation.mfaChallenge)
      return res.status(403).json({message:"Additional identity verification required"})
  }catch{return res.status(503).json({message:"Registration verification unavailable"})}

  if(!metadata.customer_id){
    try{
      // Official Medusa workflow verifies the Customer's email matches the
      // provider identity and binds customer_id without a browser bearer token.
      await createCustomerAccountWorkflow(req.scope).run({
        input:{authIdentityId:identity.id,customerData:{email,first_name,last_name}},
      })
    }catch{return res.status(503).json({message:"Registration is not yet complete; sign in to resume"})}
  }
  try{
    const rechecked=await auth.authenticate("emailpass",proof)
    if(!rechecked.success || rechecked.authIdentity?.id!==identity.id)
      return res.status(403).json({message:"Access denied"})
    if(rechecked.authIdentity.app_metadata?.user_id ||
       rechecked.authIdentity.app_metadata?.member_id)
      return res.status(409).json({message:"Use the authorized account linking flow"})
    const actorId=rechecked.authIdentity.app_metadata?.customer_id
    if(typeof actorId!=="string" || !/^cus_[A-Za-z0-9_-]+$/.test(actorId))
      return res.status(503).json({message:"Native account binding unavailable"})
    const customerModule=req.scope.resolve("customer") as {
      retrieveCustomer(id:string):Promise<{id:string;email:string}>
    }
    const customer=await customerModule.retrieveCustomer(actorId)
    if(customer.id!==actorId || customer.email.trim().toLowerCase()!==email)
      return res.status(403).json({message:"Access denied"})
    const result=await service.personalRegisterCustomer(
      identity.id,actorId,mobile_phone,first_name+" "+last_name)
    // No native JWT, personal session, phone, Person ID, Organization or Store
    // authority leaks to the browser. The existing MFA-aware login is next.
    return res.status(result.created?201:200).json({registered:true,next_step:"personal_login"})
  }catch{return res.status(503).json({message:"Registration result could not be confirmed; sign in to check"})}
}
