import type {MedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import type {IAuthModuleService} from '@medusajs/framework/types'
import {z} from '@medusajs/framework/zod'
import {access,csrf,enabled,sessionToken} from '../security'
import {digest} from '../../../modules/dogruadres-access/identity-session'
import {createHmac} from 'node:crypto'
import type {VerifiedSecondary} from '../../../modules/dogruadres-access/account-linking'
const begin=z.object({action:z.literal('begin'),actor_type:z.enum(['member','customer']),email:z.string().email().max(254),password:z.string().min(1).max(1024)}).strict()
const complete=z.object({action:z.literal('complete'),intent:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().regex(/^\d{6}$/).optional()}).strict()
const unlink=z.object({action:z.literal('unlink'),binding_id:z.string().min(1).max(255)}).strict()
const body=z.discriminatedUnion('action',[begin,complete,unlink])
export const AUTHENTICATE=false
export const GET=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader('Cache-Control','no-store')
  if(!enabled())return res.status(503).json({message:'Unavailable'})
  try{const bindings=await access(req).personalActorLinks(sessionToken(req));return bindings?res.json({bindings}):res.status(403).json({message:'Access denied'})}catch{return res.status(403).json({message:'Access denied'})}
}
/** Only server-retrieved native metadata and module existence define an actor. */
async function proof(req:MedusaRequest,id:string,type:'member'|'customer'):Promise<VerifiedSecondary>{
  const auth:IAuthModuleService=req.scope.resolve('auth'),identity=await auth.retrieveAuthIdentity(id)
  const actor=identity.app_metadata?.[type+'_id']
  if(typeof actor!=='string'||!actor)throw Error('Denied')
  const providers=await auth.listProviderIdentities({auth_identity_id:id,provider:'emailpass'})
  if(providers.length!==1)throw Error('Denied')
  const rows=type==='member'?await req.scope.resolve<{listMembers(f:object):Promise<any[]>}>('seller').listMembers({id:actor,is_active:true}):await req.scope.resolve<{listCustomers(f:object):Promise<any[]>}>('customer').listCustomers({id:actor})
  if(rows.length!==1||rows[0].id!==actor)throw Error('Denied')
  // The supported DTO has no updated_at/version. Use a purpose-separated keyed
  // fingerprint of current server-only provider state; never persist or return
  // the provider metadata/password hash itself. Any change requires fresh proof.
  const key=process.env.COOKIE_SECRET;if(!key||key.length<32)throw Error('Denied')
  const version=createHmac('sha256',key).update('dual-proof:'+JSON.stringify([id,providers[0].id,providers[0].provider,providers[0].entity_id,providers[0].auth_identity_id,providers[0].provider_metadata,identity.app_metadata,type,actor])).digest('hex')
  return {auth_identity_id:id,actor_type:type,actor_id:actor,proof_fingerprint:version}
}
export const POST=async(req:MedusaRequest,res:MedusaResponse)=>{
  res.setHeader('Cache-Control','no-store')
  let validCsrf=false;try{validCsrf=await csrf(req)}catch{}
  if(!enabled()||!validCsrf)return res.status(403).json({message:'Access denied'})
  const parsed=body.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Invalid input'})
  const token=sessionToken(req),service=access(req),primary=await service.personalLinkPrimary(token)
  if(!primary)return res.status(403).json({message:'Recent strong authentication required'})
  const input=parsed.data,auth:IAuthModuleService=req.scope.resolve('auth')
  try{
    if(input.action==='unlink'){const result=await service.unlinkActor(token,input.binding_id);return result?res.json(result):res.status(403).json({message:'Access denied'})}
    if(input.action==='begin'){
      if(!await service.personalLoginAttempt(digest('actor-link:'+primary.person_id+':'+input.email),digest(req.socket.remoteAddress??'')))return res.status(429).json({message:'Try again later'})
      const authenticated=await auth.authenticate('emailpass',{body:{email:input.email,password:input.password},headers:{},query:{},url:req.url,protocol:req.protocol})
      if(!authenticated.success||!authenticated.authIdentity||authenticated.authIdentity.id===primary.auth_identity_id)throw Error('Denied')
      const validated=await auth.validateAuthIdentity(authenticated.authIdentity.id,'emailpass',{})
      if(!validated.success||validated.authIdentity?.id!==authenticated.authIdentity.id)throw Error('Denied')
      const owner=await proof(req,authenticated.authIdentity.id,input.actor_type)
      const pending=await service.beginActorLink(token,owner,validated.mfaChallenge?.id??null)
      return pending?res.status(202).json(pending):res.status(403).json({message:'Access denied'})
    }
    const pending=await service.readActorLink(token,input.intent)
    if(!pending)return res.status(403).json({message:"Access denied"})
    if(pending.challenge_id){
      if(!input.code)throw Error('Denied')
      const challenge=await auth.verifyAuthMfaChallenge({id:pending.challenge_id,auth_identity_id:pending.auth_identity_id,method:'totp',code:input.code})
      if(!challenge.completed_at||challenge.auth_identity_id!==pending.auth_identity_id)throw Error('Denied')
    }else{
      const validated=await auth.validateAuthIdentity(pending.auth_identity_id,'emailpass',{})
      if(!validated.success||validated.authIdentity?.id!==pending.auth_identity_id||validated.mfaChallenge)throw Error('Denied')
    }
    const owner=await proof(req,pending.auth_identity_id,pending.actor_type)
    if(owner.actor_id!==pending.actor_id)throw Error('Denied')
    const result=await service.completeActorLink(token,input.intent,owner,pending.challenge_id)
    return result?res.status(201).json(result):res.status(403).json({message:"Access denied"})
  }catch{return res.status(403).json({message:'Account operation denied'})}
}
