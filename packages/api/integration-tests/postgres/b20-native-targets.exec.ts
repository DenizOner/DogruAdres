/** Decisive B20 prerequisite: real session does not make native applications reachable. */
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {createServer,request} from 'node:https'
import {Client} from '@medusajs/framework/pg'
import {createPersonalHttpApp} from '../../src/scripts/personal-http-runtime'
import {B19Chrome,otp,until} from './b19-browser'

export default async function({container}:any){
  const dir=process.env.B20_DIR!,pg=new Client({connectionString:process.env.DATABASE_URL});await pg.connect()
  const q=async(sql:string,p:any[]=[]) => (await pg.query(sql,p)).rows
  assert.equal((await q('select current_database() db'))[0].db,process.env.B20_DATABASE)
  assert.match((await q('select version() v'))[0].v,/PostgreSQL 16\./)
  const dataDirectory=(await q('show data_directory'))[0].data_directory
  assert.equal(dataDirectory,'/var/lib/postgresql/data')
  const tls='D:/DogruAdres/.worktrees/m0-vertical-evidence-20261020-a7f1/chrome-recovery-tls-20261021'
  const cert=readFileSync(join(tls,'server.pem')),key=readFileSync(join(tls,'server-key.private.pem'))
  const app=await createPersonalHttpApp(container),server=createServer({cert,key,minVersion:'TLSv1.2'},app.app)
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
  const origin='https://127.0.0.1:'+(server.address() as any).port;process.env.DOGRUADRES_PUBLIC_ORIGIN=origin
  const chrome=new B19Chrome(origin,'B20 native-target preflight'),http:any[]=[]
  try{
    const f=container.resolve('dogruadresAccess'),auth=container.resolve('auth'),users=container.resolve('user')
    const email='b20-'+randomBytes(8).toString('hex')+'@example.invalid',password=randomBytes(32).toString('base64url')
    const [u]=await users.createUsers([{email}]),a=await auth.register('emailpass',{body:{email,password}});assert.ok(a.success)
    await auth.updateAuthIdentities({id:a.authIdentity.id,app_metadata:{user_id:u.id}})
    const [p]=await f.createPeople([{}]);await f.createActorMappings([{actor_type:'user',actor_id:u.id,person_id:p.id,created_by_actor_type:'user',created_by_actor_id:u.id}])
    await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",[a.authIdentity.id,p.id,u.id])
    const setup=await auth.startAuthMfa({auth_identity_id:a.authIdentity.id,provider:'totp',issuer:'B20 Disposable'})
    const enrollmentCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({id:setup.mfa.id,auth_identity_id:a.authIdentity.id,code:otp(setup.secret)})
    await q("update da_mfa_policy set platform_mode='required' where id='current'");await q("update da_session_policy set mfa_activated=true where id='current'")
    const [org]=await f.createOrganizations([{name:'B20 synthetic organization'}]);await f.createMemberships([{organization_id:org.id,person_id:p.id,role:'member'}])
    await until(async()=>Math.floor(Date.now()/30000)>enrollmentCounter,35000,'fresh native TOTP after enrollment')
    await chrome.start();await chrome.input('#login input[name=email]',email);await chrome.input('#login input[name=password]',password)
    await chrome.click('#login button');await chrome.wait("!document.getElementById('challenge').hidden")
    await chrome.input('#challenge input[name=code]',otp(setup.secret));await chrome.click('#challenge button');await chrome.wait("!document.getElementById('workspace').hidden")
    // Real Chrome fetches through the real native API middleware with its authenticated cookie.
    for(const path of ['/personal/session','/personal/organizations','/admin/users/me','/admin/products','/vendor/members/me','/vendor/products','/store/customers/me','/seller']){
      const result=await chrome.evalWithArg('async function(path){const r=await fetch(path,{credentials:"same-origin"});return {status:r.status}}',path)
      http.push({path,status:result.status})
      writeFileSync(join(dir,'http-observations.json'),JSON.stringify(http,null,2))
      // Store's native publishable-key validator precedes project middleware.
      assert.equal(result.status,path.startsWith('/personal/')?200:path==='/store/customers/me'?400:401)
    }
    const readback=await q("select s.person_id,s.status,b.actor_type from da_browser_session s join da_login_binding b on b.person_id=s.person_id where s.person_id=$1",[p.id]);assert.ok(readback.some(r=>r.status==='active'&&r.actor_type==='user'))
    await chrome.screenshot(join(dir,'native-targets-preflight.png'))
    writeFileSync(join(dir,'native-targets-result.json'),JSON.stringify({head:process.env.B20_HEAD,status:'ARCHITECTURE BLOCKED',nativeRuntime:true,postgres16:true,dataDirectory,chrome:true,origin,pid:process.pid,http,sessionReadback:readback,limitation:'Native API middleware probe, not full dashboard frontend acceptance. No two genuinely usable approved application targets were established; no entitlements invented. B20 interactions NOT TESTED.'},null,2),{flag:'wx'})
  }finally{await chrome.close();await new Promise<void>(r=>server.close(()=>r()));await app.close();await pg.end()}
}
