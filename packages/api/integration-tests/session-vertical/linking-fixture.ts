import type {ExecArgs,IAuthModuleService,IUserModuleService} from '@medusajs/framework/types'
import {Client} from '@medusajs/framework/pg'
import {randomBytes,randomUUID,createHmac} from 'node:crypto'
import {access,writeFile} from 'node:fs/promises'
import path from 'node:path'
import Foundation from '../../src/modules/dogruadres-access/service'
import {generateResetPasswordTokenWorkflow} from '@medusajs/core-flows'
function code(secret:string){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest();return ((h.readUInt32BE(h[h.length-1]&15)&0x7fffffff)%1000000).toString().padStart(6,'0')}
export default async function({container}:ExecArgs){
  const u=new URL(process.env.DATABASE_URL??''),dir=process.env.M0_FIXTURE_EVIDENCE_DIR
  if(u.hostname!=='127.0.0.1'||u.port!=='55631'||u.pathname!=='/m0ssi_a7f1'||!dir||path.resolve(dir).toLowerCase().startsWith(path.resolve(process.cwd()).toLowerCase()))throw Error('Wrong isolated target')
  const filename=process.env.M0_DUAL_FIXTURE_FILE??'dual-proof.private.json'
  if(!/^dual-proof(?:-[a-z0-9]+)?\.private\.json$/.test(filename))throw Error('Invalid task fixture filename')
  const target=path.join(dir,filename)
  try{await access(target);throw Error('Preserved fixture exists')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
  const auth:IAuthModuleService=container.resolve('auth'),users:IUserModuleService=container.resolve('user'),foundation:Foundation=container.resolve('dogruadresAccess'),seller:any=container.resolve('seller'),customer:any=container.resolve('customer')
  const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect()
  const fixtures:any[]=[],suffix=randomUUID().slice(0,8)
  for(const label of ['A','B']){
    const password=randomBytes(32).toString('base64url'),email=`dual-${label}-${suffix}@example.invalid`,user=await users.createUsers({email})
    async function identity(email:string,type:string,id:string,mfa:boolean){
      const registered=await auth.register('emailpass',{body:{email,password}});if(!registered.success||!registered.authIdentity)throw Error('Registration failed')
      await auth.updateAuthIdentities({id:registered.authIdentity.id,app_metadata:{[type+'_id']:id}})
      const verified=await auth.authenticate('emailpass',{body:{email,password}});if(!verified.success||verified.authIdentity?.app_metadata?.[type+'_id']!==id)throw Error('Native ownership failed')
      let secret:string|undefined
      if(mfa){const setup=await auth.startAuthMfa({auth_identity_id:registered.authIdentity.id,provider:'totp',issuer:'DogruAdres task dual proof'});if(!setup.secret)throw Error('No seed');secret=setup.secret;await auth.verifyAuthMfa({id:setup.mfa.id,auth_identity_id:registered.authIdentity.id,code:code(secret)})}
      return {email,password,id:registered.authIdentity.id,actor_id:id,secret}
    }
    const primary=await identity(email,'user',user.id,true),person=await foundation.createPeople({display_name:'Dual proof '+label+' '+suffix})
    await foundation.createActorMappings({actor_type:'user',actor_id:user.id,person_id:person.id,created_by_actor_type:'user',created_by_actor_id:user.id})
    await db.query(`insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())`,[primary.id,person.id,user.id])
    const member=await seller.createMembers({email:`dual-member-${label}-${suffix}@example.invalid`,is_active:true}),buyer=await customer.createCustomers({email:`dual-customer-${label}-${suffix}@example.invalid`,has_account:true})
    const memberIdentity=await identity(member.email,'member',member.id,true),customerIdentity=await identity(buyer.email,'customer',buyer.id,false)
    const shop=await seller.createSellers({name:`Dual Seller ${label} ${suffix}`,handle:`dual-${label.toLowerCase()}-${suffix}`,email:`dual-shop-${label}-${suffix}@example.invalid`,currency_code:'usd',status:'open'})
    await seller.createSellerMembers({seller_id:shop.id,member_id:member.id,is_owner:true})
    const org=await foundation.createOrganizations({name:`Dual Organization ${label} ${suffix}`,status:'active'})
    await foundation.createMemberships({organization_id:org.id,person_id:person.id,role:'owner',status:'active',protected_owner:true})
    fixtures.push({label,person_id:person.id,primary,member:memberIdentity,customer:customerIdentity,seller:shop.id,organization:org.id})
  }
  const racePassword=randomBytes(32).toString('base64url'),raceEmail=`dual-race-${suffix}@example.invalid`,raceActor=await customer.createCustomers({email:raceEmail,has_account:true})
  const registration=await auth.register('emailpass',{body:{email:raceEmail,password:racePassword}})
  if(!registration.success||!registration.authIdentity)throw Error('Race identity registration failed')
  await auth.updateAuthIdentities({id:registration.authIdentity.id,app_metadata:{customer_id:raceActor.id}})
  const verified=await auth.authenticate('emailpass',{body:{email:raceEmail,password:racePassword}})
  if(!verified.success||verified.authIdentity?.app_metadata?.customer_id!==raceActor.id)throw Error('Race ownership failed')
  const {projectConfig:{http}}=container.resolve('configModule')
  const reset=await generateResetPasswordTokenWorkflow(container).run({input:{entityId:raceEmail,actorType:'customer',provider:'emailpass',secret:http.jwtSecret,jwtOptions:http.jwtOptions}})
  const race={email:raceEmail,password:racePassword,actor_id:raceActor.id,id:registration.authIdentity.id,reset_token:reset.result,changed_password:randomBytes(32).toString('base64url')}
  await writeFile(target,JSON.stringify({fixtures,race}),{mode:0o600,flag:'wx'});await db.end();console.log('Two fresh Persons and independent existing native actor accounts prepared; no secondary Person binding written')
}
