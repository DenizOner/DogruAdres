/** #189/6427613125. SYNTHETIC TEST BINDING — NOT RECIPIENT OWNERSHIP PROOF. */
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {createServer,request} from 'node:https'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Client} from '@medusajs/framework/pg'
import type {ExecArgs,IAuthModuleService,IUserModuleService} from '@medusajs/framework/types'
import Foundation from '../../src/modules/dogruadres-access/service'
import {IdentitySessions} from '../../src/modules/dogruadres-access/identity-session'
import {createPersonalHttpApp} from '../../src/scripts/personal-http-runtime'
import {B06Chrome} from './b07-ui-browser'
import {until} from './native-verification-browser'

export default async function({container}:ExecArgs){
 const u=new URL(process.env.DATABASE_URL??'postgres://invalid/invalid')
 assert.ok(process.env.CI==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.B06_UI_DISPATCH_SCOPE==='b07-ui'&&process.env.PG_MFA_TEST_SCOPE==='b07-ui'&&process.env.PG_MFA_TEST_SENTINEL==='mfa-pg16-disposable-ci-v1'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.username==='mfa_test'&&u.password==='ci-disposable-only-not-a-real-secret'&&/^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname)&&process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1),'REFUSED: exact B07 disposable dispatch boundary')
 const pg=new Client({connectionString:u.toString()});await pg.connect()
 const q=async(sql:string,args:any[]=[]) => (await pg.query(sql,args)).rows
 const count=async(t:string)=>Number((await q(`select count(*)::int n from "${t}"`))[0].n)
 const auth:IAuthModuleService=container.resolve('auth'),users:IUserModuleService=container.resolve('user'),f:Foundation=container.resolve('dogruadresAccess')
 if(process.env.B06_PREPARE==='true'){
  try{
   for(const t of ['da_person','user','auth_identity','provider_identity','da_actor_mapping','da_login_binding','da_organization','da_organization_membership','auth_mfa_factor','da_browser_session','da_platform_staff_grant'])assert.equal(await count(t),0,'Nonempty fixture table '+t)
   for(const label of ['A','B']){
    const email=process.env['B06_EMAIL_'+label]!,password=process.env['B06_PASSWORD_'+label]!
    assert.match(email,/^b07-[ab]-[a-f0-9]+@example.invalid$/);assert.ok(password.length>=40)
    const user=await users.createUsers({email}),r=await auth.register('emailpass',{body:{email,password}});assert.ok(r.success&&r.authIdentity)
    await auth.updateAuthIdentities({id:r.authIdentity!.id,app_metadata:{user_id:user.id}})
    const [person]=await f.createPeople([{}])
    await f.createActorMappings([{actor_type:'user',actor_id:user.id,person_id:person.id,created_by_actor_type:'user',created_by_actor_id:user.id}])
    // Explicitly authorized test fixture only. Never a production recipient proof.
    await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",[r.authIdentity!.id,person.id,user.id])
   }
   // Only disposable policy fixture configuration. Actual latch transition uses existing R1 service.
   await q("insert into da_mfa_policy(id,platform_mode,version) values('current','required',0)")
   console.log('PASS B07 synthetic setup: two native users/identities/Persons/bindings; NOT RECIPIENT OWNERSHIP PROOF')
  }finally{await pg.end()}
  return
 }
 const report:any={scope:'B07 REAL CHROME / NATIVE HTTP / PG16',binding:'SYNTHETIC TEST BINDING — NOT RECIPIENT OWNERSHIP PROOF',run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,checks:[],browsers:[],cleanup:{},status:'INCOMPLETE'}
 const output=process.env.B06_EVIDENCE_DIR!;assert.ok(output&&output.startsWith(process.env.RUNNER_TEMP!+'/'));mkdirSync(output,{recursive:true})
 const temp=mkdtempSync(join(tmpdir(),'b07-tls-')),browsers:B06Chrome[]=[]
 let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined,server:ReturnType<typeof createServer>|undefined
 const challenges:any[]=[]
 const original=auth.verifyAuthMfaChallenge.bind(auth)
 auth.verifyAuthMfaChallenge=async function(input:any){const r=await original(input);challenges.push({identity:r.auth_identity_id,id:r.id,completed:r.completed_at});return r}
 try{
  assert.match((await q('show server_version_num'))[0].server_version_num,/^16\d{4}$/)
  assert.equal((await q("select mfa_activated from da_session_policy where id='current'"))[0].mfa_activated,true)
  const actors:any[]=[]
  for(const label of ['A','B']){const rows=await q("select u.id actor,b.person_id person,b.auth_identity_id identity from public.user u join da_login_binding b on b.actor_id=u.id and b.actor_type='user' where u.email=$1 and b.verified_at is not null",[process.env['B06_EMAIL_'+label]]);assert.equal(rows.length,1);actors.push(rows[0])}
  const orgs=await f.createOrganizations([{name:'B07 Org1',status:'active'},{name:'B07 Org2',status:'active'}])
  const members=await f.createMemberships(orgs.flatMap(o=>actors.map((a,i)=>({organization_id:o.id,person_id:a.person,role:i===0?'owner' as const:'member' as const,status:'active' as const,protected_owner:i===0}))))
  const [owner1,b1,owner2,b2]=members
  const cert=join(temp,'ca.pem'),key=join(temp,'key.pem')
  assert.equal(spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=B07 task CA','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'}).status,0)
  const ca=readFileSync(cert);app=await createPersonalHttpApp(container)
  server=createServer({key:readFileSync(key),cert:ca},app.app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve))
  const origin='https://127.0.0.1:'+(server.address() as any).port;process.env.DOGRUADRES_PUBLIC_ORIGIN=origin
  const tlsProbe=(trusted:boolean,servername='')=>new Promise<boolean>(resolve=>{const req=request({hostname:'127.0.0.1',port:(server!.address() as any).port,path:'/personal',ca:trusted?ca:undefined,rejectUnauthorized:true,servername},res=>{res.resume();resolve(res.statusCode===200)});req.on('error',()=>resolve(false));req.end()})
  assert.equal(await tlsProbe(true),true);assert.equal(await tlsProbe(false),false);assert.equal(await tlsProbe(true,'wrong.example.invalid'),false)
  report.tls={trustedCaAndIpSan:true,defaultUntrustedRejected:true,wrongHostnameRejected:true,certificateSha256:createHash('sha256').update(ca).digest('hex'),bypass:false}
  const sql={execute:async(s:string,args:any[]=[])=>{let i=0;return q(s.replace(/\?/g,()=>'$'+(++i)),args)}}
  const strong=async(c:B06Chrome)=>{const token=await c.token();assert.ok(token);await q('begin');try{const s=await new IdentitySessions(sql).current(token,true);assert.ok(s&&s.mfa_purpose==='full');const a=actors[c.actor==='A'?0:1];assert.equal(s!.person_id,a.person);assert.equal(s!.auth_identity_id,a.identity);assert.equal(s!.actor_id,a.actor);const ch=challenges.filter(r=>r.identity===a.identity);assert.equal(ch.length,1);assert.equal(new Date(s!.last_strong_auth_at).getTime(),new Date(ch[0].completed).getTime());await q('commit');report.checks.push({actor:c.actor,phase:c.phase,currentSensitive:true,nativeChallengeCompleted:true,sessionRef:createHash('sha256').update(s!.id).digest('hex').slice(0,16)});return s!}catch(e){await q('rollback');throw e}}
  for(const [i,label]of ['A','B'].entries()){const c=new B06Chrome(origin,label as 'A'|'B');browsers.push(c);await c.start(cert);await c.login(process.env['B06_EMAIL_'+label]!,process.env['B06_PASSWORD_'+label]!,actors[i].person);await strong(c)}
  const [a,b]=browsers
  const domain=async()=>{const result:any={};for(const t of ['da_organization_membership','da_audit_event','da_audit_outbox','da_security_outbox'])result[t]=(await q(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),'')) hash from "${t}" r`))[0];return result}
  const denied=async(c:B06Chrome,name:string,body:object,status:number,bad=false)=>{c.phase=name;await strong(c);const before=await domain();assert.equal((await c.post(body,bad)).status,status);assert.deepEqual(await domain(),before);report.checks.push({phase:name,actor:c.actor,http:status,zeroDomainAuditOutbox:true,evidence:'REAL CHROME FETCH / NATIVE HTTP / SQL; denied POST, not a visible role control'})}
  await b.select(orgs[0].name,'member')
  await b.wait("document.getElementById('memberships-status').textContent==='Üyelik listesini görüntüleme izniniz yok.'")
  await denied(b,'member-denied',{action:'protected_owner',organization_id:orgs[0].id,membership_id:b1.id,role:'owner'},403)
  await a.select(orgs[0].name,'owner');await a.ready()
  await denied(a,'foreign-target',{action:'protected_owner',organization_id:orgs[0].id,membership_id:b2.id,role:'owner'},404)
  await denied(a,'csrf-denied',{action:'protected_owner',organization_id:orgs[0].id,membership_id:b1.id,role:'owner'},403,true)
  await denied(a,'normal-role-owner-denied',{organization_id:orgs[0].id,membership_id:b1.id,role:'owner'},400)
  a.phase='last-owner-visible-denial';await strong(a)
  let before=await domain()
  await a.button('Owner rolünü Admin yap '+owner1.id)
  await until(async()=>a.http.some(x=>x.phase==='last-owner-visible-denial'&&x.path==='/personal/memberships'&&x.method==='POST'&&x.status===403),20000,'B07 last Owner visible refusal')
  assert.deepEqual(await domain(),before)
  report.checks.push({phase:a.phase,http:403,zeroDomainAuditOutbox:true,visibleClick:true})
  const change=async(c:B06Chrome,phase:string,target:any,role:'owner'|'admin')=>{
   c.phase=phase;await strong(c)
   const prev=(await q('select role,status,protected_owner from da_organization_membership where id=$1',[target.id]))[0],n=await count('da_audit_outbox')
   await c.button((role==='owner'?'Korumalı Owner yap ':'Owner rolünü Admin yap ')+target.id)
   await until(async()=>c.http.some(x=>x.phase===phase&&x.method==='POST'&&x.path==='/personal/memberships'&&x.status===200)&&await count('da_audit_outbox')===n+1,20000,'B07 native membership mutation')
   const next=(await q('select role,status,protected_owner from da_organization_membership where id=$1',[target.id]))[0]
   assert.equal(next.role,role);assert.equal(next.status,'active');assert.equal(next.protected_owner,role==='owner')
   const events=await q("select e.id,e.actor_id,e.actor_person_id,e.organization_id,e.previous_values,e.new_values,(select count(*)::int from da_audit_outbox o where o.source_audit_event_id=e.id) canonical,(select count(*)::int from da_security_outbox o where o.audit_event_id=e.id) security from da_audit_event e where e.action='organization.membership_changed' and e.target_id=$1 order by e.created_at",[target.id])
   const last=events[events.length-1],actor=actors[c.actor==='A'?0:1]
   assert.ok(last);assert.equal(last.actor_id,actor.actor);assert.equal(last.actor_person_id,actor.person);assert.equal(last.organization_id,target.organization_id)
   assert.equal(last.canonical,1);assert.equal(last.security,1);assert.equal(last.previous_values.role,prev.role);assert.equal(last.new_values.role,next.role);assert.equal(last.new_values.protected_owner,next.protected_owner)
   report.checks.push({phase,actor:c.actor,http:200,before:prev,after:next,auditRef:last.id,canonical:1,security:1,visibleClick:true})
  }
  await change(a,'promote-existing-member',b1,'owner')
  await a.ready();await b.reload('owner');await b.ready()
  await b.eval("document.getElementById('memberships').scrollIntoView({block:'start'})")
  await b.screenshot(join(output,'01-two-protected-owners.png'))
  await change(b,'second-owner-demotes-first',owner1,'admin')
  await b.ready();await a.reload('admin');await a.ready()
  assert.equal(await a.eval("Array.from(document.querySelectorAll('#memberships button')).some(x=>x.textContent.startsWith('Korumalı Owner yap ')||x.textContent.startsWith('Owner rolünü Admin yap '))"),false)
  await denied(a,'admin-denied',{action:'protected_owner',organization_id:orgs[0].id,membership_id:b1.id,role:'admin'},403)
  await denied(b,'sole-owner-denied',{action:'protected_owner',organization_id:orgs[0].id,membership_id:b1.id,role:'admin'},403)
  await b.eval("document.getElementById('memberships').scrollIntoView({block:'start'})")
  await b.screenshot(join(output,'02-one-protected-owner.png'))
  // On a second disposable Organization race both protected Owners' demotions.
  await a.select(orgs[1].name,'owner');await a.ready()
  await b.select(orgs[1].name,'member')
  await change(a,'org2-promote',b2,'owner')
  await a.ready();await b.reload('owner');await b.ready()
  a.phase='concurrent-owner-demotion-A';b.phase='concurrent-owner-demotion-B'
  await strong(a);await strong(b)
  const n=await count('da_audit_outbox')
  const [ra,rb]=await Promise.all([
   a.post({action:'protected_owner',organization_id:orgs[1].id,membership_id:owner2.id,role:'admin'}),
   b.post({action:'protected_owner',organization_id:orgs[1].id,membership_id:b2.id,role:'admin'})
  ])
  assert.deepEqual([ra.status,rb.status].sort(),[200,403])
  assert.equal(await count('da_audit_outbox'),n+1)
  const org2=await q("select role,status,protected_owner from da_organization_membership where organization_id=$1",[orgs[1].id])
  assert.equal(org2.filter(x=>x.status==='active'&&x.role==='owner'&&x.protected_owner).length,1)
  const events2=await q("select e.id,(select count(*)::int from da_audit_outbox o where o.source_audit_event_id=e.id) canonical,(select count(*)::int from da_security_outbox o where o.audit_event_id=e.id) security from da_audit_event e where organization_id=$1 and action='organization.membership_changed'",[orgs[1].id])
  assert.equal(events2.length,2);assert.ok(events2.every(e=>e.canonical===1&&e.security===1))
  report.checks.push({phase:'concurrent-protected-owner-demotions',statuses:[ra.status,rb.status],remainingOwner:1,canonicalAuditDelta:1,zeroUnauthorizedWrites:true})
  const final=await q('select organization_id,role,status,protected_owner from da_organization_membership order by id')
  for(const o of orgs)assert.equal(final.filter(x=>x.organization_id===o.id&&x.role==='owner'&&x.status==='active'&&x.protected_owner).length,1)
  const expected:any={da_person:2,user:2,auth_identity:2,provider_identity:2,da_actor_mapping:2,da_login_binding:2,da_organization:2,da_organization_membership:4,auth_mfa_factor:2,da_platform_staff_grant:0,da_organization_invitation:0,auth_verification:0,notification:0}
  for(const [table,countExpected]of Object.entries(expected))assert.equal(await count(table),countExpected,'B07 synthetic fixture '+table)
  assert.equal(await count('da_audit_outbox'),4)
  assert.equal((await q("select count(*)::int n from da_audit_event where action='organization.membership_changed'"))[0].n,4)
  assert.equal(challenges.length,2)
  report.sql={counts:expected,final,domainMutations:4,canonicalOutbox:await count('da_audit_outbox'),securityOutbox:await count('da_security_outbox')}
  report.status='PASS pending independent exact-HEAD acceptance'
 }catch(error){
  report.status='FAIL / no retry'
  report.failure={category:error instanceof Error?error.name:'Unknown',phases:browsers.map(c=>({actor:c.actor,phase:c.phase})),frames:error instanceof Error?error.stack?.split('\n').slice(1,6).filter(s=>s.trim().startsWith('at ')):[]}
  throw Error('B07 acceptance failed; inspect sanitized phase/frame evidence; no retry')
 }finally{
  auth.verifyAuthMfaChallenge=original
  for(const c of browsers){await c.close();report.browsers.push({actor:c.actor,http:c.http,cleanup:c.cleanup})}
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()))
  await app?.close();await pg.end();rmSync(temp,{recursive:true,force:true});report.cleanup={chromeProfiles:browsers.every(c=>c.cleanup),taskTlsRemoved:true}
  writeFileSync(join(output,'evidence.json'),JSON.stringify(report,null,2))
  const hashes=readdirSync(output).filter(n=>n!=='SHA256SUMS').map(n=>createHash('sha256').update(readFileSync(join(output,n))).digest('hex')+'  '+n)
  writeFileSync(join(output,'SHA256SUMS'),hashes.join('\n')+'\n')
  console.log('B06_UI_EVIDENCE '+JSON.stringify(report))
 }
 assert.equal(report.status,'PASS pending independent exact-HEAD acceptance');console.log('PASS B07-UI real Chrome/native MFA/HTTP/SQL')
}
