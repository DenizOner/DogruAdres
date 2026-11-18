/** #189/6427613125. SYNTHETIC TEST BINDING — NOT RECIPIENT OWNERSHIP PROOF. */
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {createServer,request} from 'node:https'
import {spawn,spawnSync,type ChildProcess} from 'node:child_process'
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
 assert.ok(process.env.CI==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.B06_UI_DISPATCH_SCOPE==='b06-ui'&&process.env.PG_MFA_TEST_SCOPE==='b06-ui'&&process.env.PG_MFA_TEST_SENTINEL==='mfa-pg16-disposable-ci-v1'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.username==='mfa_test'&&u.password==='ci-disposable-only-not-a-real-secret'&&/^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname)&&process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1),'REFUSED: exact B06 disposable dispatch boundary')
 const pg=new Client({connectionString:u.toString()});await pg.connect()
 const q=async(sql:string,args:any[]=[]) => (await pg.query(sql,args)).rows
 const count=async(t:string)=>Number((await q(`select count(*)::int n from "${t}"`))[0].n)
 const auth:IAuthModuleService=container.resolve('auth'),users:IUserModuleService=container.resolve('user'),f:Foundation=container.resolve('dogruadresAccess')
 if(process.env.B06_PREPARE==='true'){
  try{
   for(const t of ['da_person','user','auth_identity','provider_identity','da_actor_mapping','da_login_binding','da_organization','da_organization_membership','auth_mfa_factor','da_browser_session','da_platform_staff_grant'])assert.equal(await count(t),0,'Nonempty fixture table '+t)
   for(const label of ['A','B']){
    const email=process.env['B06_EMAIL_'+label]!,password=process.env['B06_PASSWORD_'+label]!
    assert.match(email,/^b06-[ab]-[a-f0-9]+@example.invalid$/);assert.ok(password.length>=40)
    const user=await users.createUsers({email}),r=await auth.register('emailpass',{body:{email,password}});assert.ok(r.success&&r.authIdentity)
    await auth.updateAuthIdentities({id:r.authIdentity!.id,app_metadata:{user_id:user.id}})
    const [person]=await f.createPeople([{}])
    await f.createActorMappings([{actor_type:'user',actor_id:user.id,person_id:person.id,created_by_actor_type:'user',created_by_actor_id:user.id}])
    // Explicitly authorized test fixture only. Never a production recipient proof.
    await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",[r.authIdentity!.id,person.id,user.id])
   }
   // Only disposable policy fixture configuration. Actual latch transition uses existing R1 service.
   await q("insert into da_mfa_policy(id,platform_mode,version) values('current','required',0)")
   console.log('PASS B06 synthetic setup: two native users/identities/Persons/bindings; NOT RECIPIENT OWNERSHIP PROOF')
  }finally{await pg.end()}
  return
 }
 const report:any={scope:'B06 REAL CHROME / NATIVE HTTP / PG16',binding:'SYNTHETIC TEST BINDING — NOT RECIPIENT OWNERSHIP PROOF',run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,checks:[],browsers:[],cleanup:{},status:'INCOMPLETE'}
 const output=process.env.B06_EVIDENCE_DIR!;assert.ok(output&&output.startsWith(process.env.RUNNER_TEMP!+'/'));mkdirSync(output,{recursive:true})
 const temp=mkdtempSync(join(tmpdir(),'b06-tls-')),browsers:B06Chrome[]=[]
 let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined,server:ReturnType<typeof createServer>|undefined
 let freshWorker:ChildProcess|undefined,workerCleanupOk=true
 const challenges:any[]=[]
 const original=auth.verifyAuthMfaChallenge.bind(auth)
 auth.verifyAuthMfaChallenge=async function(input:any){const r=await original(input);challenges.push({identity:r.auth_identity_id,id:r.id,completed:r.completed_at});return r}
 try{
  assert.match((await q('show server_version_num'))[0].server_version_num,/^16\d{4}$/)
  assert.equal((await q("select mfa_activated from da_session_policy where id='current'"))[0].mfa_activated,true)
  const actors:any[]=[]
  for(const label of ['A','B']){const rows=await q("select u.id actor,b.person_id person,b.auth_identity_id identity from public.user u join da_login_binding b on b.actor_id=u.id and b.actor_type='user' where u.email=$1 and b.verified_at is not null",[process.env['B06_EMAIL_'+label]]);assert.equal(rows.length,1);actors.push(rows[0])}
  // A/B must represent genuinely distinct Person, native identity and actors;
  // otherwise two successful GETs cannot prove cross-Person isolation.
  assert.ok(actors.length===2&&actors[0].person!==actors[1].person&&
    actors[0].identity!==actors[1].identity&&actors[0].actor!==actors[1].actor,
    'B06 requires independent synthetic Person and AuthIdentity fixtures')
  const orgs=await f.createOrganizations([{name:'B06 Org1',status:'active'},{name:'B06 Org2',status:'active'}])
  const members=await f.createMemberships(orgs.flatMap(o=>actors.map((a,i)=>({organization_id:o.id,person_id:a.person,role:i===0?'owner' as const:'member' as const,status:'active' as const,protected_owner:i===0}))))
  const [owner1,b1,owner2,b2]=members
  const cert=join(temp,'ca.pem'),key=join(temp,'key.pem')
  assert.equal(spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=B06 task CA','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'}).status,0)
  const ca=readFileSync(cert);app=await createPersonalHttpApp(container)
  server=createServer({key:readFileSync(key),cert:ca},app.app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve))
  const origin='https://127.0.0.1:'+(server.address() as any).port;process.env.DOGRUADRES_PUBLIC_ORIGIN=origin
  const tlsProbe=(trusted:boolean,servername='')=>new Promise<boolean>(resolve=>{const req=request({hostname:'127.0.0.1',port:(server!.address() as any).port,path:'/personal',ca:trusted?ca:undefined,rejectUnauthorized:true,servername},res=>{res.resume();resolve(res.statusCode===200)});req.on('error',()=>resolve(false));req.end()})
  assert.equal(await tlsProbe(true),true);assert.equal(await tlsProbe(false),false);assert.equal(await tlsProbe(true,'wrong.example.invalid'),false)
  report.tls={trustedCaAndIpSan:true,defaultUntrustedRejected:true,wrongHostnameRejected:true,certificateSha256:createHash('sha256').update(ca).digest('hex'),bypass:false}
  const sql={execute:async(s:string,args:any[]=[])=>{let i=0;return q(s.replace(/\?/g,()=>'$'+(++i)),args)}}
  const strong=async(c:B06Chrome)=>{const token=await c.token();assert.ok(token);await q('begin');try{const s=await new IdentitySessions(sql).current(token,true);assert.ok(s&&s.mfa_purpose==='full');const a=actors[c.actor==='A'?0:1];assert.equal(s!.person_id,a.person);assert.equal(s!.auth_identity_id,a.identity);assert.equal(s!.actor_id,a.actor);const ch=challenges.filter(r=>r.identity===a.identity);assert.equal(ch.length,1);assert.equal(new Date(s!.last_strong_auth_at).getTime(),new Date(ch[0].completed).getTime());await q('commit');report.checks.push({actor:c.actor,phase:c.phase,currentSensitive:true,nativeChallengeCompleted:true,sessionRef:createHash('sha256').update(s!.id).digest('hex').slice(0,16)});return s!}catch(e){await q('rollback');throw e}}
  for(const [i,label]of ['A','B'].entries()){const c=new B06Chrome(origin,label as 'A'|'B');browsers.push(c);await c.start(cert,45000);await c.login(process.env['B06_EMAIL_'+label]!,process.env['B06_PASSWORD_'+label]!,actors[i].person);await strong(c)}
  const [a,b]=browsers
  const domain=async()=>{const result:any={};for(const t of ['da_organization_membership','da_mfa_policy','da_person_mfa_preference','auth_mfa_factor','da_audit_event','da_audit_outbox','da_security_outbox'])result[t]=(await q(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),'')) hash from "${t}" r`))[0];return result}
  // #366: Read the real Medusa MFA endpoint in both independently authenticated
  // task-only Chrome profiles. No platform mutation or native-factor bypass.
  const mfaGet=async(c:B06Chrome,path:string,credentials:'include'|'omit')=>
    c.callFunction(
      "async function(path, credentials) { const response = await fetch(path, {method:'GET', credentials, headers:{Accept:'application/json'}}); return {status:response.status, cacheControl:response.headers.get('cache-control'), body:await response.json()}; }",
      path,credentials
    )
  const mfaBefore=await domain()
  for(const [i,c] of [a,b].entries()){
    c.phase='mfa-settings-get-own-person'
    await strong(c)
    const mfaHttpStart=c.http.length
    const own=await mfaGet(c,'/personal/mfa','include')
    assert.equal(own.status,200,'Authenticated native MFA user must read own settings')
    // Keep assertion diagnostics fixed: never print Person IDs, native factor
    // metadata or unexpected HTTP bodies to a public Actions failure log.
    const keysOnly=(value:unknown,keys:readonly string[])=>
      !!value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(value).length===keys.length&&
      keys.every(key=>Object.prototype.hasOwnProperty.call(value,key))
    assert.ok(own.cacheControl==='no-store','MFA GET response must be non-cacheable')
    // An unexpected field must fail the test WITHOUT echoing its name or value.
    assert.ok(keysOnly(own.body,
      ['platform','personal','can_manage_platform','native_factor_state','effective_mfa_target','runtime_enforcement']),
      'MFA response must contain only the approved top-level fields')
    assert.ok(keysOnly(own.body?.platform,['platform_mode','version']),'MFA platform response fields')
    assert.ok(keysOnly(own.body?.personal,['person_id','user_enabled','version']),'MFA Person response fields')
    assert.ok(keysOnly(own.body?.effective_mfa_target,['next_step','required','user_control_allowed']),
      'MFA effective policy response fields')
    assert.ok(own.body?.personal?.person_id===actors[i].person,'MFA Person ID must match the live session')
    assert.ok(own.body?.personal?.user_enabled===false,'MFA Person default preference must be OFF')
    assert.ok(own.body?.personal?.version===0,'MFA Person preference must be at revision 0')
    assert.ok(own.body?.platform?.platform_mode==='required','MFA platform default must be required')
    assert.ok(own.body?.platform?.version===0,'MFA platform policy must be at revision 0')
    assert.ok(own.body?.native_factor_state==='enabled','Verified native TOTP must be enabled')
    assert.ok(own.body?.effective_mfa_target?.required===true,'Effective MFA must be required')
    assert.ok(own.body?.effective_mfa_target?.next_step==='verify_mfa',
      'Enrolled native factor must retain verification as its effective MFA step')
    assert.ok(own.body?.effective_mfa_target?.user_control_allowed===false,'Mandatory MFA cannot be disabled by Person')
    assert.ok(own.body?.can_manage_platform===false,'Ordinary Person must not receive platform grant')
    assert.ok(own.body?.runtime_enforcement==='enforced','MFA runtime must be enforced')
    assert.ok(!/"(?:auth_identity_id|factor_id|factor_ids|secret|seed|token|recovery_codes)"\s*:/.test(JSON.stringify(own.body)),
      'MFA response must not include native factor identifiers or secrets')
    c.phase='mfa-settings-get-no-cookie'
    const anonymous=await mfaGet(c,'/personal/mfa','omit')
    assert.equal(anonymous.status,403,'Missing browser session must be denied before Person lookup')
    assert.ok(anonymous.cacheControl==='no-store','Rejected no-cookie GET must be non-cacheable')
    assert.ok(keysOnly(anonymous.body,['message'])&&anonymous.body.message==='Access denied',
      'Rejected no-cookie GET must return only the access-denied message')
    c.phase='mfa-settings-get-foreign-person-query'
    const foreign=await mfaGet(c,'/personal/mfa?person_id='+encodeURIComponent(actors[1-i].person),'include')
    assert.equal(foreign.status,400,'Client-selected foreign Person must not become an authority')
    assert.ok(foreign.cacheControl==='no-store','Rejected foreign selector must be non-cacheable')
    assert.ok(keysOnly(foreign.body,['message'])&&foreign.body.message==='Invalid input',
      'Rejected foreign selector must return only the invalid-input message')
    // CDP observes the actual three HTTPS network responses, not a stubbed
    // window.fetch result or a cached synthetic response.
    const expectedMfaNetwork=[
      ['mfa-settings-get-own-person',200],
      ['mfa-settings-get-no-cookie',403],
      ['mfa-settings-get-foreign-person-query',400],
    ] as const
    await until(async()=>expectedMfaNetwork.every(([phase,status])=>
      c.http.slice(mfaHttpStart).some((r:any)=>r.phase===phase&&r.method==='GET'&&
        r.path==='/personal/mfa'&&r.status===status&&r.tls?.protocol)),
      5000,'B06 real native Chrome TLS network evidence')

    report.checks.push({phase:'mfa-settings-real-https-person-readback',actor:c.actor,
      ownHttp:200,missingCookieHttp:403,foreignPersonQueryHttp:400,
      exactPersonBinding:true,defaultPreferenceReadOnly:true,nativeFactorEnabled:true,
      policyRequired:true,noStore:true,secretFree:true})
  }
  assert.deepEqual(await domain(),mfaBefore,'MFA GET and denied requests must not mutate domain audit/outbox')

  const denied=async(c:B06Chrome,name:string,body:object,status:number,bad=false)=>{c.phase=name;await strong(c);const before=await domain();assert.equal((await c.post(body,bad)).status,status);assert.deepEqual(await domain(),before);report.checks.push({phase:name,actor:c.actor,http:status,zeroDomainAuditOutbox:true,evidence:'REAL CHROME FETCH / NATIVE HTTP / SQL; denied POST, not a visible role control'})}
  // #253 approved: Organization Admin is retired; maintain meaningful denial,
  // protected Owner, CSRF and actual Chrome/SQL Owner revocation acceptance.
  await b.select(orgs[0].name,'member')
  await b.wait("document.getElementById('memberships-status').textContent==='Uye listesi ve davet yonetimi icin yetki gerekli.'&&document.querySelectorAll('#memberships select,#memberships button').length===0")
  await denied(b,'member-denied',{organization_id:orgs[0].id,membership_id:b1.id,role:'member'},403)
  await a.select(orgs[0].name,'owner');await a.ready()
  await denied(a,'foreign-target',{organization_id:orgs[0].id,membership_id:b2.id,role:'member'},404)
  await denied(a,'protected-owner',{organization_id:orgs[0].id,membership_id:owner1.id,role:'member'},403)
  await denied(a,'invalid-role',{organization_id:orgs[0].id,membership_id:b1.id,role:'owner'},400)
  await denied(a,'retired-admin-denied',{organization_id:orgs[0].id,membership_id:b1.id,role:'admin'},400)
  await denied(a,'invalid-csrf',{organization_id:orgs[0].id,membership_id:b1.id,role:'member'},403,true)
  const revoke=async(c:B06Chrome,name:string,target:any)=>{
    c.phase=name;await strong(c)
    const before=(await q('select role,status from da_organization_membership where id=$1',[target.id]))[0]
    const n=await count('da_audit_outbox')
    await c.button('Üyeliği iptal et '+target.id)
    await until(async()=>c.http.some(r=>r.phase===name&&r.method==='POST'&&r.path==='/personal/memberships'&&r.status===200)&&Number(await count('da_audit_outbox'))===n+1,20000,'B06 Owner revoke response/commit')
    const after=(await q('select role,status,revoked_at from da_organization_membership where id=$1',[target.id]))[0]
    assert.ok(after.role===before.role&&after.status==='revoked'&&!!after.revoked_at,
      'Owner revoke must preserve role and persist revocation')
    const audits=await q("select e.id,e.actor_id,e.actor_person_id,e.organization_id,e.previous_values,e.new_values,(select count(*)::int from da_audit_outbox o where o.source_audit_event_id=e.id) canonical,(select count(*)::int from da_security_outbox o where o.audit_event_id=e.id) security from da_audit_event e where e.target_id=$1 and e.action='organization.membership_changed' order by e.created_at",[target.id])
    const e=audits[audits.length-1],actor=actors[c.actor==='A'?0:1]
    assert.ok(e&&e.actor_id===actor.actor&&e.actor_person_id===actor.person&&e.organization_id===target.organization_id,
      'Owner revoke audit must identify the authorized Person and Organization')
    assert.ok(e.canonical===1&&e.security===1,
      'Owner revoke must publish canonical/security outbox exactly once')
    assert.ok(e.previous_values.role===before.role&&e.new_values.role===after.role&&e.new_values.status===after.status,
      'Owner revoke audit must preserve before/after role and revocation status')
    report.checks.push({phase:name,actor:c.actor,http:200,before,after:{role:after.role,status:after.status,revokedAtPresent:true},
      canonical:1,security:1,evidence:'VISIBLE CHROME OWNER REVOKE / NATIVE HTTP / SQL'})
  }
  await a.select(orgs[1].name,'owner');await a.ready();await revoke(a,'single-revoke',b2)
  await denied(a,'revoked-target',{organization_id:orgs[1].id,membership_id:b2.id,role:'member'},403)
  await denied(b,'revoked-actor',{organization_id:orgs[1].id,membership_id:owner2.id,role:'member'},403)
  await a.select(orgs[0].name,'owner');await a.ready()
  await a.wait("document.querySelectorAll('#memberships select').length===0&&!Array.from(document.querySelectorAll('#memberships button')).some(b=>b.textContent.startsWith('Rolü kaydet'))")
  await a.screenshot(join(output,'01-owner-no-admin.png'))
  await b.reload('member')
  await b.wait("document.querySelectorAll('#memberships select,#memberships button').length===0&&document.getElementById('memberships-status').textContent==='Uye listesi ve davet yonetimi icin yetki gerekli.'")
  await b.screenshot(join(output,'02-member.png'))
  assert.ok(await b.eval("location.search==='?organization='+"+JSON.stringify(orgs[0].id)),
    'Member must stay within the selected Organization')
  assert.ok(!(await b.eval("document.getElementById('memberships').textContent.includes("+JSON.stringify(actors[0].person)+")")),
    'Member cannot see a foreign Person in protected membership controls')
  const final=await q('select role,status,protected_owner from da_organization_membership order by id')
  assert.ok(final.filter(r=>r.protected_owner&&r.role==='owner'&&r.status==='active').length===2,
    'Both protected Owners must remain active')
  assert.ok(final.filter(r=>r.role==='member'&&r.status==='active').length===1&&
    final.filter(r=>r.status==='revoked').length===1&&final.every(r=>r.role!=='admin'),
    'Only approved Owner/Member fixtures, one revoke and no Admin grant may remain')
  const expected:any={da_person:2,user:2,auth_identity:2,provider_identity:2,da_actor_mapping:2,da_login_binding:2,da_organization:2,da_organization_membership:4,auth_mfa_factor:2,da_mfa_enrollment_intent:2,da_login_challenge:2,da_browser_session:6,da_native_credential:4,da_platform_staff_grant:0,da_organization_invitation:0,auth_verification:0,notification:0}
  for(const [t,n]of Object.entries(expected))assert.equal(await count(t),n,'Fixture limit '+t)
  assert.equal((await q('select count(*)::int n from da_mfa_enrollment_intent where consumed_at is not null'))[0].n,2)
  assert.equal((await q('select count(*)::int n from da_login_challenge where consumed_at is not null'))[0].n,2)
  assert.equal(challenges.length,2)
  const domainAudits=await q("select e.id,e.previous_values,e.new_values from da_audit_event e where action='organization.membership_changed'");assert.ok(domainAudits.length===1&&domainAudits.every(r=>r.previous_values.role===r.new_values.role)&&await count('da_audit_outbox')===1,'Only the authorized Owner revocation may write a membership audit/outbox')
  report.sql={counts:expected,final,domainMutations:1,roleChanges:0,retiredAdminDenied:true,auditActions:await q('select action,count(*)::int count from da_audit_event group by action order by action'),canonicalOutbox:await count('da_audit_outbox'),securityOutbox:await count('da_security_outbox')}

  // #366: REAL personal MFA preference write and fresh-login readback.
  // Only the already-authorized disposable B06 PG16 task DB is used.
  // The platform mode below is TEST SETUP, not an Admin HTTP/permission PASS.
  const mfaPost=async(c:B06Chrome,phase:string,payload:object,
    csrfMode:'valid'|'missing'|'bad'='valid')=>{
    c.phase=phase
    return c.callFunction(
      "async function(payload,mode){ const headers={'Content-Type':'application/json'}; if(mode==='valid'){const s=await fetch('/personal/session',{credentials:'include'}); if(!s.ok)return {preflight:s.status};headers['X-CSRF-Token']=(await s.json()).csrf_token;}else if(mode==='bad'){headers['X-CSRF-Token']='invalid';} const r=await fetch('/personal/mfa',{method:'POST',credentials:'include',headers,body:payload});return {status:r.status,cacheControl:r.headers.get('cache-control'),body:await r.json()};}",
      JSON.stringify(payload),csrfMode
    )
  }
  const prefBody=(version:number,enabled:boolean)=>({
    action:'personal',user_enabled:enabled,expected_version:version
  })
  const assertDeniedNoMutation=async(c:B06Chrome,phase:string,payload:object,
    status:number,mode:'valid'|'missing'|'bad'='valid')=>{
    const previous=await domain()
    const response=await mfaPost(c,phase,payload,mode)
    assert.equal(response.status,status,'MFA negative HTTP status')
    assert.equal(response.cacheControl,'no-store','Rejected MFA POST must not be cached')
    assert.deepEqual(await domain(),previous,'MFA rejection must leave data, audit and outbox unchanged')
    report.checks.push({phase,actor:c.actor,http:status,noMutation:true})
  }
  // A Person enrolled under mandatory MFA cannot edit personal opt-in.
  await assertDeniedNoMutation(b,'mfa-required-blocks-personal-write',prefBody(0,true),403)
  await assertDeniedNoMutation(b,'mfa-foreign-person-selector',{
    ...prefBody(0,true),person_id:actors[0].person
  },400)
  await assertDeniedNoMutation(a,'mfa-ungranted-platform-write',{
    action:'platform',platform_mode:'optional',expected_version:0
  },403)

  // To accept a real Person write without forging a platform Staff identity,
  // stage ONLY the approved optional-mode policy in this fresh disposable DB.
  // This is a fixture mutation, intentionally NOT claimed as Admin HTTP/audit.
  const optionalSetup=await q(
    "update da_mfa_policy set platform_mode='optional',version=1 where id='current' and platform_mode='required' and version=0 returning id"
  )
  assert.equal(optionalSetup.length,1,'Disposable test policy switch must be uniquely bounded')
  assert.equal((await q("select count(*)::int n from da_platform_staff_grant"))[0].n,0,
    'No synthetic or forged Staff grant may be created')
  const staleAfterMode=await mfaGet(b,'/personal/mfa','include')
  assert.equal(staleAfterMode.status,403,'Old policy-stamped browser session must not survive mode change')

  // Reauthenticate through the native password+TOTP HTML path in the SAME
  // real Chrome profile; old cookies cannot be elevated to a new revision.
  const reLogin=async(c:B06Chrome,label:'A'|'B',person:string,phase:string)=>{
    c.phase=phase
    await c.eval("(()=>{document.getElementById('workspace').hidden=true;document.getElementById('login').hidden=false;for(const el of document.querySelectorAll('#login input,#challenge input'))el.value='';})()")
    await c.input('#login input[name=email]',process.env['B06_EMAIL_'+label]!)
    await c.input('#login input[name=password]',process.env['B06_PASSWORD_'+label]!)
    await c.click('#login button')
    await c.wait("!document.getElementById('challenge').hidden")
    const freshTotp=await c.nextLoginOtp()
    await c.input('#challenge input[name=code]',freshTotp)
    await c.click('#challenge button')
    await c.wait("!document.getElementById('workspace').hidden&&document.getElementById('person').textContent==="+JSON.stringify('Person: '+person))
    const token=await c.token()
    assert.ok(token,'Fresh native login must issue a browser cookie')
    await q('begin')
    try{
      const current=await new IdentitySessions(sql).current(token,true)
      assert.ok(current&&current.person_id===person&&current.auth_identity_id===actors[label==='A'?0:1].identity&&current.mfa_purpose==='full',
        'Fresh strong session must bind the original Person and native identity')
      const nativeProofs=challenges.filter((proof:any)=>proof.identity===current.auth_identity_id)
      assert.ok(nativeProofs.length>=2&&
        new Date(current.last_strong_auth_at).getTime()===
        new Date(nativeProofs[nativeProofs.length-1].completed).getTime(),
        'Fresh session must follow a newly completed native TOTP challenge')
      await q('commit')
    }catch(error){await q('rollback');throw error}
    report.checks.push({phase,actor:c.actor,nativeOtpChallenge:true,newStrongSession:true})
  }
  await reLogin(b,'B',actors[1].person,'mfa-optional-new-login-b')
  b.phase='mfa-optional-own-read-before-save'
  const beforePreference=await mfaGet(b,'/personal/mfa','include')
  assert.equal(beforePreference.status,200)
  assert.ok(beforePreference.body?.platform?.platform_mode==='optional'&&
    beforePreference.body?.platform?.version===1&&
    beforePreference.body?.personal?.person_id===actors[1].person&&
    beforePreference.body?.personal?.user_enabled===false&&
    beforePreference.body?.personal?.version===0&&
    beforePreference.body?.native_factor_state==='enabled'&&
    beforePreference.body?.effective_mfa_target?.user_control_allowed===true,
    'Optional mode must preserve exact Person binding and native factor state')
  // CSRF must be tested after optional-mode reauthentication; mandatory mode
  // would reject the same write even if CSRF validation were broken.
  await assertDeniedNoMutation(b,'mfa-missing-csrf',prefBody(0,true),403,'missing')
  await assertDeniedNoMutation(b,'mfa-invalid-csrf',prefBody(0,true),403,'bad')
  // Old cookie was minted before the preference revision. Keep it in memory
  // only to prove restart cannot resurrect a revoked/revision-stale session.
  const staleBeforePreferenceCookie=await b.token()
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(staleBeforePreferenceCookie??''),'B06 stale cookie requires opaque task-only token')
  const outboxBefore=await count('da_security_outbox')
  const auditBefore=(await q("select count(*)::int n from da_audit_event where action='mfa.person_preference.set'"))[0].n
  // Two simultaneous REAL HTTPS requests with the same strong session and
  // expected revision must not commit two preferences/outbox events. Depending
  // on lock ordering, the losing request is a version conflict (409) or an
  // invalidated old session (403); both are safe fail-closed outcomes.
  b.phase='mfa-personal-optional-save'
  const concurrent=await b.callFunction(
    "async function(payload){const s=await fetch('/personal/session',{credentials:'include'});if(!s.ok)return [{preflight:s.status}];const csrf=(await s.json()).csrf_token;const send=()=>fetch('/personal/mfa',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:payload});return Promise.all([send(),send()]).then(async results=>Promise.all(results.map(async r=>({status:r.status,cacheControl:r.headers.get('cache-control'),body:await r.json()}))));}",
    JSON.stringify(prefBody(0,true))
  )
  assert.ok(Array.isArray(concurrent)&&concurrent.length===2,
    'Two concurrent Chrome requests must both reach the real server')
  const outcomes=concurrent.map((reply:any)=>reply.status).sort((x:number,y:number)=>x-y)
  assert.ok(outcomes[0]===200&&[403,409].includes(outcomes[1]),
    'Only one concurrent preference request may commit')
  assert.ok(concurrent.every((reply:any)=>reply.cacheControl==='no-store'),
    'All concurrent MFA responses must be non-cacheable')
  const saved=concurrent.find((reply:any)=>reply.status===200)
  assert.ok(saved,'Optional preference must persist via real HTTPS POST')
  assert.equal(saved.cacheControl,'no-store')
  assert.ok(saved.body?.personal?.person_id===actors[1].person&&
    saved.body?.personal?.user_enabled===true&&saved.body?.personal?.version===1&&
    saved.body?.native_factor_state==='unverified',
    'Preference POST must return only exact saved Person and unverified native state')
  const rows=await q("select person_id,user_enabled,version from da_person_mfa_preference")
  assert.ok(rows.length===1&&rows[0].person_id===actors[1].person&&
    rows[0].user_enabled===true&&rows[0].version===1,
    'Only Person B preference may have been written')
  assert.equal(await count('da_security_outbox'),outboxBefore+1,
    'Committed preference must publish one security outbox item')
  const audits=await q(
    "select actor_person_id,actor_id,target_id,previous_values,new_values from da_audit_event where action='mfa.person_preference.set'"
  )
  assert.equal(audits.length,auditBefore+1)
  const audit=audits[audits.length-1]
  const next=typeof audit.new_values==='string'?JSON.parse(audit.new_values):audit.new_values
  assert.ok(audit.actor_person_id===actors[1].person&&audit.actor_id===actors[1].actor&&
    audit.target_id===actors[1].person&&next.user_enabled===true,
    'Audit must attribute the committed preference solely to Person B')
  const staleAfterSave=await mfaGet(b,'/personal/mfa','include')
  assert.equal(staleAfterSave.status,403,'Old preference-stamped session must become invalid')

  await reLogin(b,'B',actors[1].person,'mfa-personal-new-login-readback')
  b.phase='mfa-personal-readback-after-new-login'
  const persisted=await mfaGet(b,'/personal/mfa','include')
  assert.ok(persisted.status===200&&persisted.cacheControl==='no-store'&&
    persisted.body?.personal?.person_id===actors[1].person&&
    persisted.body?.personal?.user_enabled===true&&
    persisted.body?.personal?.version===1&&
    persisted.body?.native_factor_state==='enabled'&&
    persisted.body?.platform?.platform_mode==='optional',
    'New password+native TOTP login must observe committed preference')
  await assertDeniedNoMutation(b,'mfa-stale-version-rejected',prefBody(0,true),409)
  await assertDeniedNoMutation(b,'mfa-native-factor-disable-not-silent',prefBody(1,false),409)

  await reLogin(a,'A',actors[0].person,'mfa-other-person-new-login')
  a.phase='mfa-other-person-still-default'
  const unrelated=await mfaGet(a,'/personal/mfa','include')
  assert.ok(unrelated.status===200&&
    unrelated.body?.personal?.person_id===actors[0].person&&
    unrelated.body?.personal?.user_enabled===false&&
    unrelated.body?.personal?.version===0,
    'Other Person must not inherit changed MFA preference')
  await assertDeniedNoMutation(a,'mfa-cross-person-post-rejected',{
    ...prefBody(0,true),person_id:actors[1].person
  },400)
  await assertDeniedNoMutation(a,'mfa-owner-not-platform-staff',{
    action:'platform',platform_mode:'disabled',expected_version:1
  },403)
  // All successful and failed POSTs came from real Chrome HTTPS; no mocked
  // route handler, client-provided Person authority or native MFA bypass.
  const expectedMfaPosts=[
    [b,'mfa-personal-optional-save',200],
    [b,'mfa-stale-version-rejected',409],
    [b,'mfa-native-factor-disable-not-silent',409],
    [a,'mfa-owner-not-platform-staff',403],
    [a,'mfa-cross-person-post-rejected',400],
  ] as const
  await until(async()=>expectedMfaPosts.every(([chrome,phase,status])=>
    chrome.http.some((entry:any)=>entry.phase===phase&&
      entry.method==='POST'&&entry.path==='/personal/mfa'&&
      entry.status===status&&entry.tls?.protocol)),
    5000,'B06 real TLS CDP POST evidence')
  report.mfaPreferenceAcceptance={
    modeSource:'DISPOSABLE SQL TEST FIXTURE; NOT PLATFORM ADMIN HTTP ACCEPTANCE',
    personWriteHttp:200,concurrentLoserHttp:outcomes[1],oneCommitAcrossTwoHttpsPosts:true,
    staleRevisionHttp:409,rejectedByPolicyHttp:403,
    crossPersonSelectorHttp:400,missingCsrfHttp:403,
    oldSessionsRejected:true,newChromeTotpSessionReadback:true,
    auditDelta:1,securityOutboxDelta:1,otherPersonUnaffected:true,
    productionSettingsChanged:false
  }


  // #366: A real Medusa HTTP worker must EXIT and a second, independent
  // native Medusa process must boot against the SAME disposable PostgreSQL DB.
  // Merely closing/reopening a Node listener in this test process is NOT
  // accepted as restart persistence. The source, YAML and shared runner stay
  // untouched: the two extra Medusa exec workers are task-owned children.
  const beforeRestartPolicy=await q("select platform_mode,version from da_mfa_policy where id='current'")
  const beforeRestartPersons=await q('select person_id,user_enabled,version from da_person_mfa_preference order by person_id')
  const beforeRestartMfaAudit=(await q(
    "select count(*)::int n from da_audit_event where action in ('mfa.platform_policy.set','mfa.person_preference.set')"
  ))[0].n
  const beforeRestartPreferenceOutbox=(await q(
    "select count(*)::int n from da_security_outbox o join da_audit_event e on e.id=o.audit_event_id where e.action in ('mfa.platform_policy.set','mfa.person_preference.set')"
  ))[0].n
  assert.ok(beforeRestartPolicy.length===1&&beforeRestartPolicy[0].platform_mode==='optional'&&
    beforeRestartPolicy[0].version===1&&beforeRestartPersons.length===1&&
    beforeRestartPersons[0].person_id===actors[1].person&&beforeRestartPersons[0].user_enabled===true&&
    beforeRestartPersons[0].version===1,'B06 restart requires exact committed preference')
  const port=Number(new URL(origin).port)
  // Every outstanding HTTPS connection belongs to this task-owned server.
  const priorServer=server!
  // Bun 1.4.2 needs task keep-alives closed BEFORE server.close().
  priorServer.closeAllConnections()
  await new Promise<void>((resolve,reject)=>{
    priorServer.close(error=>error?reject(error):resolve())
  })
  server=undefined
  await app!.close();app=undefined
  const workerEnv={...process.env,B06_RESTART_PORT:String(port),
    B06_RESTART_TLS_DIR:temp,B06_RESTART_SENTINEL:'b06-test-only-native-http-worker-v1',
    DOGRUADRES_PUBLIC_ORIGIN:origin}
  const launchFreshServer=async()=>{
    assert.equal(freshWorker,undefined,'Only one task-owned Medusa HTTP worker can listen')
    let ready=false,failed=false,tail=''
    const worker=spawn(process.execPath,
      ['run','medusa','exec','./integration-tests/postgres/b06-restart-http.exec.ts'],
      {cwd:process.cwd(),env:workerEnv,stdio:['ignore','pipe','pipe']})
    freshWorker=worker
    // Do not surface Medusa stdout/stderr: it may contain sensitive text.
    worker.stdout?.on('data',(chunk:Buffer)=>{
      tail=(tail+String(chunk)).slice(-512)
      if(tail.includes('B06_RESTART_HTTP_READY'))ready=true
    })
    worker.stderr?.on('data',()=>{})
    worker.on('error',()=>{failed=true})
    await until(async()=>ready&&!failed&&worker.exitCode===null,85000,
      'fresh native Medusa HTTP worker within B06 disposable scope')
    assert.ok(worker.pid&&worker.pid!==process.pid,'Restart worker must be a distinct OS process')
    return worker.pid
  }
  const stopFreshServer=async()=>{
    assert.ok(freshWorker&&freshWorker.pid,'Only own B06 worker may receive SIGTERM')
    const worker=freshWorker
    assert.ok(worker.kill('SIGTERM'),'Task worker graceful shutdown signal must succeed')
    await until(async()=>worker.exitCode!==null||worker.signalCode!==null,20000,
      'B06 task worker process exit')
    assert.equal(worker.exitCode,0,'Task native Medusa HTTP worker must shut down cleanly')
    freshWorker=undefined
  }
  const oldCookieStatus=async()=>new Promise<number>((resolve,reject)=>{
    const r=request({hostname:'127.0.0.1',port,path:'/personal/mfa',
      ca,servername:'',headers:{Cookie:'da_session='+staleBeforePreferenceCookie}},
      response=>{response.resume();response.on('end',()=>resolve(response.statusCode??0))})
    r.on('error',reject);r.end()
  })
  const reloginWithFreshWorker=async(c:B06Chrome,label:'A'|'B',person:string,phase:string)=>{
    c.phase=phase
    const newHttpStart=c.http.length
    await c.eval("(()=>{document.getElementById('workspace').hidden=true;document.getElementById('login').hidden=false;for(const el of document.querySelectorAll('#login input,#challenge input'))el.value='';})()")
    await c.input('#login input[name=email]',process.env['B06_EMAIL_'+label]!)
    await c.input('#login input[name=password]',process.env['B06_PASSWORD_'+label]!)
    await c.click('#login button')
    await c.wait("!document.getElementById('challenge').hidden")
    await c.input('#challenge input[name=code]',await c.nextLoginOtp())
    await c.click('#challenge button')
    await c.wait("!document.getElementById('workspace').hidden&&document.getElementById('person').textContent==="+JSON.stringify('Person: '+person))
    const token=await c.token()
    assert.ok(token,'Fresh worker must issue a strong native session cookie')
    await q('begin')
    try{
      const own=await new IdentitySessions(sql).current(token,true)
      assert.ok(own&&own.person_id===person&&own.auth_identity_id===
        actors[label==='A'?0:1].identity&&own.mfa_purpose==='full',
        'New worker native challenge must grant only exact verified Person')
      await q('commit')
    }catch(error){await q('rollback');throw error}
    const result=await mfaGet(c,'/personal/mfa','include')
    assert.ok(result.status===200&&result.cacheControl==='no-store'&&
      result.body?.platform?.platform_mode==='optional'&&result.body?.platform?.version===1&&
      result.body?.personal?.person_id===person&&
      result.body?.personal?.user_enabled===(label==='B')&&
      result.body?.personal?.version===(label==='B'?1:0)&&
      result.body?.native_factor_state==='enabled','Restart must preserve exact Person and native MFA')
    await until(async()=>{
      const fresh=c.http.slice(newHttpStart)
      return fresh.some((entry:any)=>entry.phase===phase&&entry.method==='POST'&&
        entry.path==='/personal/challenge'&&entry.status===200&&entry.tls?.protocol)&&
        fresh.some((entry:any)=>entry.phase===phase&&entry.method==='GET'&&
        entry.path==='/personal/mfa'&&entry.status===200&&entry.tls?.protocol)
    },5000,'B06 restarted native TLS Chrome challenge and GET evidence')
    return result.status
  }
  const workerPids:number[]=[]
  const httpOutcomes:{a:number;b:number}[]=[]
  for(const stage of [1,2]){
    workerPids.push(await launchFreshServer())
    assert.equal(await oldCookieStatus(),403,'Old revoked Person cookie must remain denied after restart')
    // Both native Chrome sessions use the same bounded PG client for R1
    // strong-auth checks; serialize that transaction instead of racing it.
    const aStatus=await reloginWithFreshWorker(a,'A',actors[0].person,'mfa-restart-'+stage+'-person-a')
    const bStatus=await reloginWithFreshWorker(b,'B',actors[1].person,'mfa-restart-'+stage+'-person-b')
    httpOutcomes.push({a:aStatus,b:bStatus})
    await stopFreshServer()
  }
  assert.notEqual(workerPids[0],workerPids[1],
    'Restart requires two distinct terminated Medusa HTTP worker processes')
  const afterRestartPolicy=await q("select platform_mode,version from da_mfa_policy where id='current'")
  const afterRestartPersons=await q('select person_id,user_enabled,version from da_person_mfa_preference order by person_id')
  const afterRestartMfaAudit=(await q(
    "select count(*)::int n from da_audit_event where action in ('mfa.platform_policy.set','mfa.person_preference.set')"
  ))[0].n
  const afterRestartPreferenceOutbox=(await q(
    "select count(*)::int n from da_security_outbox o join da_audit_event e on e.id=o.audit_event_id where e.action in ('mfa.platform_policy.set','mfa.person_preference.set')"
  ))[0].n
  assert.deepEqual(afterRestartPolicy,beforeRestartPolicy,'Native server restart must not change platform revision')
  assert.deepEqual(afterRestartPersons,beforeRestartPersons,'Person preferences must persist across process exit')
  assert.equal(afterRestartMfaAudit,beforeRestartMfaAudit,
    'Readback and new login must not append a policy/preference mutation audit')
  assert.equal(afterRestartPreferenceOutbox,beforeRestartPreferenceOutbox,
    'Readback and new login must not duplicate the MFA preference security outbox')
  report.restartAcceptance={twoFreshNativeMedusaWorkerProcesses:true,
    firstWorkerExitedBeforeSecond:true,distinctProcessIds:true,
    identicalTaskOnlyPg16Database:true,oldCookieDenied403:true,
    allFourFreshNativeTotpChromeHttp200:httpOutcomes.every(o=>o.a===200&&o.b===200),
    optionalPlatformRevisionPreserved:true,preferenceRevisionPreserved:true,
    noPolicyOrPreferenceAuditMutation:true,noDuplicatePreferenceSecurityOutbox:true,realChromeHttps:true,
    userAcceptanceScope:'ONLY B06 PERSONAL RESTART; NOT PLATFORM STAFF OR 12-STATE ACCEPTANCE'}

  report.status='PASS pending independent exact-HEAD acceptance'
 }catch(error){
  report.status='FAIL / no retry'
  report.failure={category:error instanceof Error?error.name:'Unknown',phases:browsers.map(c=>({actor:c.actor,phase:c.phase})),frames:error instanceof Error?error.stack?.split('\n').slice(1,6).filter(s=>s.trim().startsWith('at ')):[]}
  throw Error('B06 acceptance failed; inspect sanitized phase/frame evidence; no retry')
 }finally{
  auth.verifyAuthMfaChallenge=original
  if(freshWorker){
    const worker=freshWorker
    try{
      if(worker.exitCode===null&&worker.signalCode===null)worker.kill('SIGTERM')
      await until(async()=>worker.exitCode!==null||worker.signalCode!==null,15000,
        'B06 task child cleanup')
    }catch{workerCleanupOk=false}
  }
  for(const c of browsers){await c.close();report.browsers.push({actor:c.actor,http:c.http,cleanup:c.cleanup})}
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()))
  await app?.close();await pg.end();rmSync(temp,{recursive:true,force:true});report.cleanup={chromeProfiles:browsers.every(c=>c.cleanup),taskTlsRemoved:true,medusaWorkerExited:workerCleanupOk&&!freshWorker?.pid}
  writeFileSync(join(output,'evidence.json'),JSON.stringify(report,null,2))
  const hashes=readdirSync(output).filter(n=>n!=='SHA256SUMS').map(n=>createHash('sha256').update(readFileSync(join(output,n))).digest('hex')+'  '+n)
  writeFileSync(join(output,'SHA256SUMS'),hashes.join('\n')+'\n')
  console.log('B06_UI_EVIDENCE '+JSON.stringify(report))
 }
 assert.equal(report.status,'PASS pending independent exact-HEAD acceptance');console.log('PASS B06-UI real Chrome/native MFA/HTTP/SQL')
}
