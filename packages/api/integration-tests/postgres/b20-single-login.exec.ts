/** Option A/D4: genuine personal MFA, dual ownership, server-only Member adapter. */
import assert from 'node:assert/strict'
import {randomBytes,createHash,createDecipheriv} from 'node:crypto'
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {createServer as netServer} from 'node:net'
import {request} from 'node:https'
import {spawn,type ChildProcess} from 'node:child_process'
import {Client} from '@medusajs/framework/pg'
import {ApiLoader,expressLoader} from '@medusajs/framework/http'
import {B19Chrome,otp,until} from './b19-browser'

const TLS='D:/DogruAdres/.worktrees/m0-vertical-evidence-20261020-a7f1/chrome-recovery-tls-20261021'
const port=()=>new Promise<number>((resolve,reject)=>{const s=netServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const n=(s.address() as any).port;s.close(()=>resolve(n))})})

export default async function({container}:any){
  const dir=process.env.B20_DIR!,pg=new Client({connectionString:process.env.DATABASE_URL})
  const record=(name:string,value:unknown)=>writeFileSync(join(dir,name+'.json'),JSON.stringify(value,null,2),{flag:'wx'})
  const results:Record<string,unknown>={},privateHttp:Array<{path:string;status:number;serverBearer:boolean}>=[]
  const browsers:B19Chrome[]=[]
  let runtime:any,server:ReturnType<typeof createServer>|undefined,front:ChildProcess|undefined,log:number|undefined
  await pg.connect()
  const q=async(sql:string,args:any[]=[]) => (await pg.query(sql,args)).rows
  try{
    assert.equal((await q('select current_database() db'))[0].db,process.env.B20_DATABASE)
    assert.match((await q('select version() v'))[0].v,/PostgreSQL 16\./)
    const express=createRequire(require.resolve('@medusajs/framework'))('express'),app=express()
    app.use((req:any,res:any,next:any)=>{
      req.scope=container.createScope()
      const requestPath=req.path
      if(requestPath==='/vendor/members/me')res.on('finish',()=>privateHttp.push({path:requestPath,status:res.statusCode,serverBearer:!!req.headers.authorization}))
      next()
    })
    runtime=await expressLoader({app,container})
    await new ApiLoader({app,container,sourceDir:[join(dirname(require.resolve('@medusajs/medusa')),'api'),join(dirname(require.resolve('@mercurjs/core')),'api'),join(process.cwd(),'src/api')]}).load()
    server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r))
    const backend='http://127.0.0.1:'+(server.address() as any).port,publicPort=await port(),origin='https://127.0.0.1:'+publicPort
    Object.assign(process.env,{DOGRUADRES_PRIVATE_API:backend,DOGRUADRES_PUBLIC_ORIGIN:origin,DOGRUADRES_FRONTDOOR_PORT:String(publicPort),DOGRUADRES_TLS_CERT:join(TLS,'server.pem'),DOGRUADRES_TLS_KEY:join(TLS,'server-key.private.pem')})
    log=openSync(join(dir,'frontdoor.log'),'wx')
    front=spawn(process.execPath,['scripts/personal-frontdoor.mjs'],{cwd:process.cwd(),env:process.env,stdio:['ignore',log,log],windowsHide:true})
    const ca=readFileSync(join(TLS,'server.pem'))
    async function call(path:string,options:{method?:string;body?:unknown;cookie?:string;csrf?:string;headers?:Record<string,string>}={}){
      return new Promise<{status:number;body:any}>( (resolve,reject)=>{
        const r=request(origin+path,{ca,method:options.method??'GET',headers:{origin,...(options.body?{'content-type':'application/json'}:{}),...(options.cookie?{cookie:options.cookie}:{}),...(options.csrf?{'x-csrf-token':options.csrf}:{}),...options.headers}},res=>{
          let text='';res.on('data',b=>text+=b);res.on('end',()=>{try{resolve({status:res.statusCode!,body:JSON.parse(text)})}catch{reject(Error('Expected JSON response'))}})
        });r.setTimeout(15000,()=>r.destroy(Error('B20 HTTPS request timeout')));r.on('error',reject);if(options.body)r.write(JSON.stringify(options.body));r.end()
      })
    }
    await until(async()=>{try{return (await call('/personal/session')).status===401}catch{return false}},15000,'real frontdoor ready')
    const auth=container.resolve('auth'),f=container.resolve('dogruadresAccess'),sellers=container.resolve('seller')
    let enrolled=Math.floor(Date.now()/30000)
    async function identity(type:string,actorId:string,email:string){
      const password=randomBytes(32).toString('base64url'),r=await auth.register('emailpass',{body:{email,password}});assert.ok(r.success)
      await auth.updateAuthIdentities({id:r.authIdentity.id,app_metadata:{[type+'_id']:actorId}})
      const setup=await auth.startAuthMfa({auth_identity_id:r.authIdentity.id,provider:'totp',issuer:'B20 isolated dual proof'})
      await auth.verifyAuthMfa({id:setup.mfa.id,auth_identity_id:r.authIdentity.id,code:otp(setup.secret)})
      enrolled=Math.floor(Date.now()/30000)
      return {id:r.authIdentity.id,email,password,secret:setup.secret}
    }
    async function fixture(label:string){
      const suffix=randomBytes(6).toString('hex'),email='b20-'+label+'-'+suffix+'@example.invalid'
      const [user]=await container.resolve('user').createUsers([{email}]),primary=await identity('user',user.id,email)
      const [person]=await f.createPeople([{}])
      await f.createActorMappings([{actor_type:'user',actor_id:user.id,person_id:person.id,created_by_actor_type:'user',created_by_actor_id:user.id}])
      await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",[primary.id,person.id,user.id])
      const [member]=await sellers.createMembers([{email:'b20-member-'+suffix+'@example.invalid',is_active:true}]),secondary=await identity('member',member.id,member.email)
      const [seller]=await sellers.createSellers([{name:'B20 synthetic '+label,email:'b20-shop-'+suffix+'@example.invalid',currency_code:'eur',status:'open'}])
      await sellers.createSellerMembers([{seller_id:seller.id,member_id:member.id,is_owner:true}])
      const [org]=await f.createOrganizations([{name:'B20 organization '+label}]);await f.createMemberships([{organization_id:org.id,person_id:person.id,role:'member'}])
      return {primary,secondary,person:person.id,member:member.id,seller:seller.id,organization:org.id}
    }
    const a=await fixture('A'),b=await fixture('B')
    await q("update da_mfa_policy set platform_mode='required' where id='current'");await q("update da_session_policy set mfa_activated=true where id='current'")
    await until(async()=>Math.floor(Date.now()/30000)>enrolled,35000,'fresh primary and secondary TOTP')
    async function login(actor:typeof a,label:string){
      const chrome=new B19Chrome(origin,label);browsers.push(chrome);await chrome.start()
      await chrome.input('#login input[name=email]',actor.primary.email);await chrome.input('#login input[name=password]',actor.primary.password);await chrome.click('#login button')
      await chrome.wait("!document.getElementById('challenge').hidden")
      await chrome.input('#challenge input[name=code]',otp(actor.primary.secret));await chrome.click('#challenge button');await chrome.wait("!document.getElementById('workspace').hidden")
      const cookie='da_session='+await chrome.cookie(),csrf:string=await chrome.eval('csrf')
      assert.match(cookie,/^da_session=[A-Za-z0-9_-]{43}$/)
      const cookies=await chrome.send('Network.getCookies',{urls:[origin]})
      const opaque=cookies.cookies.find((c:any)=>c.name==='da_session')
      assert.ok(opaque?.httpOnly&&opaque?.secure&&opaque?.sameSite==='Strict')
      const me=await call('/personal/session',{cookie});assert.equal(me.body.person_id,actor.person)
      return {chrome,cookie,csrf}
    }
    const sa=await login(a,'B20 single-login A'),sb=await login(b,'B20 single-login B')
    const context=(seller:string)=>'/personal/contexts?type=member&seller='+seller
    assert.equal((await call(context(a.seller),{cookie:sa.cookie})).status,403)
    results['no-binding-denied']={status:'PASS',http:403}
    // Ownership is independently proved through the real existing UI, not a synthetic binding insert.
    for(const [actor,s] of [[a,sa],[b,sb]] as const){
      await s.chrome.input('#link-account input[name=email]',actor.secondary.email);await s.chrome.input('#link-account input[name=password]',actor.secondary.password);await s.chrome.click('#link-account button')
      await s.chrome.wait("!document.getElementById('link-confirm').hidden")
      await s.chrome.input('#link-confirm input[name=code]',otp(actor.secondary.secret));await s.chrome.click('#link-confirm button')
      await s.chrome.wait("document.getElementById('link-confirm').hidden && document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    }
    await sa.chrome.input('#seller input[name=seller]',a.seller);await sa.chrome.click('#seller button')
    await sa.chrome.wait("document.getElementById('status').textContent==='Satıcı erişimi doğrulandı'")
    const dto=await sa.chrome.eval("JSON.parse(document.getElementById('actor-result').textContent)")
    assert.deepEqual(Object.keys(dto).sort(),['actor_id','context','person_id','seller']);assert.equal(dto.person_id,a.person);assert.equal(dto.actor_id,a.member);assert.equal(dto.seller.id,a.seller)
    assert.ok(privateHttp.some(r=>r.status===200&&r.serverBearer))
    results['personal-mfa-to-native-member']={status:'PASS',dto,privateHttp:[...privateHttp]}
    await sa.chrome.screenshot(join(dir,'personal-native-member.png'))
    const bindings=await q("select b.id,b.person_id,b.actor_id,b.proof_reference,c.session_id,c.expires_at,(c.ciphertext is not null) encrypted from da_verified_actor_binding b join da_actor_credential c on c.binding_id=b.id where b.person_id=$1 and b.revoked_at is null",[a.person])
    assert.equal(bindings.length,1);assert.match(bindings[0].proof_reference,/^dual-proof:/);assert.equal(bindings[0].encrypted,true)
    const audit=await q("select a.action,a.actor_person_id,a.target_id,o.audit_event_id from da_audit_event a join da_security_outbox o on o.audit_event_id=a.id where a.target_id=$1",[bindings[0].id]);assert.equal(audit.length,1)
    results['durable-dual-proof-and-credential']={status:'PASS',bindings,audit}
    // A privileged test reads the encrypted server credential only in memory for replay negatives.
    const row=(await q('select ciphertext from da_actor_credential where binding_id=$1 and retired_at is null',[bindings[0].id]))[0]
    function decrypt(ciphertext:string){
      const [iv,tag,data]=ciphertext.split('.').map((p:string)=>Buffer.from(p,'base64url'))
      const dec=createDecipheriv('aes-256-gcm',createHash('sha256').update('native-credential:'+process.env.COOKIE_SECRET).digest(),iv);dec.setAuthTag(tag)
      return Buffer.concat([dec.update(data),dec.final()]).toString('utf8')
    }
    const held=decrypt(row.ciphertext)
    const {projectConfig:{http}}=container.resolve('configModule'),{generateJwtToken}=require('@medusajs/framework/utils')
    const raw=generateJwtToken({actor_id:a.member,actor_type:'member',auth_identity_id:a.secondary.id},{secret:http.jwtSecret,jwtOptions:http.jwtOptions})
    for(const path of ['/vendor/members/me','/vendor/sellers/me'])assert.equal((await fetch(backend+path,{headers:{authorization:'Bearer '+raw,'x-seller-id':a.seller}})).status,401)
    for(const path of ['/auth/member/emailpass','/auth/token/refresh','/vendor/members/me'])assert.equal((await call(path,{method:path==='/vendor/members/me'?'GET':'POST',body:path==='/vendor/members/me'?undefined:{}})).status,401)
    results['raw-bearer-and-public-native-denied']={status:'PASS',http:401}
    assert.equal((await call(context(b.seller),{cookie:sa.cookie})).status,403);assert.equal((await call(context(a.seller),{cookie:sb.cookie})).status,403)
    assert.equal((await call('/personal/organizations?id='+b.organization,{cookie:sa.cookie})).status,403)
    assert.equal((await call(context(a.seller)+'&person_id='+b.person,{cookie:sa.cookie})).status,400)
    assert.equal((await call(context('bad'),{cookie:sa.cookie})).status,400)
    results['foreign-person-seller-org-and-injection-denied']={status:'PASS'}
    await sellers.updateMembers([{id:a.member,is_active:false}]);assert.equal((await call(context(a.seller),{cookie:sa.cookie})).status,403);await sellers.updateMembers([{id:a.member,is_active:true}])
    await sellers.updateSellers([{id:a.seller,status:'suspended'}]);assert.equal((await call(context(a.seller),{cookie:sa.cookie})).status,403);await sellers.updateSellers([{id:a.seller,status:'open'}])
    results['inactive-member-and-seller-denied']={status:'PASS'}
    await sa.chrome.send('Page.navigate',{url:origin+'/personal'})
    await sa.chrome.wait("!!document.querySelector('#launcher-list li[data-id=vendor]')")
    sa.csrf=await sa.chrome.eval('csrf')
    assert.ok((await sa.chrome.eval("document.querySelector('#launcher-list li[data-id=vendor]').textContent")).includes('tek oturumla henüz kullanılamıyor'))
    const privacy=await sa.chrome.eval("({local:Object.keys(localStorage),session:Object.keys(sessionStorage),jwtInDom:/eyJ[A-Za-z0-9_-]+\\.eyJ/.test(document.body.innerText),vendorLinks:document.querySelectorAll('#launcher-list li[data-id=vendor] a').length})")
    assert.deepEqual(privacy.local,[]);assert.deepEqual(privacy.session,[]);assert.equal(privacy.jwtInDom,false)
    assert.equal(privacy.vendorLinks,0,'An unsupported native login must not be offered as a working single-login target')
    results['no-browser-actor-token']={status:'PASS',privacy}
    // Revoke binding through the approved existing endpoint; do not resurrect it.
    assert.equal((await call('/personal/links',{method:'POST',cookie:sa.cookie,csrf:sa.csrf,body:{action:'unlink',binding_id:bindings[0].id}})).status,200)
    assert.equal((await call(context(a.seller),{cookie:sa.cookie})).status,403)
    assert.equal((await fetch(backend+'/vendor/members/me',{headers:{authorization:'Bearer '+held,'x-seller-id':a.seller}})).status,401)
    const retired=await q('select b.revoked_at,c.retired_at from da_verified_actor_binding b join da_actor_credential c on c.binding_id=b.id where b.id=$1',[bindings[0].id]);assert.ok(retired.every(r=>r.revoked_at&&r.retired_at))
    results['binding-revoke-native-replay-denied']={status:'PASS',retired}
    const sessionHash=createHash('sha256').update(sb.cookie.slice('da_session='.length)).digest('hex')
    const lastWindow=Math.floor(Date.now()/30000)
    await until(async()=>Math.floor(Date.now()/30000)>lastWindow,35000,'fresh TOTP for independent lock session')
    const locked=await login(b,'B20 independent lock session')
    assert.equal((await call(context(b.seller),{cookie:locked.cookie})).status,200)
    const lockHash=createHash('sha256').update(locked.cookie.slice('da_session='.length)).digest('hex')
    const lockCredential=decrypt((await q('select ciphertext from da_actor_credential where session_id=$1 and retired_at is null',[lockHash]))[0].ciphertext)
    await locked.chrome.click('#session-lock');await locked.chrome.wait("!document.getElementById('login').hidden")
    const lockedDenied=await call(context(b.seller),{cookie:locked.cookie})
    assert.ok([401,403].includes(lockedDenied.status),'A locked session cannot return protected data')
    assert.equal((await q('select status from da_browser_session where id=$1',[lockHash]))[0].status,'revoked')
    for(const [path,method] of [['/vendor/members/me','GET'],['/auth/token/refresh','POST']])assert.equal((await fetch(backend+path,{method,headers:{authorization:'Bearer '+lockCredential,'x-seller-id':b.seller}})).status,401)
    results['locked-session-denied']={status:'PASS',http:lockedDenied.status,activeBindingRetained:true,nativeReplay:401}
    assert.equal((await call(context(b.seller),{cookie:sb.cookie})).status,200)
    // Stop this page's normal activity polling. Model a valid old session,
    // not activity before creation (which the policy correctly rejects as invalid).
    await sb.chrome.send('Page.navigate',{url:'about:blank'})
    const expiryCredential=decrypt((await q('select ciphertext from da_actor_credential where session_id=$1 and retired_at is null',[sessionHash]))[0].ciphertext)
    await q("update da_browser_session set created_at=clock_timestamp()-interval '2000 seconds',last_activity_at=clock_timestamp()-interval '1801 seconds' where id=$1",[sessionHash])
    const expiredDenied=await call(context(b.seller),{cookie:sb.cookie})
    assert.ok([401,403].includes(expiredDenied.status),'An expired session cannot return protected data')
    assert.equal((await q('select status from da_browser_session where id=$1',[sessionHash]))[0].status,'expired')
    assert.equal((await fetch(backend+'/vendor/members/me',{headers:{authorization:'Bearer '+expiryCredential,'x-seller-id':b.seller}})).status,401)
    await sb.chrome.send('Page.navigate',{url:origin+'/personal'});await sb.chrome.wait("!document.getElementById('login').hidden")
    results['expired-session-denied']={status:'PASS',http:expiredDenied.status,sql:'expired',nativeReplay:401,browser:'login required'}
    record('single-login-result',{head:process.env.B20_HEAD,status:'PASS',scope:'personal MFA + dual ownership + existing server-only native Member adapter; NOT full Vendor frontend',origin,backend,results,privateHttp,browserHttp:browsers.map(b=>b.http),fullB20:'BLOCKED - native Vendor frontend integration not established'})
  }catch(e){record('single-login-failure',{message:e instanceof Error?e.message:String(e),results,privateHttp,browserHttp:browsers.map(b=>b.http)});throw e}
  finally{
    await Promise.allSettled(browsers.map(b=>b.close()))
    if(front){front.kill();await until(async()=>front!.exitCode!==null||front!.signalCode!==null,10000,'owned frontdoor exit')}
    if(log!==undefined)closeSync(log)
    if(server?.listening)await new Promise<void>(r=>server!.close(()=>r()))
    if(runtime)await runtime.shutdown()
    await pg.end()
  }
}
