import type {ExecArgs,IAuthModuleService,IUserModuleService} from '@medusajs/framework/types'
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
export default async function({container}:ExecArgs){
  const u=new URL(process.env.DATABASE_URL??''),dir=process.env.M0_FIXTURE_EVIDENCE_DIR
  if(u.hostname!=='127.0.0.1'||u.port!=='55631'||u.pathname!=='/m0ssi_a7f1'||!dir||path.resolve(dir).startsWith(path.resolve(process.cwd())))throw Error('Wrong isolated target')
  const {password}=JSON.parse(await readFile(path.join(dir,'login.private.json'),'utf8'))
  const email=`unbound-${randomUUID()}@example.invalid`,users:IUserModuleService=container.resolve('user'),auth:IAuthModuleService=container.resolve('auth')
  const user=await users.createUsers({email})
  const r=await auth.register('emailpass',{body:{email,password}})
  if(!r.success||!r.authIdentity)throw Error('Synthetic registration failed')
  await auth.updateAuthIdentities({id:r.authIdentity.id,app_metadata:{user_id:user.id}})
  const verification=await auth.authenticate('emailpass',{body:{email,password}})
  if(!verification.success||verification.authIdentity?.app_metadata?.user_id!==user.id)throw Error('Synthetic ownership unverified')
  await writeFile(path.join(dir,'unbound.private.json'),JSON.stringify({email,actor_id:user.id}),{mode:0o600,flag:'wx'})
  console.log('Fresh genuine unbound actor prepared; no Person or login binding created')
}
