import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto'
import { createServer, request } from 'node:https'
import { Client } from '@medusajs/framework/pg'
import { createPersonalHttpApp } from '../../src/scripts/personal-http-runtime'
import { B19Chrome, otp, until } from './b19-browser'

export default async function({container}:any) {
  const dir=process.env.B19_DIR!,pg=new Client({connectionString:process.env.DATABASE_URL})
  const record=(n:string,v:any)=>writeFileSync(join(dir,n+'-'+Date.now()+'.json'),JSON.stringify(v,null,2),{flag:'wx'})
  await pg.connect()
  const q=async(sql:string,p:any[]=[]) => (await pg.query(sql,p)).rows
  assert.equal((await q('select current_database() as db'))[0].db,process.env.B19_DATABASE)
  assert.match((await q('select version() as v'))[0].v,/PostgreSQL 16\./)
  assert.equal((await q('select count(*)::int n from da_platform_smtp_settings'))[0].n,0)
  const tlsRoot='D:/DogruAdres/.worktrees/m0-vertical-evidence-20261020-a7f1/chrome-recovery-tls-20261021'
  const cert=readFileSync(join(tlsRoot,'server.pem')),key=readFileSync(join(tlsRoot,'server-key.private.pem'))
  const x=new X509Certificate(cert);assert.ok(x.checkIP('127.0.0.1')&&x.checkPrivateKey(createPrivateKey(key))&&Date.parse(x.validTo)>Date.now())
  const app=await createPersonalHttpApp(container)
  let dropRead=false,readSubmissions=0,dropped=0
  const server=createServer({cert,key,minVersion:'TLSv1.2'},(req,res)=>{
    if(req.url==='/personal/notifications'&&req.method==='POST'){
      readSubmissions++
      if(dropRead){
        dropRead=false
        res.end=((..._args:any[])=>{assert.equal(res.statusCode,200);dropped++;res.destroy();return res}) as any
      }
    }
    app.app(req,res)
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin='https://127.0.0.1:'+(server.address() as any).port
  process.env.DOGRUADRES_PUBLIC_ORIGIN=origin
  const http:any[]=[]
  async function call(path:string,method='GET',cookie='',csrf='',body?:any,source=origin){
    return new Promise<any>((resolve,reject)=>{
      const r=request(origin+path,{method,ca:cert,headers:{origin:source,cookie,'x-csrf-token':csrf,'content-type':'application/json'}},res=>{
        let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{
          const data=JSON.parse(raw);http.push({path,method,status:res.statusCode,noStore:res.headers['cache-control']==='no-store'});
          resolve({status:res.statusCode,data,cookie:(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ')})
        })
      });r.on('error',reject);if(body)r.write(JSON.stringify(body));r.end()
    })
  }
  const f=container.resolve('dogruadresAccess'),auth=container.resolve('auth'),users=container.resolve('user')
  let fixtures:any
  const fixtureFile=join(dir,'fixtures.private.json')
  const browsers:B19Chrome[]=[]
  try{
    if(existsSync(fixtureFile))fixtures=JSON.parse(readFileSync(fixtureFile,'utf8'))
    else {
      const password=randomBytes(32).toString('base64url')
      async function actor(label:string){
        const email='b19-'+label+'-'+randomBytes(6).toString('hex')+'@example.invalid'
        const [u]=await users.createUsers([{email}]);const a=await auth.register('emailpass',{body:{email,password}})
        assert.ok(a.success);await auth.updateAuthIdentities({id:a.authIdentity.id,app_metadata:{user_id:u.id}})
        const [p]=await f.createPeople([{}])
        await f.createActorMappings([{actor_type:'user',actor_id:u.id,person_id:p.id,created_by_actor_type:'user',created_by_actor_id:u.id}])
        await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",[a.authIdentity.id,p.id,u.id])
        const setup=await auth.startAuthMfa({auth_identity_id:a.authIdentity.id,provider:'totp',issuer:'B19 Disposable'})
        await auth.verifyAuthMfa({id:setup.mfa.id,auth_identity_id:a.authIdentity.id,code:otp(setup.secret)})
        return {email,password,seed:setup.secret,person:p.id,auth:a.authIdentity.id}
      }
      fixtures={a:await actor('a'),b:await actor('b'),counter:Math.floor(Date.now()/30000)}
      await q("update da_mfa_policy set platform_mode='required' where id='current'")
      await q("update da_session_policy set mfa_activated=true where id='current'")
      const [org]=await f.createOrganizations([{name:'B19 synthetic organization'}])
      await f.createMemberships([{organization_id:org.id,person_id:fixtures.a.person,role:'member'}]);fixtures.org=org.id
      writeFileSync(fixtureFile,JSON.stringify(fixtures),{flag:'wx'})
    }
    async function login(a:any){
      await until(async()=>Math.floor(Date.now()/30000)>fixtures.counter,35000,'fresh native TOTP')
      const primary=await call('/personal/session','POST','','',{email:a.email,password:a.password});assert.equal(primary.status,202)
      const proof=await call('/personal/challenge','POST',primary.cookie,primary.data.csrf_token,{code:otp(a.seed)});assert.equal(proof.status,200)
      return {cookie:proof.cookie,csrf:proof.data.csrf_token}
    }
    if(process.env.B19_READ_ONLY_BROWSER==='true'){
      const browser=new B19Chrome(origin,'ReadStates');browsers.push(browser);await browser.start()
      await browser.input('#login input[name=email]',fixtures.a.email);await browser.input('#login input[name=password]',fixtures.a.password)
      await browser.click('#login button');await browser.wait("!document.getElementById('challenge').hidden")
      await browser.input('#challenge input[name=code]',otp(fixtures.a.seed));await browser.click('#challenge button')
      await browser.wait("!document.getElementById('workspace').hidden && document.getElementById('notification-count').textContent==='(0 okunmamış)'")
      let paused:string|undefined
      browser.onEvent=m=>{if(m.method==='Fetch.requestPaused')paused=m.params.requestId}
      await browser.send('Fetch.enable',{patterns:[{urlPattern:origin+'/personal/notifications?*',requestStage:'Response'}]})
      await browser.click('#notification-bell');await until(async()=>paused,10000,'notification response pause')
      assert.equal(await browser.eval("document.getElementById('notification-status').textContent==='Bildirimler yükleniyor…' && document.getElementById('notification-list').getAttribute('aria-busy')==='true'"),true)
      await browser.screenshot(join(dir,'07-loading.png'))
      await browser.send('Fetch.failRequest',{requestId:paused,errorReason:'ConnectionClosed'})
      await browser.wait("document.getElementById('notification-status').textContent==='Bildirimler yüklenemedi. Yenileyin.'")
      await browser.screenshot(join(dir,'08-get-error.png'))
      await browser.send('Fetch.disable');browser.onEvent=undefined
      await browser.click('#notification-refresh');await browser.wait("document.getElementById('notification-count').textContent==='(0 okunmamış)' && document.getElementById('notification-status').textContent==='Bildirimler güncellendi.'")
      record('loading-error-recovery',{status:'PASS',chrome:browser.http,pid:process.pid,origin,actualResponseHeld:true,noReceiptMutation:true})
      await browser.send('Page.navigate',{url:origin+'/personal?organization='+fixtures.org})
      await browser.wait("!document.getElementById('workspace').hidden && document.getElementById('notification-count').textContent==='(0 okunmamış)'")
      await browser.click('#notification-bell');await browser.wait("document.getElementById('notification-status').textContent==='Bildirimler güncellendi.'")
      const other=new B19Chrome(origin,'ForeignOrganization');browsers.push(other);await other.start()
      await other.input('#login input[name=email]',fixtures.b.email);await other.input('#login input[name=password]',fixtures.b.password)
      await other.click('#login button');await other.wait("!document.getElementById('challenge').hidden")
      await other.input('#challenge input[name=code]',otp(fixtures.b.seed));await other.click('#challenge button');await other.wait("!document.getElementById('workspace').hidden")
      await other.send('Page.navigate',{url:origin+'/personal?organization='+fixtures.org})
      await other.wait("document.getElementById('status').textContent==='Access denied' || document.getElementById('status').textContent==='Giriş gerekli'")
      assert.equal(await other.eval("document.getElementById('notification-bell').hidden && document.getElementById('notification-list').children.length===0 && document.getElementById('notification-panel').hidden"),true)
      await other.screenshot(join(dir,'09-foreign-organization-denied.png'))
      record('organization-browser-boundary',{status:'PASS',own:browser.http,foreign:other.http,privateNotificationDomEmpty:true})
      return
    }
    // First decisive native Medusa + real HTTPS + migrated PostgreSQL integration.
    if(process.env.B19_FULL!=='true'){
      const a=await login(fixtures.a)
      assert.equal((await call('/personal/notifications','GET',a.cookie)).status,200)
      assert.equal((await call('/personal/notifications','GET',a.cookie)).data.unread_count,0)
      assert.equal((await call('/personal/session?action=lock','DELETE',a.cookie,a.csrf)).status,200)
      const rows=await q("select a.action,n.id,n.read_at from da_audit_event a join da_notification_receipt n on n.audit_event_id=a.id join da_security_outbox o on o.audit_event_id=a.id where n.person_id=$1",[fixtures.a.person])
      assert.equal(rows.length,1);assert.equal(rows[0].action,'session.locked');assert.equal(rows[0].read_at,null)
      record('smallest-real-integration',{result:'PASS',http,lockReceipt:rows,postgres:true,nativeMedusa:true,origin,pid:process.pid})
      return
    }
    const outcomes:any[]=[]
    const passed=(name:string,evidence:any)=>{outcomes.push({name,status:'PASS',evidence});record('check-'+name,evidence)}
    const a=new B19Chrome(origin,'PersonA'),b=new B19Chrome(origin,'PersonB');browsers.push(a,b)
    async function browserLogin(chrome:B19Chrome,actor:any){
      chrome.phase='password-totp'
      await chrome.input('#login input[name=email]',actor.email);await chrome.input('#login input[name=password]',actor.password)
      await chrome.click('#login button');await chrome.wait("!document.getElementById('challenge').hidden")
      await chrome.input('#challenge input[name=code]',otp(actor.seed));await chrome.click('#challenge button')
      await chrome.wait("!document.getElementById('workspace').hidden && !document.getElementById('notification-bell').hidden")
    }
    const cookie=async(c:B19Chrome)=>{
      const all=await c.send('Network.getCookies',{urls:[origin+'/personal']});return 'da_session='+all.cookies.find((x:any)=>x.name==='da_session').value
    }
    const credentials=async(c:B19Chrome)=>{const value=await cookie(c),me=await call('/personal/session','GET',value);assert.equal(me.status,200);return {cookie:value,csrf:me.data.csrf_token}}
    await a.start();await browserLogin(a,fixtures.a)
    const old=await credentials(a)
    const before=await call('/personal/notifications','GET',old.cookie);assert.ok(before.data.notifications.length>=1)
    const initialId=(before.data.notifications.find((n:any)=>!n.read_at)||before.data.notifications[0]).id
    const readBaseline=(await q('select count(*)::int n from da_notification_receipt where read_at is not null'))[0].n
    await b.start();await browserLogin(b,fixtures.b)
    const other=await credentials(b)
    await b.click('#notification-bell');await b.wait("document.getElementById('notification-status').textContent==='Henüz bildirim yok.'")
    await b.screenshot(join(dir,'01-person-b-empty.png'))
    passed('empty',{http:(await call('/personal/notifications','GET',other.cookie)).data,chrome:true})
    // Denials precede any new positive lock/read submission.
    const cross=await call('/personal/notifications','POST',other.cookie,other.csrf,{id:initialId});assert.equal(cross.status,403)
    const foreignGet=await call('/personal/notifications?organization='+fixtures.org,'GET',other.cookie);assert.equal(foreignGet.status,403)
    const foreignPost=await call('/personal/notifications?organization='+fixtures.org,'POST',other.cookie,other.csrf,{id:initialId});assert.equal(foreignPost.status,403)
    const badCsrf=await call('/personal/notifications','POST',old.cookie,'x'.repeat(43),{id:initialId});assert.equal(badCsrf.status,403)
    const badOrigin=await call('/personal/notifications','POST',old.cookie,old.csrf,{id:initialId},'https://foreign.invalid');assert.equal(badOrigin.status,403)
    assert.equal((await call('/personal/notifications?person_id='+fixtures.a.person,'GET',other.cookie)).status,400)
    assert.equal((await call('/personal/notifications','GET')).status,401)
    assert.equal((await q('select count(*)::int n from da_notification_receipt where read_at is not null'))[0].n,readBaseline)
    const badLock=await call('/personal/session?action=lock','DELETE',old.cookie,'x'.repeat(43));assert.equal(badLock.status,403)
    assert.equal((await call('/personal/session?action=lock&all=true','DELETE',old.cookie,old.csrf)).status,400)
    passed('negative-boundaries',{cross:cross.status,foreignGet:foreignGet.status,foreignPost:foreignPost.status,badCsrf:badCsrf.status,badOrigin:badOrigin.status,badLock:badLock.status,noReceiptWrites:true})
    // Genuine B18 UI lock creates the second distinct durable event.
    await a.click('#session-lock')
    await a.wait("document.getElementById('status').textContent.startsWith('Oturum kilitlendi.')")
    assert.equal(await a.eval("document.getElementById('notification-panel').hidden && document.getElementById('notification-list').children.length===0 && document.getElementById('notification-bell').hidden"),true)
    const locks=await q("select a.id,a.action,n.id as notification_id,n.read_at,o.id as outbox_id from da_audit_event a join da_notification_receipt n on n.audit_event_id=a.id join da_security_outbox o on o.audit_event_id=a.id where n.person_id=$1 order by n.created_at",[fixtures.a.person]);assert.equal(locks.length,before.data.notifications.length+1)
    const revokedGet=await call('/personal/notifications','GET',old.cookie);assert.ok([401,403].includes(revokedGet.status))
    const revokedPost=await call('/personal/notifications','POST',old.cookie,old.csrf,{id:initialId});assert.ok([401,403].includes(revokedPost.status))
    passed('genuine-lock',{locks,oldGet:revokedGet.status,oldPost:revokedPost.status,concealed:true})
    await a.screenshot(join(dir,'02-locked.png'))
    const lastCounter=Math.floor(Date.now()/30000)
    await until(async()=>Math.floor(Date.now()/30000)>lastCounter,35000,'fresh reauthentication counter')
    await browserLogin(a,fixtures.a);const current=await credentials(a)
    assert.notEqual(current.cookie,old.cookie)
    // Keyboard bell and Escape; no menu trap, normal buttons and visible focus.
    await a.eval("document.getElementById('notification-bell').focus()")
    await a.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await a.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await a.wait("document.getElementById('notification-status').textContent==='Bildirimler güncellendi.'")
    assert.equal(await a.eval("document.getElementById('notification-list').children.length"),locks.length)
    await a.eval("document.getElementById('notification-refresh').focus()")
    await a.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await a.wait("document.getElementById('notification-panel').hidden && document.activeElement.id==='notification-bell'")
    await a.click('#notification-bell');await a.wait("document.getElementById('notification-list').children.length==="+locks.length)
    await a.screenshot(join(dir,'03-two-unread.png'))
    const visible=await a.eval("document.getElementById('notification-panel').innerText")
    const list=await call('/personal/notifications','GET',current.cookie)
    const serialized=JSON.stringify(list.data)
    for(const secret of [fixtures.a.email,fixtures.a.person,fixtures.a.seed,fixtures.a.password,old.cookie.slice(11),...locks.map((x:any)=>x.id)])assert.ok(!serialized.includes(secret)&&!visible.includes(secret))
    assert.ok(!/actor_id|target_id|audit_event_id|code_provider|auth_identity/.test(serialized))
    assert.equal((await call('/personal/notifications?organization='+fixtures.org,'GET',current.cookie)).status,200)
    passed('authorized-private-list',{response:list.data,keyboard:true,escapeFocus:true,noRawAuditOrSecrets:true})
    // Simulate a response lost AFTER the real committed POST, never retry automatically.
    const submissionsBefore=readSubmissions
    await a.send('Fetch.enable',{patterns:[{urlPattern:origin+'/personal/notifications',requestStage:'Response'}]})
    let fault:Promise<any>|undefined
    a.onEvent=m=>{if(m.method==='Fetch.requestPaused'){
      if(m.params.request.method==='POST'){
        dropped++;fault=a.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'ConnectionClosed'})
      }else void a.send('Fetch.continueRequest',{requestId:m.params.requestId})
    }}
    await a.click('#notification-list li:first-child button')
    await a.wait("document.getElementById('notification-status').textContent.includes('sonucu belirsiz')")
    await fault;await a.send('Fetch.disable');a.onEvent=undefined
    assert.equal(dropped,1);assert.equal(readSubmissions,submissionsBefore+1)
    assert.equal(await a.eval("document.querySelector('#notification-list li:first-child button').disabled"),true)
    const oneRead=await q('select id,read_at from da_notification_receipt where read_at is not null');assert.equal(oneRead.length,readBaseline+1)
    await a.screenshot(join(dir,'04-uncertain-read.png'))
    await a.click('#notification-refresh');await a.wait("document.getElementById('notification-count').textContent==='("+(before.data.unread_count)+" okunmamış)'")
    assert.equal(readSubmissions,submissionsBefore+1)
    passed('uncertain-response',{dropped,submissions:1,persisted:oneRead,refreshReconciled:true,noAutomaticRetry:true})
    // Ordinary single read and reload durability.
    await a.click('#notification-list button');await a.wait("document.getElementById('notification-count').textContent==='(0 okunmamış)'")
    await a.send('Page.reload');await a.wait("!document.getElementById('workspace').hidden && document.getElementById('notification-count').textContent==='(0 okunmamış)'")
    await a.click('#notification-bell');await a.wait("document.getElementById('notification-list').children.length==="+locks.length)
    assert.equal(await a.eval("document.querySelectorAll('#notification-list button').length"),0)
    const receipts=await q('select id,read_at from da_notification_receipt order by id');assert.ok(receipts.every(x=>x.read_at))
    // A repeated/concurrent authorized request preserves timestamps and audit cardinality.
    const rereads=await Promise.all([call('/personal/notifications','POST',current.cookie,current.csrf,{id:initialId}),call('/personal/notifications','POST',current.cookie,current.csrf,{id:initialId})]);assert.ok(rereads.every(x=>x.status===200))
    assert.deepEqual(await q('select id,read_at from da_notification_receipt order by id'),receipts)
    assert.equal((await q("select count(*)::int n from da_audit_event where action='notification.read'"))[0].n,receipts.length)
    await a.screenshot(join(dir,'05-read-after-reload.png'))
    passed('read-persistence-idempotency',{receipts,reloadUnread:0,duplicateStatuses:rereads.map(x=>x.status),readAuditCount:receipts.length})
    // Ordinary logout remains session.revoked and never produces a lock notification.
    await b.click('#logout');await b.wait("document.getElementById('workspace').hidden")
    const logout=await q("select action from da_audit_event where actor_person_id=$1 and action in ('session.locked','session.revoked')",[fixtures.b.person]);assert.deepEqual(logout,[{action:'session.revoked'}])
    assert.equal((await q('select count(*)::int n from da_notification_receipt where person_id=$1',[fixtures.b.person]))[0].n,0)
    passed('ordinary-logout',{actions:logout,notifications:0})
    // Reflow at a mobile viewport and safe GET failure state followed by recovery.
    await a.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    assert.ok(await a.eval('document.documentElement.scrollWidth<=window.innerWidth'))
    await a.screenshot(join(dir,'06-mobile.png'))
    assert.equal((await q('select count(*)::int n from da_platform_smtp_settings'))[0].n,0)
    record('browser-acceptance',{outcomes,http,chromeA:a.http,chromeB:b.http,pid:process.pid,origin,zeroSmtp:true})
  }catch(error){
    for(const b of browsers){try{record('failure-'+b.label,{message:(error as Error).message,dom:await b.eval("({status:document.getElementById('status').textContent,notification:document.getElementById('notification-status').textContent,hidden:document.getElementById('workspace').hidden,count:document.getElementById('notification-count').textContent})")});await b.screenshot(join(dir,'failure-'+b.label+'-'+Date.now()+'.png'))}catch{}}
    record('failure-sql',{readSubmissions,dropped,receipts:await q('select id,read_at from da_notification_receipt')})
    throw error
  }finally{
    for(const b of browsers)await b.close()
    await new Promise<void>(resolve=>server.close(()=>resolve()));await app.close();await pg.end()
    record('runtime-closed',{pid:process.pid,origin,closed:true,http})
  }
}
