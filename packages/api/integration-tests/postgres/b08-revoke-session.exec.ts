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
import {B06Chrome} from './b06-ui-browser'
import {until} from './native-verification-browser'

export default async function({container}:ExecArgs){
 const u=new URL(process.env.DATABASE_URL??'postgres://invalid/invalid')
 assert.ok(process.env.CI==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.B08_UI_DISPATCH_SCOPE==='b08-ui'&&process.env.PG_MFA_TEST_SCOPE==='b08-ui'&&process.env.PG_MFA_TEST_SENTINEL==='mfa-pg16-disposable-ci-v1'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.username==='mfa_test'&&u.password==='ci-disposable-only-not-a-real-secret'&&/^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname)&&process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1),'REFUSED: exact B08 disposable dispatch boundary')
 const pg=new Client({connectionString:u.toString()});await pg.connect()
 const q=async(sql:string,args:any[]=[]) => (await pg.query(sql,args)).rows
 const count=async(t:string)=>Number((await q(`select count(*)::int n from "${t}"`))[0].n)
 const auth:IAuthModuleService=container.resolve('auth'),users:IUserModuleService=container.resolve('user'),f:Foundation=container.resolve('dogruadresAccess')
 if(process.env.B08_PREPARE==='true'){
  try{
   for(const t of ['da_person','user','auth_identity','provider_identity','da_actor_mapping','da_login_binding','da_organization','da_organization_membership','auth_mfa_factor','da_browser_session','da_platform_staff_grant'])assert.equal(await count(t),0,'Nonempty fixture table '+t)
   for(const label of ['A','B']){
    const email=process.env['B08_EMAIL_'+label]!,password=process.env['B08_PASSWORD_'+label]!
    assert.match(email,/^b08-[ab]-[a-f0-9]+@example.invalid$/);assert.ok(password.length>=40)
    const user=await users.createUsers({email}),r=await auth.register('emailpass',{body:{email,password}});assert.ok(r.success&&r.authIdentity)
    await auth.updateAuthIdentities({id:r.authIdentity!.id,app_metadata:{user_id:user.id}})
    const [person]=await f.createPeople([{}])
    await f.createActorMappings([{actor_type:'user',actor_id:user.id,person_id:person.id,created_by_actor_type:'user',created_by_actor_id:user.id}])
    // Explicitly authorized test fixture only. Never a production recipient proof.
    await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",[r.authIdentity!.id,person.id,user.id])
   }
   // Only disposable policy fixture configuration. Actual latch transition uses existing R1 service.
   await q("insert into da_mfa_policy(id,platform_mode,version) values('current','required',0)")
   console.log('PASS B08 synthetic setup: two native users/identities/Persons/bindings; NOT RECIPIENT OWNERSHIP PROOF')
  }finally{await pg.end()}
  return
 }
 const report:any={scope:'B08 REAL CHROME / NATIVE HTTP / PG16',binding:'SYNTHETIC TEST BINDING — NOT RECIPIENT OWNERSHIP PROOF',run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,checks:[],browsers:[],cleanup:{},status:'INCOMPLETE'}
 const output=process.env.B08_EVIDENCE_DIR!;assert.ok(output&&output.startsWith(process.env.RUNNER_TEMP!+'/'));mkdirSync(output,{recursive:true})
 const temp=mkdtempSync(join(tmpdir(),'b08-tls-')),browsers:B06Chrome[]=[]
 let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined,server:ReturnType<typeof createServer>|undefined
 const challenges:any[]=[]
 const original=auth.verifyAuthMfaChallenge.bind(auth)
 auth.verifyAuthMfaChallenge=async function(input:any){const r=await original(input);challenges.push({identity:r.auth_identity_id,id:r.id,completed:r.completed_at});return r}
 try{
  assert.match((await q('show server_version_num'))[0].server_version_num,/^16\d{4}$/)
  assert.equal((await q("select mfa_activated from da_session_policy where id='current'"))[0].mfa_activated,true)
  const actors:any[]=[]
  for(const label of ['A','B']){const rows=await q("select u.id actor,b.person_id person,b.auth_identity_id identity from public.user u join da_login_binding b on b.actor_id=u.id and b.actor_type='user' where u.email=$1 and b.verified_at is not null",[process.env['B08_EMAIL_'+label]]);assert.equal(rows.length,1);actors.push(rows[0])}
  const orgs=await f.createOrganizations([{name:'B08 Org1',status:'active'},{name:'B08 Org2',status:'active'}])
  const members=await f.createMemberships(orgs.flatMap(o=>actors.map((a,i)=>({organization_id:o.id,person_id:a.person,role:i===0?'owner' as const:'member' as const,status:'active' as const,protected_owner:i===0}))))
  const [owner1,b1,owner2,b2]=members
  const cert=join(temp,'ca.pem'),key=join(temp,'key.pem')
  assert.equal(spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=B08 task CA','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'}).status,0)
  const ca=readFileSync(cert);app=await createPersonalHttpApp(container)
  server=createServer({key:readFileSync(key),cert:ca},app.app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve))
  const origin='https://127.0.0.1:'+(server.address() as any).port;process.env.DOGRUADRES_PUBLIC_ORIGIN=origin
  const tlsProbe=(trusted:boolean,servername='')=>new Promise<boolean>(resolve=>{const req=request({hostname:'127.0.0.1',port:(server!.address() as any).port,path:'/personal',ca:trusted?ca:undefined,rejectUnauthorized:true,servername},res=>{res.resume();resolve(res.statusCode===200)});req.on('error',()=>resolve(false));req.end()})
  assert.equal(await tlsProbe(true),true);assert.equal(await tlsProbe(false),false);assert.equal(await tlsProbe(true,'wrong.example.invalid'),false)
  report.tls={trustedCaAndIpSan:true,defaultUntrustedRejected:true,wrongHostnameRejected:true,certificateSha256:createHash('sha256').update(ca).digest('hex'),bypass:false}
  const sql={execute:async(s:string,args:any[]=[])=>{let i=0;return q(s.replace(/\?/g,()=>'$'+(++i)),args)}}
  const strong=async(c:B06Chrome)=>{const token=await c.token();assert.ok(token);await q('begin');try{const s=await new IdentitySessions(sql).current(token,true);assert.ok(s&&s.mfa_purpose==='full');const a=actors[c.actor==='A'?0:1];assert.equal(s!.person_id,a.person);assert.equal(s!.auth_identity_id,a.identity);assert.equal(s!.actor_id,a.actor);const ch=challenges.filter(r=>r.identity===a.identity);assert.equal(ch.length,1);assert.equal(new Date(s!.last_strong_auth_at).getTime(),new Date(ch[0].completed).getTime());await q('commit');report.checks.push({actor:c.actor,phase:c.phase,currentSensitive:true,nativeChallengeCompleted:true,sessionRef:createHash('sha256').update(s!.id).digest('hex').slice(0,16)});return s!}catch(e){await q('rollback');throw e}}
  for(const [i,label]of ['A','B'].entries()){const c=new B06Chrome(origin,label as 'A'|'B');browsers.push(c);await c.start(cert);await c.login(process.env['B08_EMAIL_'+label]!,process.env['B08_PASSWORD_'+label]!,actors[i].person);await strong(c)}
  const [a,b]=browsers
  const domain=async()=>{const result:any={};for(const t of ['da_organization_membership','da_audit_event','da_audit_outbox','da_security_outbox'])result[t]=(await q(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),'')) hash from "${t}" r`))[0];return result}
  const denied=async(c:B06Chrome,name:string,body:object,status:number,bad=false)=>{c.phase=name;await strong(c);const before=await domain();assert.equal((await c.post(body,bad)).status,status);assert.deepEqual(await domain(),before);report.checks.push({phase:name,actor:c.actor,http:status,zeroDomainAuditOutbox:true,evidence:'REAL CHROME FETCH / NATIVE HTTP / SQL; denied POST, not a visible role control'})}
  // B08-only: distinct MFA browsers. Existing synthetic membership, no invitation or delivery claim.
  await b.select(orgs[1].name,'member')
  await b.wait("JSON.parse(document.getElementById('detail').textContent||'{}').role==='member'")
  await a.select(orgs[1].name,'owner');await a.ready()
  await denied(b,'member-cannot-revoke',{action:'revoke',organization_id:orgs[1].id,membership_id:owner2.id},403)
  await denied(a,'foreign-target',{action:'revoke',organization_id:orgs[0].id,membership_id:b2.id},404)
  await denied(a,'csrf-denied',{action:'revoke',organization_id:orgs[1].id,membership_id:b2.id},403,true)
  a.phase='owner-visible-revoke';await strong(a)
  const before=(await q('select role,status,protected_owner from da_organization_membership where id=$1',[b2.id]))[0]
  assert.deepEqual(before,{role:'member',status:'active',protected_owner:false})
  const outboxBefore=await count('da_audit_outbox')
  await a.button('Üyeliği iptal et '+b2.id)
  await until(async()=>a.http.some(x=>x.phase==='owner-visible-revoke'&&x.method==='POST'&&x.path==='/personal/memberships'&&x.status===200)&&await count('da_audit_outbox')===outboxBefore+1,20000,'B08 real owner revoke and SQL commit')
  const after=(await q('select role,status,protected_owner,revoked_at from da_organization_membership where id=$1',[b2.id]))[0]
  assert.equal(after.role,'member');assert.equal(after.status,'revoked');assert.equal(after.protected_owner,false);assert.ok(after.revoked_at)
  const evs=await q("select e.id,e.actor_id,e.actor_person_id,e.organization_id,e.previous_values,e.new_values,(select count(*)::int from da_audit_outbox o where o.source_audit_event_id=e.id) canonical,(select count(*)::int from da_security_outbox o where o.audit_event_id=e.id) security from da_audit_event e where e.action='organization.membership_changed' and e.target_id=$1",[b2.id])
  assert.equal(evs.length,1)
  assert.equal(evs[0].actor_id,actors[0].actor);assert.equal(evs[0].actor_person_id,actors[0].person);assert.equal(evs[0].organization_id,orgs[1].id)
  assert.equal(evs[0].previous_values.status,'active');assert.equal(evs[0].new_values.status,'revoked')
  assert.equal(evs[0].canonical,1);assert.equal(evs[0].security,1)
  report.checks.push({phase:'owner-visible-revoke',actor:'A',http:200,revokedAt:true,canonical:1,security:1,visibleClick:true})
  b.phase='old-browser-reload';await strong(b)
  await b.send('Page.reload',{ignoreCache:true})
  await until(async()=>b.http.some(x=>x.phase==='old-browser-reload'&&x.method==='GET'&&x.path==='/personal/organizations'&&x.status===403),20000,'B08 old Chrome session denied')
  await b.wait("document.getElementById('detail').textContent===''&&document.getElementById('memberships').textContent===''&&document.getElementById('invite-member').hidden&&document.getElementById('audit-timeline-section').hidden&&location.search===''")
  await b.wait("Array.from(document.querySelectorAll('#organizations button')).every(x=>!x.textContent.includes('B08 Org2'))")
  await b.screenshot(join(output,'01-revoked-old-browser-cleared.png'))
  report.checks.push({phase:'old-browser-reload',actor:'B',http:403,privateDomCleared:true,revokedOrganizationAbsent:true})
  await denied(b,'revoked-actor',{action:'revoke',organization_id:orgs[1].id,membership_id:owner2.id},403)
  await denied(a,'revoke-replay',{action:'revoke',organization_id:orgs[1].id,membership_id:b2.id},403)
  await b.select(orgs[0].name,'member')
  const final=await q('select organization_id,role,status,protected_owner from da_organization_membership order by id')
  assert.equal(final.filter(x=>x.status==='revoked').length,1)
  assert.equal(final.filter(x=>x.status==='active').length,3)
  assert.equal(final.filter(x=>x.protected_owner&&x.role==='owner'&&x.status==='active').length,2)
  const expected:any={da_person:2,user:2,auth_identity:2,provider_identity:2,da_actor_mapping:2,da_login_binding:2,da_organization:2,da_organization_membership:4,auth_mfa_factor:2,da_platform_staff_grant:0,da_organization_invitation:0,auth_verification:0,notification:0}
  for(const [table,n]of Object.entries(expected))assert.equal(await count(table),n,'B08 synthetic fixture limit '+table)
  assert.equal(await count('da_audit_outbox'),1)
  assert.equal((await q("select count(*)::int n from da_audit_event where action='organization.membership_changed'"))[0].n,1)
  assert.equal(challenges.length,2)
  report.sql={counts:expected,final,domainMutations:1,canonicalOutbox:1,securityOutbox:await count('da_security_outbox')}
  report.status='PASS pending independent exact-HEAD acceptance'
 }catch(error){
  report.status='FAIL / no retry'
  report.failure={category:error instanceof Error?error.name:'Unknown',phases:browsers.map(c=>({actor:c.actor,phase:c.phase})),frames:error instanceof Error?error.stack?.split('\n').slice(1,6).filter(s=>s.trim().startsWith('at ')):[]}
  throw Error('B08 acceptance failed; inspect sanitized phase/frame evidence; no retry')
 }finally{
  auth.verifyAuthMfaChallenge=original
  for(const c of browsers){await c.close();report.browsers.push({actor:c.actor,http:c.http,cleanup:c.cleanup})}
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()))
  await app?.close();await pg.end();rmSync(temp,{recursive:true,force:true});report.cleanup={chromeProfiles:browsers.every(c=>c.cleanup),taskTlsRemoved:true}
  writeFileSync(join(output,'evidence.json'),JSON.stringify(report,null,2))
  const hashes=readdirSync(output).filter(n=>n!=='SHA256SUMS').map(n=>createHash('sha256').update(readFileSync(join(output,n))).digest('hex')+'  '+n)
  writeFileSync(join(output,'SHA256SUMS'),hashes.join('\n')+'\n')
  console.log('B08_UI_EVIDENCE '+JSON.stringify(report))
 }
 assert.equal(report.status,'PASS pending independent exact-HEAD acceptance');console.log('PASS B08-UI real Chrome/native MFA/HTTP/SQL')
}
