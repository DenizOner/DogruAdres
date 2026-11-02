import type {ExecArgs,IAuthModuleService} from '@medusajs/framework/types'
import {Client} from '@medusajs/framework/pg'
import {readFile,writeFile,access} from 'node:fs/promises'
import {randomUUID,randomBytes} from 'node:crypto'
import path from 'node:path'
import Foundation from '../../src/modules/dogruadres-access/service'
/** Task-only principals via public module APIs; project bindings are explicit,
 * never inferred from equal email. Not a production linking/bootstrap API. */
export default async function({container}:ExecArgs){
  const url=new URL(process.env.DATABASE_URL??''),dir=process.env.M0_FIXTURE_EVIDENCE_DIR
  if(url.hostname!=='127.0.0.1'||url.port!=='55631'||url.pathname!=='/m0ssi_a7f1'||!dir||path.resolve(dir).startsWith(path.resolve(process.cwd())))throw Error('Wrong task environment')
  const target=path.join(dir,'contexts.private.json')
  try{await access(target);throw Error('Preserved context fixtures exist; reuse them')}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e}
  const credentials=JSON.parse(await readFile(path.join(dir,'login.private.json'),'utf8'))
  const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect()
  const auth:IAuthModuleService=container.resolve('auth'),foundation:Foundation=container.resolve('dogruadresAccess'),seller:any=container.resolve('seller'),customer:any=container.resolve('customer')
  const primary=(await db.query(`select b.person_id,b.actor_id from da_login_binding b where b.person_id=$1 and b.revoked_at is null`,['daprs_m0ssi_a7f1'])).rows[0]
  if(!primary)throw Error('Primary fixture absent')
  const outsider=await auth.authenticate('emailpass',{body:{email:'m0ssi-adversary-a7f1@example.invalid',password:credentials.password}})
  if(!outsider.success||!outsider.authIdentity?.app_metadata?.user_id)throw Error('Synthetic ordinary ownership unverified')
  const ordinaryActor=String(outsider.authIdentity.app_metadata.user_id),person=await foundation.resolvePersonForActor({actor_type:'user',actor_id:ordinaryActor})
  if(!person)throw Error('Ordinary canonical Person absent')
  await db.query(`insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now()) on conflict(auth_identity_id) do nothing`,[outsider.authIdentity.id,person.id,ordinaryActor])
  const suffix=randomUUID().slice(0,8),password=randomBytes(32).toString('base64url')
  const member=await seller.createMembers({email:`member-${suffix}@example.invalid`,first_name:'Synthetic',is_active:true})
  const buyer=await customer.createCustomers({email:`customer-${suffix}@example.invalid`,first_name:'Synthetic',has_account:true})
  for(const [type,actor,email] of [['member',member,member.email],['customer',buyer,buyer.email]] as const){
    const registered=await auth.register('emailpass',{body:{email,password}})
    if(!registered.success||!registered.authIdentity)throw Error('Native identity registration failed')
    await auth.updateAuthIdentities({id:registered.authIdentity.id,app_metadata:{[type+'_id']:actor.id}})
    const verified=await auth.authenticate('emailpass',{body:{email,password}})
    if(!verified.success||verified.authIdentity?.app_metadata?.[type+'_id']!==actor.id)throw Error('Actor ownership verification failed')
    await foundation.createActorMappings({actor_type:type,actor_id:actor.id,person_id:primary.person_id,created_by_actor_type:'user',created_by_actor_id:primary.actor_id})
    await db.query(`insert into da_verified_actor_binding(id,person_id,auth_identity_id,actor_type,actor_id,verified_at,proof_reference) values($1,$2,$3,$4,$5,now(),$6)`,['dabind_'+randomUUID(),primary.person_id,registered.authIdentity.id,type,actor.id,'explicit-synthetic-owner-proof:'+suffix])
  }
  const a=await seller.createSellers({name:'Seller A '+suffix,handle:'seller-a-'+suffix,email:`seller-a-${suffix}@example.invalid`,currency_code:'usd',status:'open'})
  const b=await seller.createSellers({name:'Seller B '+suffix,handle:'seller-b-'+suffix,email:`seller-b-${suffix}@example.invalid`,currency_code:'usd',status:'open'})
  await seller.createSellerMembers({seller_id:a.id,member_id:member.id,is_owner:true})
  const foreign=await seller.createMembers({email:`foreign-${suffix}@example.invalid`,is_active:true})
  await seller.createSellerMembers({seller_id:b.id,member_id:foreign.id,is_owner:true})
  const orgs:Array<{id:string;name:string;owner:string;target:string}>=[]
  for(const name of ['XYZ','ABC']){
    const organization=await foundation.createOrganizations({name:`${name} browser ${suffix}`,status:'active'})
    const owner=await foundation.createMemberships({organization_id:organization.id,person_id:primary.person_id,role:'owner',protected_owner:true,status:'active'})
    const targetMembership=await foundation.createMemberships({organization_id:organization.id,person_id:person.id,role:name==='XYZ'?'member':'owner',protected_owner:name!=='XYZ',status:'active'})
    orgs.push({id:organization.id,name:organization.name,owner:owner.id,target:targetMembership.id})
  }
  const pk=(await db.query(`select token from api_key where type='publishable' and deleted_at is null limit 1`)).rows[0]?.token
  await writeFile(target,JSON.stringify({person_id:primary.person_id,primary_actor:primary.actor_id,ordinary_person:person.id,ordinary_actor:ordinaryActor,ordinary_email:'m0ssi-adversary-a7f1@example.invalid',member:member.id,customer:buyer.id,sellerA:a.id,sellerB:b.id,orgs,publishableKey:pk}),{mode:0o600,flag:'wx'})
  await db.end();console.log('Genuine Member/Customer, two Sellers and two Organization scopes prepared; fixture retained privately')
}
