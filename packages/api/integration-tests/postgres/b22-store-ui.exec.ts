/**
 * M0 B22 — Real Chrome + native Medusa Auth MFA + real secondary Member
 * dual proof through /personal/links + same-origin Organization Store GET.
 * The Organization/Store approval rows are SYNTHETIC FIXTURES in a single
 * random task-only CI database; they are NOT a real platform approval service.
 * No protected writes, credentials or real documents are stored in evidence.
 */
import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import {createServer as tlsServer,request as tlsRequest} from "node:https"
import {createServer as plainServer} from "node:http"
import {dirname} from "node:path"
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from "node:fs"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {spawn,spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {ingressConfig} from "../../src/utils/ingress-config"
import {requireOrganizationAccess} from "../../src/api/dogruadres/authorization"
import {completeCartWithSplitOrdersWorkflow,approveSellerWorkflow,suspendSellerWorkflow,unsuspendSellerWorkflow,createProductsWorkflow,createOffersWorkflow} from "@mercurjs/core/workflows"
import {createShippingProfilesWorkflow,addToCartWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow,updateRegionsWorkflow,createPaymentCollectionForCartWorkflow,createPaymentSessionsWorkflow,capturePaymentWorkflow} from "@medusajs/medusa/core-flows"
import {B06Chrome} from "./b06-ui-browser"
import {SmtpResponsePrivacyGuard} from "./smtp-response-privacy-guard"
import {otp,until} from "./b19-browser"
import {projectFoundationAuditEvent} from "../../src/modules/dogruadres-audit-index/envelope"

// Uses only the existing Mercur module middleware and its real built dashboard.
// This dedicated child terminates after invalidating its two genuine MFA sessions.
async function verifyAdminSmtp(browser:B06Chrome, denied:B06Chrome, container:any,
  person:string, otherPerson:string, q:(sql:string,args?:unknown[])=>Promise<any[]>,guard:SmtpResponsePrivacyGuard) {
  assert.equal(container.resolve("admin_ui").getServingMode(),"static")
  const secret=process.env.B22_SMTP_CANARY!
  assert.match(secret,/^b22-smtp-[0-9a-f]{48}$/)
  browser.secretCanary=secret;denied.secretCanary=secret
  // Real HTTPS egress is the privacy authority; CDP body request IDs
  // can expire on navigation. Retain separate Chrome console leak checks.
  assert.equal(guard.secret,secret)
  const assertPrivateResponses=()=>guard.assertNoLeaks()
  const path="/dashboard/settings/smtp"
  const evidence=process.env.B06_EVIDENCE_DIR!
  assert.equal(evidence,join(process.env.RUNNER_TEMP!,"b22-admin-smtp-evidence"))
  mkdirSync(evidence,{recursive:true})
  const completed:string[]=[]
  const mark=(scenario:string)=>{
    completed.push(scenario)
    writeFileSync(join(evidence,"completed-scenarios.json"),JSON.stringify({source:process.env.GITHUB_SHA,completed},null,2))
  }
  const open=async(b:B06Chrome)=>{
    assertPrivateResponses()
    b.phase='native-admin-smtp-navigation'
    await b.send("Page.navigate",{url:b.origin+path})
    try {await b.wait("document.body.textContent.includes('Platform SMTP Ayarları')")}
    catch(error){
      // Before any SMTP secret input: bounded diagnostics of this one native
      // navigation. No cookies, headers, HTML source or input values retained.
      await b.screenshot(join(evidence,"native-navigation-failed.png"))
      writeFileSync(join(evidence,"native-navigation-failed.json"),JSON.stringify({
        source:process.env.GITHUB_SHA,
        document:await b.eval("({onExpectedPath:location.pathname==='/dashboard/settings/smtp',headingPresent:document.body.textContent.includes('Platform SMTP Ayarları')})"),
        errors:b.runtimeErrors,
        http:b.http.filter(r=>r.phase===b.phase).map(({method,path,status})=>({method,path,status})),
      },null,2))
      throw error
    }
    assert.equal(await b.eval("location.pathname"),path)
  }
  const read=async(b:B06Chrome)=>{
    const response=await b.eval(`(async()=>{const r=await fetch('/personal/platform/smtp');return {status:r.status,body:await r.json()}})()`)
    // Inspect while this document still owns the completed response body.
    assertPrivateResponses()
    return response
  }
  const hidden=async(b:B06Chrome)=>b.wait("!document.querySelector('#smtp-host') && !document.body.textContent.includes('Yapılandırma yükleniyor')")
  const reload=async(b:B06Chrome,status:number)=>{
    // Inspect response bodies before navigating away from their document.
    assertPrivateResponses()
    const start=b.http.length
    await b.send("Page.reload",{ignoreCache:true})
    await until(async()=>b.http.slice(start).some(r=>r.path==='/personal/platform/smtp'&&r.method==='GET'&&r.status===status),
      20000,'New document SMTP GET '+status)
  }
  const digest=()=>q("select id,enabled,host,port,security,username,password_encrypted,from_email,from_name,version from da_platform_smtp_settings order by id")
  const before=await digest()
  assert.deepEqual(before,[],"Fresh dedicated SMTP database")
  // Negative checks precede any valid settings write.
  await open(denied);await hidden(denied)
  assert.equal((await read(denied)).status,403)
  assert.deepEqual(await digest(),before)
  mark("Unauthorized real MFA session GET403; no SMTP rows")
  const grant="da_staff_smtp_"+randomBytes(12).toString("hex")
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable SMTP acceptance fixture')`,[grant,person])
  await open(browser)
  await browser.wait("!!document.querySelector('#smtp-host')")
  const first=await read(browser)
  assert.equal(first.status,200);assert.equal(first.body.can_manage,true)
  assert.equal(first.body.settings.version,0)
  assert.equal(await browser.eval("document.querySelector('#smtp-host').value"),first.body.settings.host)
  mark("Native Admin render and explicitly granted MFA session GET200")
  await browser.screenshot(join(evidence,"authorized-read.png"))
  writeFileSync(join(evidence,"authorized-read.json"),JSON.stringify({
    source:process.env.GITHUB_SHA,nativeModule:"admin_ui",sameOrigin:true,
    realMfa:true,unauthorizedStatus:403,authorizedStatus:first.status,version:first.body.settings.version,
  },null,2))
  // DOM inputs and submit use real Chrome input events. SMTP remains disabled;
  // neither the separate send-test control nor any provider is invoked.
  if(await browser.eval("document.querySelector('#smtp-toggle').getAttribute('aria-checked')==='true'"))
    await browser.click("#smtp-toggle")
  const replace=async(selector:string,value:string)=>{
    await browser.click(selector)
    await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65})
    await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65})
    await browser.send("Input.insertText",{text:value})
  }
  await replace("#smtp-host","smtp.b22.example.invalid")
  await replace("#smtp-from-email","b22@example.invalid")
  await replace("#smtp-pass",secret)
  assert.equal(await browser.eval("document.querySelector('#smtp-host').value==='smtp.b22.example.invalid'"),true)
  assert.equal(await browser.eval("document.querySelector('#smtp-from-email').value==='b22@example.invalid'"),true)
  assert.equal(await browser.eval("document.querySelector('form').checkValidity()"),true)
  const saveStart=browser.http.length
  await browser.click("form button[type=submit]")
  try {await browser.wait("document.body.textContent.includes('Ayar sürümü: 1')")}
  catch(error){
    // Read back this one ambiguous attempt before the dedicated DB is retired.
    // Never retry its submit; retain no request payload or password/ciphertext.
    const posts=browser.http.slice(saveStart).filter(r=>r.path==='/personal/platform/smtp'&&r.method==='POST')
    // Diagnostic metadata only: never depend on a stale CDP response body.
    const responses=posts.map(post=>({status:post.status}))
    const state=await browser.eval(`({
      versionRendered:document.body.textContent.includes('Ayar sürümü: 1'),
      hostMatches:document.querySelector('#smtp-host')?.value==='smtp.b22.example.invalid',
      senderMatches:document.querySelector('#smtp-from-email')?.value==='b22@example.invalid',
      validity:Array.from(document.querySelectorAll('form input')).map(e=>({id:e.id,valid:e.validity.valid})),
    })`)
    const rows=await q("select id,enabled,version,host from da_platform_smtp_settings order by id")
    writeFileSync(join(evidence,"save-failed.json"),JSON.stringify({source:process.env.GITHUB_SHA,
      responses,state,rows,consoleSecretLeaked:browser.secretLeaks},null,2).replaceAll(secret,'[redacted]'))
    throw error
  }
  assertPrivateResponses()
  const saved=await digest()
  assert.equal(saved.length,1);assert.equal(saved[0].enabled,false)
  assert.equal(saved[0].host,"smtp.b22.example.invalid");assert.equal(saved[0].version,1)
  assert.match(saved[0].password_encrypted,/^v1:/)
  guard.bindCiphertext(saved[0].password_encrypted)
  assert.ok(!JSON.stringify(saved).includes(secret),"No plaintext persisted")
  const safe=await read(browser)
  assert.equal(safe.status,200);assert.equal(safe.body.settings.has_password,true)
  assert.ok(!JSON.stringify(safe).includes(secret))
  assert.equal(safe.body.settings.password,null);assert.ok(!('password_encrypted' in safe.body.settings))
  mark("Real browser save HTTP200; PG16 version1, disabled, encrypted password; GET secret null")
  await reload(browser,200)
  await browser.wait("document.body.textContent.includes('Ayar sürümü: 1')")
  assert.equal(await browser.eval("document.querySelector('#smtp-host').value"),saved[0].host)
  assert.equal(await browser.eval("document.querySelector('#smtp-pass').value"),"")
  await browser.screenshot(join(evidence,"saved-refreshed.png"))
  mark("New document refresh GET200 and persisted settings rendered; password input empty")
  // A stale real HTTP writer must not overwrite the newer browser save.
  const stale=await browser.eval(`(async()=>{const s=await(await fetch('/personal/session')).json();
    const r=await fetch('/personal/platform/smtp',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
    body:JSON.stringify({action:'save',enabled:false,host:'stale.example.invalid',port:465,security:'ssl',from_email:'b22@example.invalid',expected_version:0})});
    return {status:r.status,body:await r.json()}})()`)
  assert.equal(stale.status,409);assertPrivateResponses();assert.deepEqual(await digest(),saved)
  mark("Stale HTTP409 with unchanged PG16 settings")
  // Real database read failure, not a mocked successful API or component.
  await q("alter table da_platform_smtp_settings rename to b22_smtp_settings_fault")
  try {
    await reload(browser,500);await hidden(browser)
    assert.equal((await read(browser)).status,500)
  } finally {await q("alter table b22_smtp_settings_fault rename to da_platform_smtp_settings")}
  const enabled=process.env.DOGRUADRES_IDENTITY_ENABLED
  try {
    process.env.DOGRUADRES_IDENTITY_ENABLED="false"
    await reload(browser,503);await hidden(browser)
    assert.equal((await read(browser)).status,503)
  } finally {process.env.DOGRUADRES_IDENTITY_ENABLED=enabled}
  mark("Real GET500 and GET503 keep configuration form hidden")
  // Revoked grant denies even the original strong, genuine session.
  await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",[grant])
  await reload(browser,403);await hidden(browser)
  assert.equal((await read(browser)).status,403)
  mark("Revoked platform grant GET403 and form hidden")
  // Give B an explicit grant, prove its real MFA session, then expire it.
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable expiry fixture')`,[grant+"_b",otherPerson])
  assert.equal((await read(denied)).status,200)
  const bHash=createHash('sha256').update(await denied.token()).digest('hex')
  await q("update da_browser_session set created_at=clock_timestamp()-interval '30 days' where id=$1",[bHash])
  assert.equal((await read(denied)).status,403)
  await reload(denied,403);await hidden(denied)
  mark("Expired real session GET403 and form hidden")
  // A receives a new explicit fixture grant; a terminal DB fixture then revokes
  // its genuine session. No session is fabricated or restored by the test.
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable revocation fixture')`,[grant+"_a",person])
  assert.equal((await read(browser)).status,200)
  const aHash=createHash('sha256').update(await browser.token()).digest('hex')
  await q("update da_browser_session set status='revoked' where id=$1",[aHash])
  assert.equal((await read(browser)).status,403)
  await reload(browser,403);await hidden(browser)
  mark("Revoked real session GET403 and form hidden")
  assert.deepEqual(await digest(),saved)
  await guard.assertComplete()
  for(const b of [browser,denied]){
    assertPrivateResponses()
    assert.equal(b.secretLeaks,false,"Secret in Chrome protocol/console")
  }
  assert.ok(browser.http.some(r=>r.path===path&&r.status===200&&r.tls))
  assert.ok(browser.http.some(r=>r.path==='/personal/platform/smtp'&&r.method==='POST'&&r.status===200))
  writeFileSync(join(evidence,"acceptance.json"),JSON.stringify({
    source:process.env.GITHUB_SHA,sameOrigin:true,nativeModule:"admin_ui",servingMode:"static",
    syntheticOnly:true,smtpEnabled:false,versionBefore:0,versionAfter:1,
    scenarios:["MFA and explicit grant GET200","browser save and PostgreSQL readback","refresh",
      "stale409 unchanged","unauthorized403","expired403","revoked403","GET500 form hidden","GET503 form hidden"],
    http:[...browser.http,...denied.http].map(({method,path,status,tls})=>({method,path,status,tls})),
  },null,2))
  process.stdout.write("PASS B22 Chrome: native Admin SMTP same-origin MFA/grant GET200, browser save/version/PG16/refresh, stale409 unchanged, unauthorized/expired/revoked403, real500/503 form hidden; disabled synthetic SMTP, no send\n")
}

async function verifyMembershipNonDisclosure({
  organizationId,activeId,foreignId,personId,browser,foundation,q
}:{
  organizationId:string;activeId:string;foreignId:string;personId:string
  browser:B06Chrome;foundation:any;q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
  // Extra synthetic target only in the existing task-owned CI database.
  // The real Owner and the authenticated unauthorized Member stay untouched.
  const [revokedPerson]=await foundation.createPeople([{}])
  const [revoked]=await foundation.createMemberships([{
    organization_id:organizationId,person_id:revokedPerson.id,role:"member",
    status:"revoked",protected_owner:false,revoked_at:new Date()
  }])
  const missingId="daomem_"+randomBytes(16).toString("hex")
  const targets=[{kind:"active",id:activeId},{kind:"missing",id:missingId},
    {kind:"foreign",id:foreignId},{kind:"revoked",id:revoked.id}]
  const rows=await q(`select id,organization_id,status,revoked_at
    from da_organization_membership where id=any($1::text[])`,[targets.map(t=>t.id)])
  assert.equal(rows.length,3,"Exactly three real targets and one nonexistent target")
  assert.ok(rows.some(r=>r.id===activeId&&r.organization_id===organizationId&&r.status==="active"))
  assert.ok(rows.some(r=>r.id===foreignId&&r.organization_id!==organizationId&&r.status==="active"))
  assert.ok(rows.some(r=>r.id===revoked.id&&r.organization_id===organizationId&&r.status==="revoked"&&r.revoked_at))
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  const token=await browser.token()
  assert.match(token??"",/^[A-Za-z0-9_-]{43}$/)
  const sessionRows=await q(`select s.person_id,s.status,s.last_strong_auth_at,s.csrf_hash,
    statement_timestamp()<s.last_strong_auth_at+p.recent_auth_seconds*interval '1 second' recent
    from da_browser_session s cross join da_session_policy p where s.id=$1 and p.id='current'`,
    [createHash("sha256").update(token!).digest("hex")])
  assert.equal(sessionRows.length,1)
  assert.equal(sessionRows[0].person_id,personId)
  assert.equal(sessionRows[0].status,"active")
  assert.ok(sessionRows[0].last_strong_auth_at,"Real native MFA-completed session required")
  assert.equal(sessionRows[0].recent,true,"Sensitive HTTP must have recent strong authentication")
  const actor=await q(`select role,status,protected_owner from da_organization_membership
    where organization_id=$1 and person_id=$2 and deleted_at is null`,[organizationId,personId])
  assert.deepEqual(actor,[{role:"member",status:"active",protected_owner:false}])
  // One current CSRF value, same cookie, Organization, operation and role;
  // only membership_id changes. Keep CSRF/cookie out of evidence.
  const session=await browser.eval(`(async()=>{
    const r=await fetch('/personal/session');return {status:r.status,body:await r.json()}
  })()`)
  assert.equal(session.status,200)
  assert.match(session.body.csrf_token,/^[A-Za-z0-9_-]{43}$/)
  assert.equal(createHash("sha256").update(session.body.csrf_token).digest("hex"),
    sessionRows[0].csrf_hash,"CSRF must match the persisted session, not cause a false 403")
  const snapshot=async()=>{
    const state:Record<string,unknown>={}
    for(const table of ["da_organization_membership","da_audit_event",
      "da_audit_outbox","da_security_outbox"])
      state[table]=await q(`select id,md5(to_jsonb(t)::text) fingerprint from ${table} t order by id`)
    return state
  }
  const before=await snapshot()
  for(const target of targets){
    const response=await browser.eval(`(async()=>{
      const r=await fetch('/personal/memberships',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':${JSON.stringify(session.body.csrf_token)}},
        body:JSON.stringify({action:'role',organization_id:${JSON.stringify(organizationId)},
          membership_id:${JSON.stringify(target.id)},role:'admin'})})
      return {status:r.status,body:await r.json()}
    })()`)
    // Read back even on an unexpected response before stopping; no retry.
    assert.deepEqual(await snapshot(),before,
      "Unauthorized "+target.kind+" target must leave all membership/audit/outbox rows unchanged")
    assert.equal(response.status,403,"Non-disclosing HTTP denial for "+target.kind)
    assert.deepEqual(response.body,{message:"Access denied"},
      "All target states must return the same safe body: "+target.kind)
    assert.equal(await browser.token(),token,"All four requests must retain the same session")
    process.stdout.write("PASS B22 Chrome: membership non-disclosure "+target.kind+
      " target HTTP403 identical safe body; PG16 membership/canonical audit/audit outbox/security outbox unchanged\n")
  }
}

// Keep this bounded real Chrome/PG16 policy check independent of the already
// large native acceptance runner, without suppressing TypeScript checking.
async function verifyOwnerMembershipManagePolicy({
  organizationId,targetMembershipId,ownerPersonId,ownerActorId,browser,foundation,q
}:{
  organizationId:string;targetMembershipId:string;ownerPersonId:string;ownerActorId:string
  browser:B06Chrome;foundation:any;q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
    // The same task-owned ordinary Alpha membership must survive a centrally
    // narrowed Owner membership.manage policy, including direct native service
    // calls. Read-only member.list remains separate and available.
    const membershipPolicyRows=await q(`select id,person_id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,
      [organizationId])
    const membershipPolicyAudits=await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizationId])
    const membershipPolicyOutboxes=await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizationId])
    const membershipChangedAuditBefore=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action='organization.membership_changed'`,[organizationId,targetMembershipId])
    const oldMembershipActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit,invitation.manage,membership.list"
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const deniedMember=await browser.eval(`(async()=>{
        const org=${JSON.stringify(organizationId)}
        const member=${JSON.stringify(targetMembershipId)}
        const session=await(await fetch('/personal/session')).json()
        const post=async(value)=>{
          const r=await fetch('/personal/memberships',{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
            body:JSON.stringify(value)})
          return r.status
        }
        return {
          list:(await fetch('/personal/memberships?organization='+org)).status,
          role:await post({action:'role',organization_id:org,membership_id:member,role:'admin'}),
          revoke:await post({action:'revoke',organization_id:org,membership_id:member}),
          protectedOwner:await post({action:'protected_owner',organization_id:org,
            membership_id:member,role:'owner'})
        }
      })()`)
      assert.deepEqual(deniedMember,{list:200,role:403,revoke:403,protectedOwner:403},
        "Narrowed Owner role can still list but cannot mutate memberships")
      await assert.rejects(foundation.changeMembership({
        organization_id:organizationId,membership_id:targetMembershipId,
        actor_person_id:ownerPersonId,actor_type:"user",actor_id:ownerActorId,role:"admin"
      }),/Organization action permission is required/)
      assert.deepEqual(await q(`select id,person_id,role,status,protected_owner,revoked_at
        from da_organization_membership where organization_id=$1 order by id`,
        [organizationId]),membershipPolicyRows,
        "Denied membership.manage must not change membership or protected Owner state")
      assert.deepEqual(await q(`select id from da_audit_event
        where organization_id=$1 order by id`,[organizationId]),
        membershipPolicyAudits,"Denied membership.manage cannot append audit")
      assert.deepEqual(await q(`select x.id from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.organization_id=$1 order by x.id`,[organizationId]),
        membershipPolicyOutboxes,"Denied membership.manage cannot append audit outbox")
    }finally{
      if(oldMembershipActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=oldMembershipActions
    }
    // Prove the restored Owner default using the SAME real HTTPS/CSRF path.
    // Apply a reversible ordinary Member->Admin->Member transition only to
    // our disposable test membership, never to a protected Owner.
    const restoredMembership=await browser.eval(`(async()=>{
      const org=${JSON.stringify(organizationId)}
      const member=${JSON.stringify(targetMembershipId)}
      const session=await(await fetch('/personal/session')).json()
      const post=async(role)=>{
        const r=await fetch('/personal/memberships',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
          body:JSON.stringify({action:'role',organization_id:org,membership_id:member,role})})
        return {status:r.status,body:r.status===200?await r.json():null}
      }
      const promoted=await post('admin')
      const restored=promoted.status===200?await post('member'):{status:0,body:null}
      return {promoted:promoted.status,restored:restored.status,
        promotedRole:promoted.body?.membership?.role,restoredRole:restored.body?.membership?.role}
    })()`)
    assert.deepEqual(restoredMembership,{promoted:200,restored:200,
      promotedRole:"admin",restoredRole:"member"},
      "Restored Owner role policy must permit HTTP role changes in the same Organization")
    const finalMembershipState=await q(`select role,status,protected_owner,revoked_at
      from da_organization_membership where id=$1`,[targetMembershipId])
    assert.deepEqual(finalMembershipState,[{role:"member",status:"active",
      protected_owner:false,revoked_at:null}],
      "Owner role acceptance must restore the test Member's exact state")
    const membershipChangedAudit=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action='organization.membership_changed'`,
      [organizationId,targetMembershipId])
    assert.equal(membershipChangedAudit[0].n,membershipChangedAuditBefore[0].n+2,
      "Both authorized transitions must append exactly one canonical audit/outbox each")
    process.stdout.write("PASS B22 Owner role policy: narrowed membership.manage denies Chrome role/revoke/protected Owner and native Foundation change; PG16 membership/audit/outbox unchanged; restored Owner role changes 200\n")
}
 
// Dedicated real Chrome/PG16 audit timeline read-policy verification.
// Keeps strict source/audit observation independent of the large B22 body.
async function verifyOwnerAuditTimelinePolicy({
  organizationId,adminMembershipId,browser,reviewer,q
}:{
  organizationId:string;adminMembershipId:string
  browser:B06Chrome;reviewer:B06Chrome
  q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
  const originalOwnerActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
  const originalCursorKey=process.env.DOGRUADRES_AUDIT_CURSOR_KEY
  const membershipBefore=await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership where organization_id=$1 order by id`,[organizationId])
  const eventsBefore=await q(`select id from da_audit_event
    where organization_id=$1 order by id`,[organizationId])
  const outboxBefore=await q(`select x.id from da_audit_outbox x
    join da_audit_event e on e.id=x.source_audit_event_id
    where e.organization_id=$1 order by x.id`,[organizationId])
  try{
    // Task-only fresh cursor signing key; never print it or persist in GitHub.
    process.env.DOGRUADRES_AUDIT_CURSOR_KEY=randomBytes(32).toString("base64")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const ownerDefault=await browser.eval(`(async()=>{
      const r=await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})
      return r.status
    })()`)
    assert.equal(ownerDefault,200,"Default protected Owner can read scoped audit timeline")
    // This is a disposable ordinary Member, never a protected Owner.
    await q("update da_organization_membership set role='admin',protected_owner=false,updated_at=clock_timestamp() where id=$1",[adminMembershipId])
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=
        "buyer.purchase,products.edit,invitation.manage,membership.manage,membership.list"
      const deniedOwner=await browser.eval(`(async()=>{
        const r=await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})
        const body=await r.json()
        return {status:r.status,privateItems:Object.hasOwn(body,'items'),message:body.message}
      })()`)
      assert.deepEqual(deniedOwner,{status:403,privateItems:false,message:"Access denied"},
        "Narrowed protected Owner must not receive even private audit items")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const adminRead=await reviewer.eval(`(async()=>{
        const r=await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})
        const body=await r.json()
        return {status:r.status,privateItems:Object.hasOwn(body,'items')}
      })()`)
      assert.deepEqual(adminRead,{status:403,privateItems:false},
        "Role-only Admin must never receive private audit timeline items")
    }finally{
      if(originalOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=originalOwnerActions
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[adminMembershipId])
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
    }
    const restoredOwner=await browser.eval(`(async()=>{
      return (await fetch('/personal/audit-timeline?organization='+${JSON.stringify(organizationId)})).status
    })()`)
    assert.equal(restoredOwner,200,"Restored Owner role can again read audit timeline")
    assert.deepEqual(await q(`select id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,[organizationId]),
      membershipBefore,"Audit read permission denial must not mutate memberships")
    assert.deepEqual(await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizationId]),
      eventsBefore,"Audit read permission denial must not write source audit")
    assert.deepEqual(await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizationId]),
      outboxBefore,"Audit read permission denial must not write outbox")
    process.stdout.write("PASS B22 Owner role policy: narrowed audit.timeline.read denies Owner HTTPS GET 403 without private audit items; Admin 403; restored Owner 200; PG16 membership/audit/outbox unchanged\n")
  }finally{
    if(originalOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=originalOwnerActions
    if(originalCursorKey===undefined)delete process.env.DOGRUADRES_AUDIT_CURSOR_KEY
    else process.env.DOGRUADRES_AUDIT_CURSOR_KEY=originalCursorKey
  }
}

// Existing native Organization route is deliberately gated by nativeIngress:
// this checks real Foundation/PG16 authorization without pretending a direct
// resolver call is an authenticated HTTP request. Do NOT open the native route.
async function verifyNativeOrganizationReadPolicy({
  container,ownerActor,memberActor,memberPersonId,alphaOrg,betaOrg,foreignOrg,browser,q
}:{
  container:any;ownerActor:string;memberActor:string;memberPersonId:string
  alphaOrg:string;betaOrg:string;foreignOrg:string
  browser:B06Chrome;q:(sql:string,args?:unknown[])=>Promise<any[]>
}):Promise<void>{
  const requestFor=(actor_id:string)=>({
    auth_context:{actor_id,actor_type:"user"},
    scope:container.createScope()
  }) as any
  const A=requestFor(ownerActor),B=requestFor(memberActor)
  const old=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
  const before=await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership where organization_id=$1 order by id`,[alphaOrg])
  const beforeAudit=await q(`select id from da_audit_event
    where organization_id=$1 order by id`,[alphaOrg])
  const beforeOutbox=await q(`select x.id from da_audit_outbox x
    join da_audit_event e on e.id=x.source_audit_event_id
    where e.organization_id=$1 order by x.id`,[alphaOrg])
  const nativeGet=async(actor:any,org:string)=>
    requireOrganizationAccess(actor,org,"organization.read")
  try{
    delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    await nativeGet(A,alphaOrg)
    // The current scoped Medusa native read path remains ingress-closed.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const nativeHttp=await browser.eval(`(async()=>{
      const response=await fetch('/dogruadres/organizations/'+${JSON.stringify(alphaOrg)})
      return {status:response.status,body:await response.json()}
    })()`)
    assert.deepEqual(nativeHttp,{status:401,
      body:{message:"Personal session ingress required"}},
      "Do not authorize the native HTTP namespace without an approved actor credential adapter")
    process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=
      "buyer.purchase,products.edit,invitation.manage,membership.manage,membership.list,audit.timeline.read"
    await assert.rejects(nativeGet(A,alphaOrg),/Organization access denied/,
      "The role policy must deny even an actual protected Owner")
    const member=await nativeGet(B,alphaOrg)
    assert.equal(member.organizationId,alphaOrg,"Actual active Member retains scoped Organization read")
    const admin=await nativeGet(A,betaOrg)
    assert.equal(admin.organizationId,betaOrg,"Actual active Admin retains scoped Organization read")
    await assert.rejects(nativeGet(B,foreignOrg),/Organization access denied/,
      "Foreign Organization remains denied regardless of Owner role policy")
    const roleOnly=await q(`select id from da_organization_membership
      where organization_id=$1 and person_id=$2 and status='active'`,[alphaOrg,memberPersonId])
    assert.equal(roleOnly.length,1)
    // The previous role is restored exactly; no protected Owner is mutated.
    await q("update da_organization_membership set role='owner',protected_owner=false,updated_at=clock_timestamp() where id=$1",[roleOnly[0].id])
    try{
      await assert.rejects(nativeGet(B,alphaOrg),/Organization access denied/,
        "An unprotected Owner role must not read the Organization")
    }finally{
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[roleOnly[0].id])
    }
  }finally{
    if(old===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=old
  }
  assert.equal((await nativeGet(A,alphaOrg)).organizationId,alphaOrg,
    "Restored current protected Owner can again read Organization")
  assert.deepEqual(await q(`select id,role,status,protected_owner,revoked_at
    from da_organization_membership where organization_id=$1 order by id`,[alphaOrg]),
    before,"Denied read must not persist membership state")
  assert.deepEqual(await q(`select id from da_audit_event
    where organization_id=$1 order by id`,[alphaOrg]),
    beforeAudit,"Denied native Organization read must not append canonical audit")
  assert.deepEqual(await q(`select x.id from da_audit_outbox x
    join da_audit_event e on e.id=x.source_audit_event_id
    where e.organization_id=$1 order by x.id`,[alphaOrg]),
    beforeOutbox,"Denied native Organization read must not append audit outbox")
  process.stdout.write("PASS B22 native organization.read role policy: real PG16 protected Owner default/restored allow, centrally narrowed deny without private response; active Admin/Member unchanged, foreign and role-only Owner denied; native HTTPS ingress remains 401, zero audit/outbox mutations\n")
}

export default async function({container}:any){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  const preparing=process.env.B22_UI_PREPARE==="true"
  assert.ok(process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true"&&
    process.env.GITHUB_EVENT_NAME==="pull_request"&&process.env.B22_UI_AUTO_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1"&&
    process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1)&&
    u.protocol==="postgres:"&&u.hostname==="127.0.0.1"&&u.port==="5432"&&
    u.username==="mfa_test"&&u.password==="ci-disposable-only-not-a-real-secret"&&
    /^\/mfa_cli_ci_[0-9a-f]{16}$/.test(u.pathname)&&
    (preparing?process.env.DOGRUADRES_MFA_RUNTIME_ENABLED==="false":
      ["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED",
       "DOGRUADRES_MFA_SETTINGS_ENABLED","DOGRUADRES_MFA_ENROLLMENT_ENABLED"]
      .every(k=>process.env[k]==="true")),"REFUSED: B22 browser scope only disposable native CI")
  // An independent real Medusa process uses the same task-owned Cart
  // while the primary process is past L and paused before OrderGroup INSERT.
  // Reject any attempt to run this mode outside the strict CI sentinel above.
  // This extra native child acquires a disposable lock then exits abruptly;
  // the parent checks whether an abandoned row blocks future acquisitions.
  const abruptExitKey=process.env.B22_ABRUPT_LOCK_TEST_KEY
  if(abruptExitKey){
    assert.equal(preparing,false)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"true")
    assert.match(abruptExitKey,/^b22-pg-process-exit:[0-9a-f]{16}$/)
    await container.resolve("locking").acquire(abruptExitKey,{expire:1})
    // Flush a fixed marker, then bypass normal container release. No raw logs.
    process.stdout.write("B22_TASK_PROVIDER_LOCK_BEFORE_ABRUPT_EXIT\n",
      ()=>process.exit(86))
    await new Promise<void>(()=>{})
    return
  }
  // Genuine Medusa Redis provider, isolated from PostgreSQL checkout.
  const redisProbeKey=process.env.B22_REDIS_PROBE_KEY
  if(redisProbeKey){
    assert.equal(preparing,false)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"false")
    assert.equal(process.env.DOGRUADRES_B22_REDIS_LOCK_TEST,"true")
    assert.equal(process.env.LOCKING_REDIS_URL,"redis://127.0.0.1:6379")
    assert.match(redisProbeKey,/^b22-redis-process-exit:[0-9a-f]{16}$/)
    const mode=process.env.B22_REDIS_PROBE_MODE
    assert.ok(mode==="crash"||mode==="recover")
    const redisLock=container.resolve("locking")
    if(mode==="crash"){
      await redisLock.acquire(redisProbeKey,{expire:25})
      process.stdout.write("B22_REDIS_NATIVE_LOCK_BEFORE_EXIT\n",()=>process.exit(86))
      await new Promise<void>(()=>{})
      return
    }
    let initiallyAcquired=false
    try{
      await redisLock.acquire(redisProbeKey,{expire:2})
      initiallyAcquired=true
    }catch(error){
      assert.match(String(error),/Failed to acquire lock/i)
    }finally{
      if(initiallyAcquired)await redisLock.release(redisProbeKey)
    }
    assert.equal(initiallyAcquired,false,"Second process must deny active Redis lock")
    let recovered=false
    await until(async()=>{
      try{
        await redisLock.acquire(redisProbeKey,{expire:3})
        recovered=true
        return true
      }catch(error){
        assert.match(String(error),/Failed to acquire lock/i)
        return false
      }
    },35000,"B22 Redis lock recovery after process exit and TTL")
    assert.equal(recovered,true)
    assert.equal(await redisLock.release(redisProbeKey),true)
    process.stdout.write("B22_REDIS_NATIVE_LOCK_RECOVERED_AFTER_TTL\n")
    return
  }
  const secondaryCartId=process.env.B22_SECOND_PROCESS_CART_ID
  if(secondaryCartId){
    assert.equal(preparing,false)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"true")
    assert.match(secondaryCartId,/^cart_[A-Za-z0-9_-]+$/)
    process.stdout.write("B22_SECONDARY_SCOPE_READY\\n")
    const locking=container.resolve("locking")
    process.stdout.write("B22_SECONDARY_PROVIDER_READY\\n")
    let acquired=false
    try{
      await locking.acquire(secondaryCartId)
      acquired=true
    }catch(error){
      assert.match(String(error),/Failed to acquire lock/i,
        "Independent Medusa process must observe the primary's real PG lock")
    }finally{
      if(acquired)await locking.release(secondaryCartId)
    }
    assert.equal(acquired,false,
      "Independent process cannot acquire a Cart lock held by another process")
    process.stdout.write("B22_SECONDARY_PG_LOCK_CONFLICT\n")
    const secondWorkflow=completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:secondaryCartId},throwOnError:false
    })
    process.stdout.write("B22_SECONDARY_NATIVE_INVOKED\n")
    const result=await secondWorkflow
    const errors=(result.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    if(errors){
      assert.match(errors,
        /B22_CHECKOUT_AUTHORIZATION_DENIED|cart.*(already|completed)|Failed to acquire lock|lock.*(acquire|timeout|busy)/i,
        "Second native checkout must fail with a recognized safe reason")
      process.stdout.write("B22_SECONDARY_NATIVE_DENIED\n")
    }else{
      assert.match(String(result.result?.order_group_id??""),/^og_[A-Za-z0-9_-]+$/)
      process.stdout.write("B22_SECONDARY_NATIVE_SUCCESS\n")
    }
    return
  }
    const pg=new Client({connectionString:u.toString()});await pg.connect()
  const q=async(sql:string,args:unknown[]=[]) => (await pg.query(sql,args)).rows
  let smtpGuard:SmtpResponsePrivacyGuard|undefined
  let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined
  let server:ReturnType<typeof tlsServer>|undefined
  let privateServer:ReturnType<typeof plainServer>|undefined
  const previousPrivateOrigin=process.env.DOGRUADRES_PRIVATE_API
  const previousTlsCert=process.env.DOGRUADRES_TLS_CERT
  const previousTlsKey=process.env.DOGRUADRES_TLS_KEY
  const previousListenerPort=process.env.DOGRUADRES_FRONTDOOR_PORT
  const browsers:B06Chrome[]=[]
  const temp=mkdtempSync(join(tmpdir(),"b22-task-ca-"))
  let originalB22Error:unknown
  try{
    assert.equal((await q("select current_database() db"))[0].db,u.pathname.slice(1))
    assert.equal((await q("select mfa_activated from da_session_policy where id='current'"))[0].mfa_activated,!preparing)
    const rand=randomBytes(8).toString("hex"),auth=container.resolve("auth")
    const users=container.resolve("user"),foundation=container.resolve("dogruadresAccess")
    const native=container.resolve("seller")
    const primary=async(label:"A"|"B")=>{
      const email=process.env["B22_UI_EMAIL_"+label]!,password=process.env["B22_UI_PASSWORD_"+label]!
      assert.match(email,/^b22-[ab]-[0-9a-f]{16}@example.invalid$/)
      assert.ok(password.length>=40)
      const user=await users.createUsers({email})
      const reg=await auth.register("emailpass",{body:{email,password}})
      assert.ok(reg.success&&reg.authIdentity?.id)
      await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{user_id:user.id}})
      const [person]=await foundation.createPeople([{}])
      await foundation.createActorMappings([{actor_type:"user",actor_id:user.id,
        person_id:person.id,created_by_actor_type:"user",created_by_actor_id:user.id}])
      // Primary synthetic enrollment fixture from existing Foundation B06;
      // NOT a shortcut for the secondary Member ownership proof.
      await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
        [reg.authIdentity.id,person.id,user.id])
      return {email,password,person:person.id,actor:user.id}
    }
    if(preparing){
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding","auth_mfa_factor"])
        assert.equal((await q("select count(*)::int n from "+table))[0].n,0,"R1 clean fixture "+table)
      await primary("A");await primary("B")
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding"])
        assert.equal((await q("select count(*)::int n from "+table))[0].n,2,"R1 prepared "+table)
      assert.equal((await q("select count(*)::int n from auth_mfa_factor"))[0].n,0)
      process.stdout.write("PASS B22 test fixture: two native primary identities prepared for existing signed R1 preflight\n")
      return
    }
    const readActor=async(label:"A"|"B")=>{
      const email=process.env["B22_UI_EMAIL_"+label]!,password=process.env["B22_UI_PASSWORD_"+label]!
      const result=await q(`select u.id actor,b.person_id person from public.user u
        join da_login_binding b on b.actor_id=u.id and b.actor_type='user'
        where u.email=$1 and b.verified_at is not null and b.revoked_at is null`,[email])
      assert.equal(result.length,1)
      return {email,password,person:result[0].person as string,actor:result[0].actor as string}
    }
    const A=await readActor("A"),B=await readActor("B")
    const organizations=await foundation.createOrganizations([
      {name:"B22 Alpha "+rand,status:"active"},{name:"B22 Beta "+rand,status:"active"},
      {name:"B22 Foreign "+rand,status:"active"},
    ])
    const memberships=await foundation.createMemberships([
      {organization_id:organizations[0].id,person_id:A.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:organizations[1].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:organizations[1].id,person_id:A.person,role:"admin",status:"active",protected_owner:false},
      {organization_id:organizations[2].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
    ])
    // A single canonical Person may independently own two seller legal
    // Organizations. Gamma is a separate seller Organization, not a new
    // Person, a second login or a fabricated Seller ownership association.
    const [sellerGamma]=await foundation.createOrganizations([{
      name:"B22 Gamma Seller "+rand,status:"active"
    }])
    const [gammaOwnerMembership]=await foundation.createMemberships([{
      organization_id:sellerGamma.id,person_id:A.person,role:"owner",
      status:"active",protected_owner:true
    }])
    assert.match(gammaOwnerMembership.id,/^[A-Za-z0-9_-]+$/)
    const betaAdminMembership=memberships[2]
    const memberEmail="b22-secondary-"+rand+"@example.invalid"
    const [member]=await native.createMembers([{email:memberEmail,is_active:true}])
    const memberPassword=randomBytes(32).toString("base64url")
    const reg=await auth.register("emailpass",{body:{email:memberEmail,password:memberPassword}})
    assert.ok(reg.success&&reg.authIdentity?.id)
    await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{member_id:member.id}})
    const secondaryMfa=await auth.startAuthMfa({auth_identity_id:reg.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Member"})
    const secondaryEnrolledCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({id:secondaryMfa.mfa.id,auth_identity_id:reg.authIdentity.id,
      code:otp(secondaryMfa.secret)})
    // Medusa's installed Customer Module creates this task-only native actor.
    // This Customer is NOT itself a legal Organization or purchase grant.
    const customerEmail="b22-customer-"+rand+"@example.invalid"
    const customerService=container.resolve("customer")
    const [nativeCustomer]=await customerService.createCustomers([{
      email:customerEmail
    }])
    assert.match(nativeCustomer.id,/^cus_[A-Za-z0-9_-]+$/)
    // Task-only native Medusa Cart fixtures. No line item, payment or order.
    const cartService=container.resolve("cart")
    const customerCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    assert.match(customerCart.id,/^cart_[A-Za-z0-9_-]+$/)
    const [foreignNativeCustomer]=await customerService.createCustomers([{
      email:"b22-foreign-cart-"+rand+"@example.invalid"
    }])
    const foreignCart=await cartService.createCarts({
      currency_code:"eur",customer_id:foreignNativeCustomer.id
    })
    assert.match(foreignCart.id,/^cart_[A-Za-z0-9_-]+$/)

    const customerPassword=randomBytes(32).toString("base64url")
    const customerReg=await auth.register("emailpass",{
      body:{email:customerEmail,password:customerPassword}
    })
    assert.ok(customerReg.success&&customerReg.authIdentity?.id)
    await auth.updateAuthIdentities({
      id:customerReg.authIdentity.id,
      app_metadata:{customer_id:nativeCustomer.id}
    })
    const customerMfa=await auth.startAuthMfa({
      auth_identity_id:customerReg.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Customer"
    })
    const customerEnrollCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({
      id:customerMfa.mfa.id,
      auth_identity_id:customerReg.authIdentity.id,
      code:otp(customerMfa.secret)
    })
    const stores: Array<{id:string;name:string}>=[]
    for(let n=0;n<3;n++){
      // Mercur's own Store workflow is authoritative for its native approval.
      // Never forge status=open or approved_at with a direct service write.
      const [store]=await native.createSellers([{name:"B22 Store "+(n+1)+" "+rand,
        email:"b22-store-"+n+"-"+rand+"@example.invalid",currency_code:"eur"}])
      const before=await native.listSellers({id:store.id})
      assert.equal(before.length,1);assert.equal(before[0].status,"pending_approval")
      assert.equal(before[0].approved_at,null)
      await approveSellerWorkflow(container).run({input:{seller_id:store.id}})
      const after=await native.listSellers({id:store.id})
      assert.equal(after.length,1);assert.equal(after[0].status,"open")
      assert.ok(after[0].approved_at,"Mercur native approval timestamp required")
      await native.createSellerMembers([{seller_id:store.id,member_id:member.id,is_owner:true}])
      stores.push(store)
    }
    // Deliberately inconsistent TEST-ONLY Seller: status OPEN was written
    // without Mercur approveSellerWorkflow, so approved_at remains absent.
    // Even a platform association + verified Member must never expose it.
    const [unapprovedStore]=await native.createSellers([{name:"B22 approval-negative "+rand,
      email:"b22-unapproved-"+rand+"@example.invalid",currency_code:"eur",status:"open"}])
    const unapprovedNative=await native.listSellers({id:unapprovedStore.id})
    assert.equal(unapprovedNative.length,1)
    assert.equal(unapprovedNative[0].status,"open")
    assert.equal(unapprovedNative[0].approved_at,null)
    await native.createSellerMembers([{seller_id:unapprovedStore.id,member_id:member.id,is_owner:true}])

    const crt=join(temp,"ca.pem"),key=join(temp,"key.pem")
    const certificate=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
      "-keyout",key,"-out",crt,"-days","1","-subj","/CN=B22 task CA",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-addext","basicConstraints=critical,CA:TRUE"],{stdio:"ignore",timeout:20000})
    assert.equal(certificate.status,0,"Task-only CA generation")
    // B22 now also validates the server-only native Member context. Use
    // the already-supported real Mercur loader from B20's runtime, and an
    // ephemeral HTTP listener bound strictly to loopback. No external API,
    // no mock route or browser-visible native credential is introduced.
    const mercurApi=join(dirname(require.resolve("@mercurjs/core")),"api")
    app=await createPersonalHttpApp(container,[mercurApi])
    privateServer=plainServer(app.app)
    await new Promise<void>((resolve,reject)=>{
      privateServer!.once("error",reject)
      privateServer!.listen(0,"127.0.0.1",resolve)
    })
    const nativePort=(privateServer.address() as {port:number}).port
    process.env.DOGRUADRES_PRIVATE_API="http://127.0.0.1:"+nativePort
    if(process.env.B22_ADMIN_SMTP==="true")
      smtpGuard=new SmtpResponsePrivacyGuard(process.env.B22_SMTP_CANARY??"")
    server=tlsServer({cert:readFileSync(crt),key:readFileSync(key),minVersion:"TLSv1.2"},
      (req,res)=>{smtpGuard?.observe(req,res);app!.app(req,res)})
    await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve)})
    const host="https://127.0.0.1:"+(server.address() as any).port
    process.env.DOGRUADRES_PUBLIC_ORIGIN=host
    process.env.DOGRUADRES_TLS_CERT=crt
    process.env.DOGRUADRES_TLS_KEY=key
    process.env.DOGRUADRES_FRONTDOOR_PORT=(server.address() as {port:number}).port.toString()
    const topology=ingressConfig(process.env)
    assert.equal(topology.privateOrigin,process.env.DOGRUADRES_PRIVATE_API)
    assert.equal(topology.publicOrigin,host)
    const browser=new B06Chrome(host,"A");browsers.push(browser)
    await browser.start(crt)
    await browser.login(A.email,A.password,A.person)
    if(process.env.B22_ADMIN_SMTP==="true"){
      const other=new B06Chrome(host,"B");browsers.push(other)
      await other.start(crt);await other.login(B.email,B.password,B.person)
      await verifyAdminSmtp(browser,other,container,A.person,B.person,q,smtpGuard!)
      return
    }
    // Approved personal workspace has no editable launcher. Its retired
    // Person-only API must not read or write historical preference rows.
    const legacyPrefsBefore=await q("select id,person_id,app_ids,collapsed_ids,version from da_launcher_preference order by id")
    const retiredLauncher=await browser.eval(`(async()=>{
      const get=await fetch('/personal/launcher',{credentials:'same-origin'})
      const post=await fetch('/personal/launcher',{method:'POST',
        credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({app_ids:['storefront'],collapsed_ids:[],version:0})})
      return {present:!!document.getElementById('launcher-section'),
        get:get.status,post:post.status}
    })()`)
    assert.deepEqual(retiredLauncher,{present:false,get:403,post:403})
    assert.deepEqual(await q("select id,person_id,app_ids,collapsed_ids,version from da_launcher_preference order by id"),legacyPrefsBefore)
    process.stdout.write("PASS B22 Chrome: no personal launcher; old GET/POST 403, historic preference rows untouched\n")
    const cookie=await browser.token()
    assert.match(cookie??"",/^[A-Za-z0-9_-]{43}$/)
    // Execute the INSTALLED native Mercur product workflow on the existing
    // disposable CI DB, before creating any new personal commerce writer.
    // Workflow input is INTERNAL ONLY: it is not a visitor authorization.
    const nativeProductTitle="B22 native draft "+rand
    const {result:products}=await createProductsWorkflow(container).run({
      input:{products:[{title:nativeProductTitle,status:"draft",seller_ids:[stores[0].id]}],
        created_by:stores[0].id}
    })
    assert.equal(products.length,1)
    const draft=products[0]
    assert.ok(/^prod_[A-Za-z0-9_-]+$/.test(draft.id))
    const [actualProduct]=await q("select id,title,status from product where id=$1",[draft.id])
    assert.equal(actualProduct?.title,nativeProductTitle)
    assert.equal(actualProduct?.status,"draft")
    const actualLinks=await q("select seller_id from product_seller where product_id=$1",[draft.id])
    assert.deepEqual(actualLinks.map(x=>x.seller_id),[stores[0].id])
    // A native product workflow does not by itself prove a human's product
    // permission, nor grant the other Seller/Organization access.
    assert.ok(!actualLinks.some(x=>x.seller_id===stores[1].id))
    process.stdout.write("PASS B22 native Mercur product workflow: draft persisted, only selected Seller linked; no visitor writer/permission claim\n")
    const get=async(path:string,additional:Record<string,string>={})=>{
      return browser.eval(`(async()=>{
        const r=await fetch(${JSON.stringify(path)},{headers:${JSON.stringify(additional)}})
        return {status:r.status,body:await r.json(),cache:r.headers.get("cache-control")}
      })()`)
    }
    const selected=(org:string)=>"/personal/organization-stores?organization="+encodeURIComponent(org)
    // Native SellerMember is NOT a verified human association. Nothing visible.
    await browser.eval("window.__b22_ui_error='';window.addEventListener('error',event=>{window.__b22_ui_error=String(event.message).slice(0,90)});window.__b22_events=[];['pagehide','visibilitychange','popstate'].forEach(name=>window.addEventListener(name,()=>window.__b22_events.push({type:name,hidden:document.hidden})))")
    // A headless Chrome tab is not entitled to a visible workspace while
    // backgrounded. Bring the actual tab forward; do not bypass its privacy
    // event handlers or fake an active session.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    try {
      await browser.select(organizations[0].name,"owner")
    } catch (error) {
      const info=await browser.eval(`({
        detailValid:(()=>{try{return !!JSON.parse(document.getElementById('detail').textContent).role}catch{return false}})(),
        workspaceVisible:!document.getElementById('workspace').hidden,
        applicationFormExists:!!document.getElementById('store-application-form'),
        applicationRequestReady:typeof applicationRequest==='number',
        sessionStatus:document.getElementById('status').textContent.slice(0,70),
        uiError:String(window.__b22_ui_error||'').replace(/[A-Za-z0-9_-]{20,}/g,'[masked]'),
        visibility:document.visibilityState,
        events:(window.__b22_events||[]).slice(-8),
        selectionForm:(document.querySelector('#organizations button')?.closest('form')?.id||null),
        pathIsPersonal:location.pathname==='/personal'
      })`)
      throw Error("B22 Organization select contract failed: "+JSON.stringify(info))
    }
    await browser.wait("document.getElementById('org-stores-status').textContent.includes('erişim izniniz yok')")
    assert.equal((await get(selected(organizations[0].id))).status,403)
    assert.equal((await q("select count(*)::int n from da_verified_actor_binding where person_id=$1",[A.person]))[0].n,0)
    // Exercise supported real secondary password and native TOTP via UI.
    await browser.input("#link-account input[name=email]",memberEmail)
    await browser.input("#link-account input[name=password]",memberPassword)
    await browser.click("#link-account button")
    await browser.wait("!document.getElementById('link-confirm').hidden")
    // Primary Chrome MFA login has advanced the TOTP counter. Never reuse
    // the just-consumed secondary enrollment code within the same window.
    assert.ok(Math.floor(Date.now()/30000)>secondaryEnrolledCounter,
      "Secondary TOTP challenge must not reuse its enrollment window")
    await browser.input("#link-confirm input[name=code]",otp(secondaryMfa.secret))
    await browser.click("#link-confirm button")
    await browser.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verified=await q("select proof_reference from da_verified_actor_binding where person_id=$1 and actor_type='member' and revoked_at is null",[A.person])
    assert.equal(verified.length,1);assert.match(verified[0].proof_reference,/^dual-proof:/)
    // The real Owner UI submits via native Mercur createSellerAccountWorkflow.
    // No extra Store-to-Organization approval or native dashboard login.
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-application-form').hidden")
    const applicationName="B22 Owner application "+rand
    const applicationEmail="b22-owner-app-"+rand+"@example.invalid"
    await browser.input("#store-application-form input[name=name]",applicationName)
    await browser.input("#store-application-form input[name=email]",applicationEmail)
    await browser.click("#store-application-form button")
    let observed=""
    await until(async()=>{
      observed=String(await browser.eval("document.getElementById('store-application-status').textContent"))
      return observed.includes("Başvuru kaydedildi") ||
        observed.includes("Başvuru reddedildi") || observed.includes("Sonuç belirsiz")
    },19000,"B22 Owner Store application outcome")
    if(!observed.includes("Başvuru kaydedildi")){
      const state=await q(`select status,seller_id is not null as seller_created
        from da_store_application where organization_id=$1 and person_id=$2`,
        [organizations[0].id,A.person])
      // Never log credentials, Member IDs, application keys or Seller details.
      throw Error("B22 application incomplete: ui_category="+
        (observed.includes("Sonuç belirsiz")?"uncertain":"denied")+
        ",rows="+state.length+",state="+state.map((row:any)=>row.status).join(",")+
        ",seller_written="+state.some((row:any)=>row.seller_created))
    }
    const createdList=await get("/personal/store-applications?organization_id="+encodeURIComponent(organizations[0].id))
    assert.equal(createdList.status,200)
    const ownApplications=createdList.body.applications
    assert.equal(ownApplications.length,1)
    assert.equal(ownApplications[0].status,"created")
    const applicationId=ownApplications[0].id,ownerStoreId=ownApplications[0].seller_id
    assert.match(applicationId,/^daapp_[0-9a-f]{32}$/)
    assert.match(ownerStoreId,/^sel_[A-Za-z0-9_-]+$/)
    const newNative=await native.listSellers({id:ownerStoreId})
    assert.equal(newNative.length,1)
    assert.equal(newNative[0].status,"pending_approval")
    assert.equal(newNative[0].approved_at,null)
    const linked=await q(`select o.organization_id,e.action,e.actor_person_id,
      x.id outbox_id from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1`,[ownerStoreId])
    assert.equal(linked.length,1)
    assert.equal(linked[0].organization_id,organizations[0].id)
    assert.equal(linked[0].actor_person_id,A.person)
    assert.equal(linked[0].action,"organization.store_application_created")
    const submit=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const csrf=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/store-applications',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})})
      return {status:response.status,body:await response.json()}
    })()`)
    const data={organization_id:organizations[0].id,application_id:applicationId,
      name:applicationName,email:applicationEmail,currency_code:"try"}
    const replay=await submit(data)
    assert.equal(replay.status,200);assert.equal(replay.body.seller_id,ownerStoreId)
    assert.equal((await submit({...data,name:applicationName+" changed"})).status,403)
    assert.equal((await submit({...data,organization_id:organizations[2].id,
      application_id:"daapp_"+randomBytes(16).toString("hex")})).status,403)
    assert.equal((await q("select count(*)::int n from da_store_application where person_id=$1",[A.person]))[0].n,1)
    // The Origin link is created at Owner submission, but Seller approval is
    // STILL mandatory. A pending Seller must never enter the active Store list.
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    // The Owner cannot impersonate a platform reviewer, even though the
    // workflow created SellerMember.is_owner for this Store.
    const ownerApprovalDenied=await browser.eval(`(async()=>{
      const session=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({application_id:applicationId,seller_id:ownerStoreId})})})
      return response.status
    })()`)
    assert.equal(ownerApprovalDenied,403)
    assert.equal((await get("/personal/platform/stores")).status,403)
    assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval")
    // One isolated historical Origin fixture has a real native pending
    // Seller; 30 older records have no native Seller and convey no access.
    // This tests approval of an older page without a second linkage approval.
    const [olderPending]=await native.createSellers([{
      name:"B22 older pending "+rand,
      email:"b22-older-pending-"+rand+"@example.invalid",currency_code:"try"
    }])
    const nativeBeforeOlder=await native.listSellers({id:olderPending.id})
    assert.equal(nativeBeforeOlder.length,1)
    assert.equal(nativeBeforeOlder[0].status,"pending_approval")
    assert.equal(nativeBeforeOlder[0].approved_at,null)
    await native.createSellerMembers([{seller_id:olderPending.id,
      member_id:member.id,is_owner:true}])
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    await q(`insert into da_store_application
      (id,organization_id,person_id,member_actor_id,member_auth_identity_id,
       request_fingerprint,status,seller_id,created_at)
      select 'daapp_'||md5('b22-history-'||$1||':'||g.n::text),
        $2,$3,$4,$5,repeat('b',64),'created',
        case when g.n=0 then $7 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        (select created_at from da_store_application where id=$6)-interval '1 hour'
          +g.n*interval '1 millisecond'
      from generate_series(0,30) g(n)`,
      [rand,organizations[0].id,A.person,member.id,reg.authIdentity.id,applicationId,olderPending.id])
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,
       resource,target_id,new_values,occurred_at)
      select 'daaud_b22_history_'||g.n::text||'_'||$1,
        $2,'user',$3,$4,'organization.store_application_created',
        'dogruadres-access','store-application',
        case when g.n=0 then $5 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        jsonb_build_object('application_id',
          'daapp_'||md5('b22-history-'||$1||':'||g.n::text),
          'status','pending_approval'),clock_timestamp()
      from generate_series(0,30) g(n)`,
      [rand,A.person,A.actor,organizations[0].id,olderPending.id])
    await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
      select 'daaob_b22_history_'||g.n::text||'_'||$1,
        'daaud_b22_history_'||g.n::text||'_'||$1,
        'dogruadres-access','{}'::jsonb from generate_series(0,30) g(n)`,[rand])
    await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      select 'daown_b22_history_'||g.n::text||'_'||$1,$2,
        case when g.n=0 then $3 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        'daaud_b22_history_'||g.n::text||'_'||$1,clock_timestamp()
      from generate_series(0,30) g(n)`,[rand,organizations[0].id,olderPending.id])
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,32)
    // TEST-ONLY disposable scope: an explicit store.approve grant belongs to
    // another Person. It is never inferred from B's native User/Org roles.
    const grantId="da_staff_b22_"+rand
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'store.approve','platform',$2,'B22 disposable CI platform reviewer fixture')`,[grantId,B.person])
    const reviewer=new B06Chrome(host,"B");browsers.push(reviewer)
    await reviewer.start(crt)
    await reviewer.login(B.email,B.password,B.person)
    // CR-01: a real strongly authenticated Staff browser provisions a new
    // Organization using the installed personal HTTP route and native Medusa
    // user/Person binding. Its canonical audit/outbox producer must emit the
    // exact Staff role accepted by the strict Index projection contract.
    // This is task-owned CI data; no real company approval is performed.
    assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform')).status)()"),403,
      "Native sign-in and Store approval grant do not confer Organization provisioning")
    const staffOrgGrantId="da_staff_org_"+rand
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'organization.provision','platform',$2,'B22 isolated Staff provision fixture')`,
      [staffOrgGrantId,B.person])
    assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform')).status)()"),200)
    assert.equal((await get("/personal/platform")).status,403,
      "Organization Owner cannot acquire separate Staff provision permission")
    const provisionName="B22 Staff provision "+rand
    const provisionBody={name:provisionName,initial_owners:[{actor_type:"user",actor_id:B.actor}]}
    const provision=async(body:unknown, csrfOverride?:string)=>reviewer.eval(`(async()=>{
      const s=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':${JSON.stringify(csrfOverride??"")}||s.csrf_token},
        body:JSON.stringify(${JSON.stringify(body)})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    const forbiddenCsrf=await provision(provisionBody,"invalid-task-csrf")
    assert.equal(forbiddenCsrf.status,403)
    assert.equal((await q("select count(*)::int n from da_organization where name=$1",
      [provisionName]))[0].n,0,"CSRF denial must not write an Organization")
    const forgedOwner=await provision({...provisionBody,
      initial_owners:[{actor_type:"user",actor_id:"usr_foreign_b22_"+rand}]})
    assert.equal(forgedOwner.status,400,
      "Unknown native actor cannot be assigned protected Owner")
    assert.equal((await q("select count(*)::int n from da_organization where name=$1",
      [provisionName]))[0].n,0)
    const created=await provision(provisionBody)
    assert.equal(created.status,201,"Strong Staff grant + verified Owner may provision")
    assert.match(created.body.organization.id,/^daorg_[A-Za-z0-9_-]+$/)
    assert.equal(created.body.organization.name,provisionName)
    assert.equal(created.body.initial_owner_count,1)
    const staffOrgId=created.body.organization.id
    const staffOwner=await q(`select person_id,role,status,protected_owner from
      da_organization_membership where organization_id=$1 and deleted_at is null`,
      [staffOrgId])
    assert.equal(staffOwner.length,1)
    assert.equal(staffOwner[0].person_id,B.person)
    assert.equal(staffOwner[0].role,"owner")
    assert.equal(staffOwner[0].status,"active")
    assert.equal(staffOwner[0].protected_owner,true)
    const staffEvents=await q(`select e.*,x.id as outbox_id,x.envelope
      from da_audit_event e join da_audit_outbox x
      on x.source_audit_event_id=e.id
      where e.organization_id=$1 and
        e.action in ('organization.provisioned','organization.owner_assigned')
      order by e.action`,[staffOrgId])
    assert.deepEqual(staffEvents.map(e=>e.action),
      ["organization.owner_assigned","organization.provisioned"])
    for(const e of staffEvents){
      assert.equal(e.actor_person_id,B.person)
      assert.equal(e.actor_type,"user")
      assert.equal(e.actor_id,B.actor)
      assert.equal(e.role_context,"platform_staff")
      assert.ok(/^daaob_[A-Za-z0-9_-]+$/.test(e.outbox_id))
      const projected=projectFoundationAuditEvent(e)
      assert.equal(projected.actor.role_context,"platform_staff")
      assert.equal(projected.action,e.action)
      assert.equal(projected.organization_id,staffOrgId)
      assert.equal(projected.source_event_id,e.id)
      const envelope=typeof e.envelope==="string"?JSON.parse(e.envelope):e.envelope
      assert.equal(envelope.actor.role_context,"platform_staff")
      assert.equal(envelope.source_audit_event_id,e.id)
      assert.equal((await q("select count(*)::int n from da_security_outbox where audit_event_id=$1",
        [e.id]))[0].n,1,
        "Staff provisioning canonical/security audit must commit together")
    }
    await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",
      [staffOrgGrantId])
    assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform')).status)()"),403)
    assert.equal((await provision({...provisionBody,name:provisionName+" revoked"})).status,403)
    assert.equal((await q("select count(*)::int n from da_organization where name=$1",
      [provisionName+" revoked"]))[0].n,0)
    // Separate store.approve grant remains valid; Staff and Owner roles
    // cannot silently inherit each other's permissions.
    process.stdout.write("PASS B22 Chrome: real Staff Organization provision HTTP201 and protected Owner persisted, two canonical platform_staff audit/outboxes project safely; CSRF/foreign actor/revoked grant denied\\n")
    reviewer.phase="platform-store-review"
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),true)
    // Real staff Chrome can approve a native pending Seller on page 2;
    // the remaining 30 fake Seller IDs confer no lifecycle or authority.
    assert.equal(await reviewer.eval("document.getElementById('store-approval-older').hidden"),false)
    await reviewer.click("#store-approval-older")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('sayfa 2') || document.getElementById('store-approval-status').textContent.includes('Bu sayfada')")
    assert.equal(await reviewer.eval("document.getElementById('store-approval-newer').hidden"),false)
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),false)
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(olderPending.name)})`),true)
    await reviewer.click("#store-approval-list button")
    await until(async()=>{
      const rows=await native.listSellers({id:olderPending.id})
      return rows.length===1&&rows[0].status==="open"&&!!rows[0].approved_at
    },19000,"B22 older native pending Seller approval from page 2")
    // Suspend only this older task-owned Seller so the pre-existing Owner
    // and new Seller positive/negative expectations remain independent.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:olderPending.id,reason:"B22 task-only older Store suspension"
    }})
    assert.equal((await native.listSellers({id:olderPending.id}))[0].status,"suspended")
    await reviewer.click("#store-approval-newer")
    // Both pages expose one button: only page-1 Store identity proves the
    // asynchronous page switch completed before approval.
    await reviewer.wait(`document.querySelectorAll('#store-approval-list button').length===1 && document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`)
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),true)
    // The real browser button invokes Mercur's native approval. Hold the
    // task-only seller status UPDATE with an independent PG16 advisory lock,
    // then revoke the current platform Staff task from a second connection.
    // The staff-grant row lock must keep revoke UNCOMMITTED until the native
    // approval and its Foundation authorization completion have finished.
    const staffBarrier=new Client({connectionString:u.toString()})
    const staffRevoker=new Client({connectionString:u.toString()})
    await staffBarrier.connect()
    await staffRevoker.connect()
    let sellerPauseFn=false,sellerPauseTrigger=false,staffBarrierHeld=false
    let staffRevokeDone=false
    const beforeStoreApprovals=reviewer.http.filter(
      (x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST").length
    try{
      const tables=await q("select count(*)::int n from pg_class where oid=to_regclass('public.seller') and relkind='r'")
      assert.equal(tables[0].n,1,"Installed Mercur native Seller persistence must be a real PG16 relation")
      await q("create function b22_staff_native_seller_pause_v1() returns trigger language plpgsql as $b22$ begin if NEW.id='"+ownerStoreId+"' and NEW.status='open' then perform pg_advisory_xact_lock(hashtext('b22-seller-open-pause'),hashtext('"+ownerStoreId+"')); end if; return NEW; end $b22$")
      sellerPauseFn=true
      await q("create trigger b22_staff_native_seller_pause_v1 after update on seller for each row execute function b22_staff_native_seller_pause_v1()")
      sellerPauseTrigger=true
      await staffBarrier.query("BEGIN")
      staffBarrierHeld=true
      const holderPid=(await staffBarrier.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      const revokePid=(await staffRevoker.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      await staffBarrier.query("select pg_advisory_xact_lock(hashtext('b22-seller-open-pause'),hashtext($1))",[ownerStoreId])
      await reviewer.click("#store-approval-list button")
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks h join pg_locks w on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid and w.granted=false where h.locktype='advisory' and h.pid=$1 and h.granted=true",[holderPid])
        return w.n===1
      },19000,"Actual Mercur Seller UPDATE waits on independent PG16 barrier")
      assert.equal(reviewer.http.filter(
        (x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST").length,
        beforeStoreApprovals,"Staff approval HTTP has not returned before native write")
      const revokePending=staffRevoker.query(
        "update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1 and revoked_at is null returning revoked_at",
        [grantId]).then((v:any)=>{staffRevokeDone=true;return v},
          (e:unknown)=>{staffRevokeDone=true;throw e})
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks where pid=$1 and granted=false and locktype='transactionid'",[revokePid])
        return w.n>=1
      },19000,"Real PG16 Staff grant revoke waits on approval's locked grant row")
      assert.equal(staffRevokeDone,false,"Permission revoke cannot commit before approved Store write finishes")
      assert.equal((await q("select count(*)::int n from da_platform_staff_grant where id=$1 and revoked_at is null",[grantId]))[0].n,1)
      assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval",
        "The uncommitted native Seller UPDATE is not visible to outside readers")
      await staffBarrier.query("ROLLBACK")
      staffBarrierHeld=false
      await until(async()=>{
        const http=reviewer.http.filter(
          (x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST")
        const rows=await native.listSellers({id:ownerStoreId})
        return http.length===beforeStoreApprovals+1&&http[http.length-1].status===200&&
          rows.length===1&&rows[0].status==="open"&&!!rows[0].approved_at
      },19000,"Real Chrome Staff approval HTTP200 with committed native Seller open")
      const revoked=await revokePending
      assert.equal(revoked.rows.length,1)
      assert.ok(revoked.rows[0].revoked_at)
      assert.equal((await q("select count(*)::int n from da_platform_staff_grant where id=$1 and revoked_at is not null",[grantId]))[0].n,1)
      assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/platform/stores')).status)()"),403,
        "Current platform Staff revoke must deny all subsequent Store approvals")
      assert.equal((await q("select count(*)::int n from da_store_application where id=$1 and seller_id=$2 and status='created'",[applicationId,ownerStoreId]))[0].n,1)
      assert.equal((await q("select count(*)::int n from da_organization_seller_ownership where organization_id=$1 and seller_id=$2 and revoked_at is null",[organizations[0].id,ownerStoreId]))[0].n,1)
      process.stdout.write("PASS B22 Chrome: Staff grant revoke waits during real native Seller approval; HTTP200 and Seller open before revoke commit, later Staff HTTP403; authoritative origin retained\n")
    }finally{
      if(staffBarrierHeld)await staffBarrier.query("ROLLBACK")
      await staffRevoker.end()
      await staffBarrier.end()
      if(sellerPauseTrigger)await q("drop trigger if exists b22_staff_native_seller_pause_v1 on seller")
      if(sellerPauseFn)await q("drop function if exists b22_staff_native_seller_pause_v1()")
      // Restore only this task-created grant to preserve the remaining
      // B22 UI tests; the existing final revoke test still runs below.
      await q("update da_platform_staff_grant set revoked_at=null where id=$1",[grantId])
      await reviewer.send("Page.bringToFront")
    }
    // Verify the real browser network action AND native committed Seller state.
    // A temporary status message is not a durable success contract: the
    // privacy epoch may conceal an inactive browser while the POST completes.
    await until(async()=>{
      const http=reviewer.http.filter((x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST")
      const current=await native.listSellers({id:ownerStoreId})
      return http.some((x:any)=>x.status===200)&&current.length===1&&
        current[0].status==="open"&&!!current[0].approved_at
    },19000,"B22 reviewer HTTP200 and native approval")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    // Owner Store was approved, but the 31 historical Origin rows still
    // exist on older pages. Empty CURRENT page must offer older navigation,
    // not falsely imply the whole review backlog is empty.
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===0 && document.getElementById('store-approval-status').textContent.includes('önceki başvurulara bakın.') && !document.getElementById('store-approval-older').hidden")
    assert.equal(await reviewer.eval("document.querySelectorAll('#store-approval-list button').length"),0,
      "Approved Store must disappear from the reviewer pending list on reload")
    const afterReview=await native.listSellers({id:ownerStoreId})
    assert.equal(afterReview.length,1)
    assert.equal(afterReview[0].status,"open")
    assert.ok(afterReview[0].approved_at)

    const [alphaMember]=await foundation.createMemberships([{
      organization_id:organizations[0].id,person_id:B.person,role:"member",
      status:"active",protected_owner:false
    }])
    await verifyMembershipNonDisclosure({organizationId:organizations[0].id,
      activeId:alphaMember.id,foreignId:betaAdminMembership.id,personId:B.person,
      browser:reviewer,foundation,q})
    // B22 buyer.purchase is Organization-scoped and NEVER inferred from
    // Owner/Member roles, native Customer or Store product permission.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")
    const buyerBefore=await get('/personal/buyer-permissions?organization_id='+organizations[0].id)
    assert.equal(buyerBefore.status,200)
    assert.deepEqual(buyerBefore.body.grants,[],"Inherent Owner authority is not an issued grant")
    // Protected Owner is allowed to purchase without any separate grant.
    const ownerBuyerContext=await get('/personal/buyer-context?organization_id='+
      encodeURIComponent(organizations[0].id))
    assert.equal(ownerBuyerContext.status,200)

    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where organization_id=$1`,[organizations[0].id]))[0].n,0)
    await browser.eval(`document.querySelector('#buyer-grants-form select[name=membership_id]').value=${JSON.stringify(alphaMember.id)}`)
    await browser.click('#buyer-grants-form button[value="grant"]')
    await until(async()=>{
      const rows=await q(`select id from da_organization_buyer_permission
        where person_id=$1 and organization_id=$2 and permission='buyer.purchase'
          and revoked_at is null`,[B.person,organizations[0].id])
      return rows.length===1
    },19000,"B22 real Chrome buyer permission issued")
    const [buyerGrant]=await q(`select id,source_audit_event_id,issued_by_person_id
      from da_organization_buyer_permission where person_id=$1
        and organization_id=$2 and revoked_at is null`,
      [B.person,organizations[0].id])
    assert.equal(buyerGrant.issued_by_person_id,A.person)
    assert.match(buyerGrant.id,/^dabpg_[A-Za-z0-9_-]+$/)
    const buyerProof=await q(`select e.action,e.actor_person_id,e.organization_id,
      e.target_id,x.id as outbox_id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.new_values->>'grant_id'=$2
        and e.new_values->>'person_id'=$3
        and e.new_values->>'permission'='buyer.purchase'`,
      [buyerGrant.source_audit_event_id,buyerGrant.id,B.person])
    assert.equal(buyerProof.length,1)
    assert.equal(buyerProof[0].action,"organization.buyer_permission_granted")
    assert.equal(buyerProof[0].actor_person_id,A.person)
    assert.equal(buyerProof[0].organization_id,organizations[0].id)
    assert.equal(buyerProof[0].target_id,B.person)
    const buyerRequest={action:"grant",organization_id:organizations[0].id,
      membership_id:alphaMember.id}
    const repeatBuyer=await browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(buyerRequest)})
      });return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(repeatBuyer.status,200)
    assert.equal(repeatBuyer.body.grant_id,buyerGrant.id)
    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where person_id=$1 and organization_id=$2`,
      [B.person,organizations[0].id]))[0].n,1)
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const rejectedBuyer=await reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(buyerRequest)})
      });return response.status
    })()`)
    assert.equal(rejectedBuyer,403,
      "Other Org Owner / platform staff cannot issue buyer.purchase in Alpha")
    const foreignBuyer=await reviewer.eval(`(async()=>{
      const response=await fetch('/personal/buyer-permissions?organization_id=${encodeURIComponent(organizations[0].id)}')
      return response.status
    })()`)
    assert.equal(foreignBuyer,403,"Non-Owner cannot enumerate buyer grants")
    // Before secondary dual proof the Alpha buyer grant is not sufficient
    // to establish which current native Customer belongs to Person B.
    const customerContext=(org:string)=>'/personal/buyer-context?organization_id='+
      encodeURIComponent(org)+'&customer=verified'
    const unlinkedCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return r.status
    })()`)
    assert.equal(unlinkedCustomer,403,
      "buyer.purchase must not infer Customer from email, native registration or role")
    // Real primary Chrome session + real native secondary password/TOTP
    // via the existing supported dual-proof personal account link.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.eval("document.querySelector('#link-account select[name=actor_type]').value='customer'")
    await reviewer.input("#link-account input[name=email]",customerEmail)
    await reviewer.input("#link-account input[name=password]",customerPassword)
    await reviewer.click("#link-account button")
    await reviewer.wait("!document.getElementById('link-confirm').hidden")
    await until(async()=>Math.floor(Date.now()/30000)>customerEnrollCounter,
      45000,"Customer TOTP challenge must not reuse enrollment window")
    await reviewer.input("#link-confirm input[name=code]",otp(customerMfa.secret))
    await reviewer.click("#link-confirm button")
    await reviewer.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verifiedCustomerBinding=await q(`select actor_id,proof_reference
      from da_verified_actor_binding
      where person_id=$1 and actor_type='customer' and revoked_at is null`,
      [B.person])
    assert.equal(verifiedCustomerBinding.length,1)
    assert.equal(verifiedCustomerBinding[0].actor_id,nativeCustomer.id)
    assert.match(verifiedCustomerBinding[0].proof_reference,/^dual-proof:/)
    const readyCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}
    })()`)
    assert.equal(readyCustomer.status,200)
    assert.deepEqual(readyCustomer.body,{
      organization_id:organizations[0].id,
      status:"buyer_customer_verified",checkout_ready:false
    })
    assert.match(readyCustomer.cache,/no-store/)
    // The native Cart Module only proves Customer↔Cart; the legal Buyer
    // Organization↔Cart association and per-Store blocks remain unverified.
    const buyerCart=(org:string,cart:string)=>
      customerContext(org)+'&cart_id='+encodeURIComponent(cart)
    const readNativeCart=async(url:string)=>reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(url)})
      return {status:r.status,body:await r.json()}
    })()`)
    const validCart=await readNativeCart(buyerCart(organizations[0].id,customerCart.id))
    assert.equal(validCart.status,200)
    assert.deepEqual(validCart.body,{
      organization_id:organizations[0].id,status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:false
    })
    const foreignCartCheck=await readNativeCart(buyerCart(organizations[0].id,foreignCart.id))
    assert.equal(foreignCartCheck.status,403)
    assert.deepEqual(foreignCartCheck.body,{message:"Access denied"})
    const absentCartCheck=await readNativeCart(buyerCart(organizations[0].id,
      "cart_absent_"+rand))
    assert.equal(absentCartCheck.status,403)
    const noCustomerProof=await readNativeCart("/personal/buyer-context?organization_id="+
      encodeURIComponent(organizations[0].id)+"&cart_id="+encodeURIComponent(customerCart.id))
    assert.equal(noCustomerProof.status,400)
    const foreignOrganizationCart=await readNativeCart(
      buyerCart(sellerGamma.id,customerCart.id))
    assert.equal(foreignOrganizationCart.status,403,
      "Another Person's unrelated Organization must not inherit this Customer or purchase rights")
    assert.equal((await cartService.listCarts({
      id:customerCart.id,customer_id:nativeCustomer.id
    })).length,1,"Read-only preflight must not mutate cart")
    process.stdout.write("PASS B22 native cart ownership: real Medusa Cart belongs to verified Customer, foreign and missing carts denied, Org not attributed, no payment or checkout\\n")

    // Bind this real native Customer Cart once to legal Organization Alpha.
    // This is a Foundation audit transaction, NOT native cart metadata.
    const claimCart=async(organization_id:string,cart_id:string)=>{
      return reviewer.eval(`(async()=>{
        const s=await(await fetch('/personal/session')).json()
        const r=await fetch('/personal/buyer-context',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify(${JSON.stringify({action:"attribute",organization_id,cart_id})})
        })
        return {status:r.status,body:await r.json()}
      })()`)
    }
    const attributionBefore=await q(`select count(*)::int n
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id])
    assert.equal(attributionBefore[0].n,0)
    const foreignClaim=await claimCart(organizations[0].id,foreignCart.id)
    assert.equal(foreignClaim.status,403)
    const claimed=await claimCart(organizations[0].id,customerCart.id)
    assert.equal(claimed.status,200)
    assert.deepEqual(claimed.body,{status:"attributed",
      organization_id:organizations[0].id,checkout_ready:false})
    const sameClaim=await claimCart(organizations[0].id,customerCart.id)
    assert.equal(sameClaim.status,200)
    assert.deepEqual(sameClaim.body,claimed.body)
    const [attributed]=await q(`select a.person_id,a.customer_id,a.organization_id,
      a.source_audit_event_id,e.action,e.actor_person_id,e.new_values,
      x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[customerCart.id])
    assert.equal(attributed.person_id,B.person)
    assert.equal(attributed.customer_id,nativeCustomer.id)
    assert.equal(attributed.organization_id,organizations[0].id)
    assert.equal(attributed.actor_person_id,B.person)
    assert.equal(attributed.action,"organization.buyer_cart_attributed")
    assert.equal(attributed.new_values.cart_id,customerCart.id)
    assert.equal(attributed.new_values.customer_id,nativeCustomer.id)
    assert.equal((await q(`select count(*)::int n
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id]))[0].n,1)
    const afterClaim=await readNativeCart(buyerCart(organizations[0].id,customerCart.id))
    assert.equal(afterClaim.status,200)
    assert.deepEqual(afterClaim.body,{organization_id:organizations[0].id,
      status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:true})
    const otherOrgClaim=await claimCart(organizations[1].id,customerCart.id)
    assert.equal(otherOrgClaim.status,403)
    assert.equal((await q(`select count(*)::int n from da_buyer_cart_attribution
      where cart_id=$1 and organization_id=$2`,
      [customerCart.id,organizations[0].id]))[0].n,1)
    const noCsrf=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(${JSON.stringify({action:"attribute",
          organization_id:organizations[0].id,cart_id:customerCart.id})})
      });return r.status
    })()`)
    assert.equal(noCsrf,403)
    assert.equal((await cartService.listCarts({
      id:customerCart.id,customer_id:nativeCustomer.id
    })).length,1,"Attribution must not modify native Cart")
    // Real empty Cart cannot prove sellable Store coverage or buyer block.
    const inspected=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(inspected.status,200)
    assert.deepEqual(inspected.body,{
      organization_id:organizations[0].id,status:"seller_scope_empty",
      seller_count:0,seller_block_verified:false,checkout_ready:false
    })
    assert.equal((await readNativeCart(buyerCart(organizations[1].id,
      customerCart.id)+"&seller_scope=inspect")).status,403)
    assert.equal((await readNativeCart(
      "/personal/buyer-context?organization_id="+
      encodeURIComponent(organizations[0].id)+"&seller_scope=inspect")).status,400)

    // The second participating Store uses the SAME real Owner application
    // and independent platform native approval pathway, not synthetic links.
    // One Organization may own multiple individually approved Stores (#37).
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    const secondApplicationId="daapp_"+randomBytes(16).toString("hex")
    const secondApplication={
      organization_id:organizations[0].id,application_id:secondApplicationId,
      name:"B22 second Owner Store "+rand,
      email:"b22-second-owner-store-"+rand+"@example.invalid",currency_code:"try"
    }
    const secondSubmission=await submit(secondApplication)
    assert.equal(secondSubmission.status,201,
      "Second Store must use authenticated Owner application path")
    const secondOwnerStoreId=secondSubmission.body.seller_id as string
    assert.match(secondOwnerStoreId,/^sel_[A-Za-z0-9_-]+$/)
    assert.notEqual(secondOwnerStoreId,ownerStoreId)
    const preApproval=await native.listSellers({id:secondOwnerStoreId})
    assert.equal(preApproval.length,1)
    assert.equal(preApproval[0].status,"pending_approval")
    assert.equal(preApproval[0].approved_at,null)
    const secondOrigin=await q(`select o.organization_id,e.action,
      x.id as outbox_id from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1 and o.revoked_at is null`,[secondOwnerStoreId])
    assert.equal(secondOrigin.length,1)
    assert.equal(secondOrigin[0].organization_id,organizations[0].id)
    assert.equal(secondOrigin[0].action,"organization.store_application_created")
    assert.equal((await get(selected(organizations[0].id))).body.stores
      .some((store:any)=>store.id===secondOwnerStoreId),false,
      "Pending second Store cannot be used for commerce")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const secondApproval=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:secondApplicationId,seller_id:secondOwnerStoreId
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(secondApproval.status,200,
      "Only explicit platform staff can approve the second Owner Store")
    assert.equal(secondApproval.body.status,"open")
    const secondApproved=await native.listSellers({id:secondOwnerStoreId})
    assert.equal(secondApproved.length,1)
    assert.equal(secondApproved[0].status,"open")
    assert.ok(secondApproved[0].approved_at)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    assert.deepEqual(new Set((await get(selected(organizations[0].id)))
      .body.stores.map((store:any)=>store.id)),
      new Set([ownerStoreId,secondOwnerStoreId]),
      "Both platform-linked native approved Stores belong to Alpha only")
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    process.stdout.write("PASS B22 second Owner Store: real application and separate platform approval, two audited Org→Store links, native pending denied then approved; no automatic permission\\n")

    // Positive REAL native multi-Store Cart, no synthetic Graph mocks:
    // Medusa published master variant, Mercur's per-Seller Offer workflow,
    // and Medusa's native addToCartWorkflow with Mercur's Offer hooks.
    // All resources exist solely in this guarded disposable PG16 CI database.
    const {result:[b22Profile]}=await createShippingProfilesWorkflow(container).run({
      input:{data:[{name:"B22 two-Store Offer profile "+rand,type:"default"}]}
    })
    assert.match(b22Profile.id,/^sp_[A-Za-z0-9_-]+$/)
    const {result:[sellableProduct]}=await createProductsWorkflow(container).run({
      input:{created_by:stores[0].id,products:[{
        title:"B22 two-Store shared master "+rand,status:"published",
        variants:[{title:"One size",sku:"B22-NATIVE-"+rand}]
      }]}
    })
    // Mercur's product workflow result is the master product projection;
    // variants are not guaranteed populated. Read the ACTUAL persisted
    // native Medusa Product module, never infer a variant from output shape.
    const persistedVariants=await container.resolve("product").listProductVariants({
      product_id:sellableProduct.id
    })
    assert.equal(persistedVariants.length,1)
    const variant=persistedVariants[0]
    assert.match(variant.id,/^variant_[A-Za-z0-9_-]+$/)
    // Mercur 2.3.7 createOffersWorkflow's seller-inventory step obtains
    // its Seller from offers[0], so use one run per Seller, not a mixed batch.
    const offerRows:Array<{id:string;seller_id:string}>=[]
    // Both participating native Stores used real Owner application and
    // independent platform approval. Other Sellers are not silently included.
    const cartStoreIds=[ownerStoreId,secondOwnerStoreId]
    for(let i=0;i<2;i++){
      const sku="B22-TWO-STORE-"+i+"-"+rand
      const {result:[offer]}=await createOffersWorkflow(container).run({
        input:{offers:[{
          seller_id:cartStoreIds[i],created_by:member.id,
          sku,variant_id:variant.id,shipping_profile_id:b22Profile.id,
          inventory_items:[{sku,stock_levels:[]}],
          prices:[{amount:1000+i*100,currency_code:"eur"}],
          manage_inventory:false,allow_backorder:true
        }]}
      })
      assert.match(offer.id,/^offer_[A-Za-z0-9_-]+$/)
      assert.equal(offer.seller_id,cartStoreIds[i])
      offerRows.push(offer)
    }
    // Read-only positive B22 discovery: native Mercur Offers (never a public
    // /store route), a published shared master Product and two independently
    // approved Organization-owned Sellers. No prices or checkout enabled.
    const catalogUrl=(org:string)=>"/personal/catalog?organization_id="+
      encodeURIComponent(org)
    const catalogAuditBefore=await q("select count(*)::int n from da_audit_event")
    const scopedCatalog=await get(catalogUrl(organizations[0].id))
    assert.equal(scopedCatalog.status,200,"Protected Buyer Owner sees approved Store product titles")
    assert.match(scopedCatalog.cache,/no-store/)
    assert.equal(scopedCatalog.body.organization_id,organizations[0].id)
    assert.equal(scopedCatalog.body.prices_available,false)
    assert.equal(scopedCatalog.body.checkout_ready,false)
    assert.deepEqual(new Set(scopedCatalog.body.stores.map((x:any)=>x.id)),new Set(cartStoreIds),
      "Unlinked, pending or non-approved Stores must not enter a Buyer catalogue")
    for(const store of scopedCatalog.body.stores){
      assert.ok(store.products.some((item:any)=>item.product_id===sellableProduct.id&&
        item.title===sellableProduct.title&&
        offerRows.some(o=>o.id===item.offer_id&&o.seller_id===store.id)))
      assert.equal(JSON.stringify(store).includes("calculated_price"),false)
      assert.equal(JSON.stringify(store).includes("inventory_quantity"),false)
    }
    assert.equal((await get(catalogUrl(organizations[2].id))).status,403,
      "Foreign Organization cannot be selected to read private catalogue")
    assert.equal((await get(catalogUrl(organizations[0].id)+"&seller_id="+ownerStoreId)).status,400,
      "Browser cannot forge native Seller scope")
    assert.equal((await get(catalogUrl(organizations[0].id),
      {"x-seller-id":ownerStoreId})).status,400)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.click("#buyer-catalog-refresh")
    await browser.wait("!document.getElementById('buyer-catalog-panel').hidden && document.getElementById('buyer-catalog-items').children.length>=2")
    assert.equal(await browser.eval("document.getElementById('buyer-catalog-items').textContent.includes("+
      JSON.stringify(sellableProduct.title)+")"),true)
    assert.deepEqual(await q("select count(*)::int n from da_audit_event"),catalogAuditBefore,
      "Read-only Buyer catalogue cannot write canonical audit")
    process.stdout.write("PASS B22 Buyer catalogue: real Chrome HTTPS and PG16 two published Mercur Offers under approved Buyer Org, foreign and forged scopes 403/400, zero prices and audit writes\n")
    // Use a task-only sales channel and region for native cart pricing.
    const sales=container.resolve("sales_channel")
    const market=await sales.createSalesChannels({name:"B22 two-Store channel "+rand})
    const regions=container.resolve("region")
    const region=await regions.createRegions({
      name:"B22 two-Store region "+rand,currency_code:"eur",countries:[]
    })
    await cartService.updateCarts(customerCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    for(const offer of offerRows){
      await addToCartWorkflow(container).run({input:{
        cart_id:customerCart.id,items:[{
          variant_id:variant.id,offer_id:offer.id,
          quantity:1,requires_shipping:true,metadata:{offer_id:offer.id}
        } as any] // Mercur's installed Offer augmentation is runtime-registered.
        // The downstream Medusa DTO alone lacks this Mercur-specific field.
      }})
    }
    const nativeTwoStore=await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })
    assert.equal(nativeTwoStore.items?.length,2)
    assert.equal(nativeTwoStore.customer_id,nativeCustomer.id)
    assert.equal(nativeTwoStore.completed_at,null)
    const query=container.resolve("query")
    const {data:graphTwoStore}=await query.graph({entity:"cart",fields:[
      "id","items.id","items.offer.id","items.offer.seller_id"
    ],filters:{id:customerCart.id}})
    assert.equal(graphTwoStore.length,1)
    assert.equal(graphTwoStore[0].items.length,2)
    assert.deepEqual(
      new Set(graphTwoStore[0].items.map((line:any)=>line.offer?.seller_id)),
      new Set(cartStoreIds)
    )
    assert.deepEqual(
      new Set(graphTwoStore[0].items.map((line:any)=>line.offer?.id)),
      new Set(offerRows.map(o=>o.id))
    )
    const twoStoreScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(twoStoreScope.status,200)
    assert.deepEqual(twoStoreScope.body,{
      organization_id:organizations[0].id,status:"seller_scope_mapped",
      seller_count:2,seller_block_verified:true,checkout_ready:false
    })
    assert.equal((await readNativeCart(buyerCart(organizations[1].id,
      customerCart.id)+"&seller_scope=inspect")).status,403)
    // B22 #76: strong Foundation Owner A has the actual platform-approved
    // Store association. B is only Alpha buyer/member and cannot issue Store
    // policy. Native Member/SellerMember alone is not the issuer grant.
    const changeStoreBlock=async(action:"block"|"unblock")=>browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify({action,organization_id:organizations[0].id,
          seller_id:ownerStoreId,buyer_organization_id:organizations[0].id})})
      })
      return {status:r.status,body:await r.json()}
    })()`)
    // Native Chrome Owner control, not merely an HTTP request through CDP.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-block-panel').hidden")
    await browser.eval(`document.querySelector('#store-block-form select[name=seller_id]').value=${JSON.stringify(ownerStoreId)}`)
    await browser.input('#store-block-form input[name=buyer_organization_id]',
      organizations[0].id)
    await browser.click('#store-block-form button[value="block"]')
    await browser.wait("document.getElementById('store-block-status').textContent.includes('engellendi')")
    assert.ok(browser.http.some((x:any)=>x.path==="/personal/store-buyer-blocks"&&
      x.method==="POST"&&x.status===200),"Owner's visible policy form must POST 200")
    assert.equal((await changeStoreBlock("block")).status,200,
      "Replay must not write another active block")
    const blockedCatalog=await get(catalogUrl(organizations[0].id))
    assert.equal(blockedCatalog.status,200)
    assert.equal(blockedCatalog.body.stores.some((x:any)=>x.id===ownerStoreId),false,
      "Store block must hide its offers from exactly this Buyer Organization")
    assert.equal(blockedCatalog.body.stores.some((x:any)=>x.id===secondOwnerStoreId),true,
      "Another Store must retain its independent Buyer visibility")
    // Admin of the other Organization cannot use the same native member
    // association to manage Alpha's Store, nor can SellerMember alone.
    const wrongOwner=await browser.eval(`(async()=>{
      const token=(await(await fetch('/personal/session')).json()).csrf_token
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},
        body:JSON.stringify(${JSON.stringify({action:"block",
          organization_id:organizations[1].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[0].id})})
      });return r.status
    })()`)
    assert.equal(wrongOwner,403)
    const noBlockCsrf=await browser.eval(`(async()=>{
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(${JSON.stringify({action:"unblock",
          organization_id:organizations[0].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[0].id})})
      });return r.status
    })()`)
    assert.equal(noBlockCsrf,403)
    assert.equal((await q(`select count(*)::int n from da_store_buyer_organization_block
      where seller_id=$1 and buyer_organization_id=$2 and revoked_at is null`,
      [ownerStoreId,organizations[0].id]))[0].n,1)
    const blockedScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(blockedScope.status,403)
    assert.deepEqual(blockedScope.body,{message:"Access denied"})
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A Store Buyer Organization block committed before L must deny checkout")
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2)
    await browser.click('#store-block-form button[value="unblock"]')
    await browser.wait("document.getElementById('store-block-status').textContent.includes('kaldırıldı')")
    assert.equal((await changeStoreBlock("unblock")).status,200,
      "Replay must not erase revocation history")
    assert.equal((await q(`select count(*)::int n from da_store_buyer_organization_block
      where seller_id=$1 and buyer_organization_id=$2 and revoked_at is null`,
      [ownerStoreId,organizations[0].id]))[0].n,0)
    assert.deepEqual((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")).body,
      twoStoreScope.body)
    const restoredCatalog=await get(catalogUrl(organizations[0].id))
    assert.equal(restoredCatalog.status,200)
    assert.equal(restoredCatalog.body.stores.some((x:any)=>x.id===ownerStoreId),true,
      "Unblock restores only this Store's read access; no checkout activation")
    // Each Store has an independent Buyer Organization policy. B-only block
    // must never be read as an Alpha global organization suspension.
    const changeSecondBlock=async(action:"block"|"unblock")=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action,organization_id:organizations[0].id,
          seller_id:secondOwnerStoreId,
          buyer_organization_id:organizations[0].id
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal((await changeSecondBlock("block")).status,200)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,1)
    const onlySecondBlocked=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(onlySecondBlocked.status,403)
    assert.deepEqual(onlySecondBlocked.body,{message:"Access denied"})
    // Unblocking A must not undo B's block. Re-block A, then unblock it
    // independently while B stays active: full scope remains denied.
    assert.equal((await changeStoreBlock("block")).status,200)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,2)
    assert.equal((await changeStoreBlock("unblock")).status,200)
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")).status,403)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,1)
    assert.equal((await changeSecondBlock("unblock")).status,200)
    const allUnblocked=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(allUnblocked.status,200)
    assert.deepEqual(allUnblocked.body,twoStoreScope.body)
    assert.equal(allUnblocked.body.seller_block_verified,true)
    // The single Foundation decision is positive only for the exact immutable
    // Alpha attribution, verified Customer and both currently unblocked Stores.
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"B22 final checkout snapshot must allow the exact current legal Buyer scope")

    // A current grant and active membership do not revive a disabled or
    // soft-deleted canonical Person. Exercise both guards against real PG16.
    await q("update da_person set disabled_at=clock_timestamp() where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A disabled canonical Person must be denied at checkout L")
    await q("update da_person set disabled_at=null where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"Re-enabled synthetic Person restores only its otherwise-current valid scope")

    await q("update da_person set deleted_at=clock_timestamp() where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A soft-deleted canonical Person must be denied at checkout L")
    await q("update da_person set deleted_at=null where id=$1",[B.person])
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"Restored synthetic Person still requires the same live grant and Store scope")

    assert.equal(await foundation.authorizeBuyerCheckout(
      foreignCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A foreign native Cart has no Alpha legal attribution")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,foreignNativeCustomer.id,cartStoreIds
    ),false,"A different native Customer cannot borrow the immutable attribution")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,[...cartStoreIds,"sel_missing_checkout"]
    ),false,"Every native Offer Seller must have a matching approved Organization origin")
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is not null`,
      [organizations[0].id]))[0].n,3,
      "Both independent Store block revocation histories must persist")
    process.stdout.write("PASS B22 two platform-approved Stores: each Store's buyer block separately denies whole multi-Store scope; unblock A cannot lift B; both unblocked restores 200, no cart writes\\n")
    process.stdout.write("PASS B22 audited Owner Store Buyer Organization block: two-Store scope 403 if one blocked, idempotent unblock restores 200; no checkout\\n")
    // One native Seller suspended means NO partially authorized two-Store
    // scope. The native workflow restores the task's prior approved state.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:secondOwnerStoreId,reason:"B22 task-only cart Seller suspension negative"
    }})
    assert.equal((await native.listSellers({id:secondOwnerStoreId}))[0].status,"suspended")
    const suspendedScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(suspendedScope.status,403)
    assert.deepEqual(suspendedScope.body,{message:"Access denied"})
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2,"Suspension must not silently mutate cart")
    await unsuspendSellerWorkflow(container).run({input:{seller_id:secondOwnerStoreId}})
    const restoredScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(restoredScope.status,200)
    assert.deepEqual(restoredScope.body,twoStoreScope.body)
    // Later historical fixtures expect only the original Owner Store
    // enabled. Retain the second Store's audited link and history, but
    // suspend only this disposable native Store before old list assertions.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:secondOwnerStoreId,
      reason:"B22 task-only second Store isolated from later fixture"
    }})
    process.stdout.write("PASS B22 native Seller suspension: one Store suspends -> entire two-Store scope 403, native reopen -> 200; no checkout\\n")
    process.stdout.write("PASS B22 real two-Store Offer Cart: native Mercur Offers and Medusa addToCartWorkflow persist 2 separate Seller links; Chrome read-only scope counts 2 with both Store origin links verified and checkout closed\\n")


    process.stdout.write("PASS B22 audited Buyer Organization Cart attribution: real Chrome POST + Foundation PG16 audit/outbox, exact replay, foreign Customer/Organization denied, no Medusa cart mutation or checkout\\n")

    const wrongCustomerOrg=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(sellerGamma.id))})
      return r.status
    })()`)
    assert.equal(wrongCustomerOrg,403)
    const forgedCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id)+"&customer_id=cus_foreign")})
      return r.status
    })()`)
    assert.equal(forgedCustomer,400)
    // Dual-proof linking updates the active privacy epoch. If the Organization
    // workspace was concealed, restore it via a real Chrome navigation and
    // server-validated Organization selection. Never fake document.hidden.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    if(!await reviewer.eval("!document.getElementById('workspace').hidden && !document.getElementById('buyer-context-panel').hidden")){
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.getElementById('workspace').hidden===false")
      await reviewer.select(organizations[0].name,"member")
      await reviewer.wait("!document.getElementById('buyer-context-panel').hidden")
    }
    await reviewer.click('#buyer-customer-check')
    await reviewer.wait("document.getElementById('buyer-customer-status').textContent.includes('Kuruluş izni ve mevcut müşteri bağınız doğrulandı')")
    process.stdout.write("PASS B22 linked Customer profile reload and buyer Organization privacy-safe UI check\\n")
    assert.equal((await q(`select count(*)::int n from da_verified_actor_binding
      where person_id=$1 and actor_type='customer' and revoked_at is null`,
      [B.person]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: native Customer dual-proof, Alpha Member grant and independent Beta Owner eligibility; forged Customer 400, immutable Buyer attribution\\n")
    // B is Alpha Member with a scoped explicit grant and independently Beta
    // protected Owner. Both may be eligible; an attributed Cart cannot switch.
    const verifiedBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}')
      return {status:r.status,body:await r.json()}
    })()`)
    assert.equal(verifiedBuyer.status,200)
    assert.deepEqual(verifiedBuyer.body,{
      organization_id:organizations[0].id,
      status:"buyer_permission_verified",checkout_ready:false
    })
    const wrongBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[1].id)}')
      return r.status
    })()`)
    assert.equal(wrongBuyer,200,
      "Protected Beta Owner has inherent buyer eligibility without any explicit grant")

    // Even when B explicitly gains buyer.purchase in TWO Organizations, the
    // same native Cart cannot be silently reassigned from Alpha to Beta.
    // This tests the unique immutable attribution, not only missing permission.
    const ownBetaMembership=memberships[1]
    const betaPermission=async(action:"grant"|"revoke")=>reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action,organization_id:organizations[1].id,
          membership_id:ownBetaMembership.id
        })})
      });return {status:r.status,body:await r.json()}
    })()`)
    assert.equal((await betaPermission("grant")).status,200)
    const betaCartEligible=await readNativeCart(buyerCart(organizations[1].id,customerCart.id))
    assert.equal(betaCartEligible.status,200)
    assert.equal(betaCartEligible.body.organization_attributed,false,
      "Native Customer is valid for Beta, but Alpha's attribution must remain exclusive")
    assert.equal((await claimCart(organizations[1].id,customerCart.id)).status,403,
      "Authorized Beta buyer cannot steal Cart already attributed to Alpha")
    const unchangedCart=await q(`select organization_id,source_audit_event_id
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id])
    assert.equal(unchangedCart.length,1)
    assert.equal(unchangedCart[0].organization_id,organizations[0].id)
    assert.equal(unchangedCart[0].source_audit_event_id,attributed.source_audit_event_id)

    // B22 cross-Organization commercial scope: independent seller companies
    // Alpha and Gamma, third independent legal Buyer Beta. Person A is a
    // real protected Owner of BOTH seller Orgs via separate memberships.
    // B is Beta Owner and the same dual-proof Customer, without a separate
    // buyer login or any automatic buyer.purchase permission.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(sellerGamma.name,"owner")
    const gammaApplication={
      organization_id:sellerGamma.id,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:"B22 Gamma independent Store "+rand,
      email:"b22-gamma-store-"+rand+"@example.invalid",currency_code:"try"
    }
    const gammaSubmitted=await submit(gammaApplication)
    assert.equal(gammaSubmitted.status,201)
    const gammaSellerId=gammaSubmitted.body.seller_id as string
    assert.match(gammaSellerId,/^sel_[A-Za-z0-9_-]+$/)
    assert.notEqual(gammaSellerId,ownerStoreId)
    assert.equal((await native.listSellers({id:gammaSellerId}))[0].status,
      "pending_approval")
    const gammaLink=await q(`select o.organization_id,e.action,x.id as outbox_id
      from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1 and o.revoked_at is null`,[gammaSellerId])
    assert.equal(gammaLink.length,1)
    assert.equal(gammaLink[0].organization_id,sellerGamma.id)
    assert.equal(gammaLink[0].action,"organization.store_application_created")
    assert.deepEqual((await get(selected(sellerGamma.id))).body.stores,[],
      "Gamma Store must be denied before separate platform approval")
    const wrongGammaApproval=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      return (await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:gammaApplication.application_id,
          seller_id:gammaSellerId
        })})
      })).status
    })()`)
    assert.equal(wrongGammaApproval,403,
      "Gamma Owner cannot grant themselves the platform approver task")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const gammaApproved=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:gammaApplication.application_id,
          seller_id:gammaSellerId
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(gammaApproved.status,200)
    assert.equal(gammaApproved.body.status,"open")
    assert.equal((await native.listSellers({id:gammaSellerId}))[0].status,"open")
    assert.equal((await get(selected(sellerGamma.id))).body.stores[0].id,
      gammaSellerId)
    const alphaAfterGamma=(await get(selected(organizations[0].id))).body.stores
    assert.deepEqual(alphaAfterGamma.map((store:any)=>store.id),
      [ownerStoreId],
      "Gamma must not enter Alpha; previously suspended second Alpha Store stays excluded")
    assert.equal(alphaAfterGamma.some((store:any)=>store.id===gammaSellerId),false)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    const gammaSku="B22-GAMMA-BETA-"+rand
    const {result:[gammaOffer]}=await createOffersWorkflow(container).run({
      input:{offers:[{
        seller_id:gammaSellerId,created_by:member.id,
        sku:gammaSku,variant_id:variant.id,
        shipping_profile_id:b22Profile.id,
        inventory_items:[{sku:gammaSku,stock_levels:[]}],
        prices:[{amount:1200,currency_code:"eur"}],
        manage_inventory:false,allow_backorder:true
      }]}
    })
    assert.equal(gammaOffer.seller_id,gammaSellerId)
    const betaTwoSellerCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(betaTwoSellerCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    for(const offer of [offerRows[0],gammaOffer]){
      await addToCartWorkflow(container).run({input:{
        cart_id:betaTwoSellerCart.id,
        items:[{variant_id:variant.id,offer_id:offer.id,
          quantity:1,requires_shipping:true,
          metadata:{offer_id:offer.id}} as any]
      }})
    }
    const betaNative=await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })
    assert.equal(betaNative.items?.length,2)
    assert.equal(betaNative.customer_id,nativeCustomer.id)
    assert.equal(betaNative.completed_at,null)
    const {data:betaGraph}=await query.graph({
      entity:"cart",fields:["id","items.id","items.offer.id",
        "items.offer.seller_id"],
      filters:{id:betaTwoSellerCart.id}
    })
    assert.equal(betaGraph.length,1)
    assert.deepEqual(new Set(betaGraph[0].items.map((line:any)=>
      line.offer?.seller_id)),new Set([ownerStoreId,gammaSellerId]))
    const betaClaim=await claimCart(organizations[1].id,betaTwoSellerCart.id)
    assert.equal(betaClaim.status,200)
    assert.equal(betaClaim.body.organization_id,organizations[1].id)
    assert.equal(betaClaim.body.checkout_ready,false)
    const betaAttribution=await q(`select a.organization_id,e.action,
      x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[betaTwoSellerCart.id])
    assert.equal(betaAttribution.length,1)
    assert.equal(betaAttribution[0].organization_id,organizations[1].id)
    assert.equal(betaAttribution[0].action,"organization.buyer_cart_attributed")
    const alphaPreflight=await readNativeCart(
      buyerCart(organizations[0].id,betaTwoSellerCart.id))
    assert.equal(alphaPreflight.status,200,
      "Native Customer preflight is not a Cart ownership or checkout grant")
    assert.equal(alphaPreflight.body.organization_attributed,false)
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,betaTwoSellerCart.id)+
      "&seller_scope=inspect")).status,403,
      "Explicit Alpha buyer grant cannot inspect Beta's attributed Seller Cart")
    const betaScopeUrl=buyerCart(organizations[1].id,betaTwoSellerCart.id)+
      "&seller_scope=inspect"
    const betaOpenScope=await readNativeCart(betaScopeUrl)
    assert.equal(betaOpenScope.status,200)
    assert.deepEqual(betaOpenScope.body,{
      organization_id:organizations[1].id,status:"seller_scope_mapped",
      seller_count:2,seller_block_verified:true,checkout_ready:false
    })
    // B22 native checkout ingress boundary: Mercur 2.3.7 overrides
    // POST /store/carts/:id/complete with its split-order writer. Before
    // any financial/provider or order flow is authorized, the existing
    // personal ingress must reject this native route, even for a valid
    // signed-in Buyer, a Store Owner and a forged native Bearer.
    // No payment session is created; a nonzero two-Offer Cart remains open.
    const nativeCompletePath="/store/carts/"+
      encodeURIComponent(betaTwoSellerCart.id)+"/complete"
    // Without an API key, Medusa rejects the request before the DoğruAdres
    // ingress can run. Use its supported native workflow and a disposable
    // test-only publishable key to prove the INNER security boundary too.
    const {result:[b22PublishableKey]}=await createApiKeysWorkflow(container).run({
      input:{api_keys:[{title:"B22 isolated native checkout denial "+rand,
        type:"publishable",created_by:""}]}
    })
    assert.equal(typeof b22PublishableKey.id,"string")
    assert.equal(typeof b22PublishableKey.token,"string")
    assert.ok(b22PublishableKey.token.length>20)
    await linkSalesChannelsToApiKeyWorkflow(container).run({input:{
      id:b22PublishableKey.id,add:[market.id]
    }})
    // Medusa's API Key module distinguishes the internal apk_ ID from the
    // public pk_ token used in the Store HTTP header. Never log the token.
    const keyHeaders={"x-publishable-api-key":b22PublishableKey.token}
    assert.equal((await q(`select count(*)::int n from order_group
      where cart_id=$1`,[betaTwoSellerCart.id]))[0].n,0)
    const tryNativeCompletion=async(actor:B06Chrome,
      additionalHeaders:Record<string,string>={})=>actor.eval(`(async()=>{
      const response=await fetch(${JSON.stringify(nativeCompletePath)},{
        method:"POST",headers:${JSON.stringify(additionalHeaders)}
      })
      return {status:response.status,body:await response.json()}
    })()`)
    const missingKey=await tryNativeCompletion(reviewer)
    assert.equal(missingKey.status,400,
      "No-key request should fail Medusa's publishable-key preflight")
    assert.equal(missingKey.body?.type,"not_allowed")
    assert.match(missingKey.body?.message??"",/Publishable API key required/)
    for(const actor of [reviewer,browser]){
      const denied=await tryNativeCompletion(actor,keyHeaders)
      assert.equal(denied.status,401,
        "Native checkout with valid Store key returned "+denied.status+
        "; body="+JSON.stringify(denied.body).slice(0,380)+
        "; only the personal ingress denial proves checkout is closed")
      assert.deepEqual(denied.body,{
        message:"Personal session ingress required"
      })
    }
    const forgedNative=await tryNativeCompletion(reviewer,{
      ...keyHeaders,authorization:"Bearer b22-untrusted-not-a-token"
    })
    assert.equal(forgedNative.status,401,
      "An unverified native credential cannot enter the order writer")
    assert.deepEqual(forgedNative.body,{
      message:"Personal session ingress required"
    })
    assert.equal((await q(`select count(*)::int n from order_group
      where cart_id=$1`,[betaTwoSellerCart.id]))[0].n,0,
      "No OrderGroup is created by a denied checkout attempt")
    const afterDenied=await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })
    assert.equal(afterDenied.completed_at,null)
    assert.equal(afterDenied.items?.length,2)
    assert.equal((await readNativeCart(betaScopeUrl)).status,200,
      "A denied native checkout must not damage valid read-only Buyer scope")
    process.stdout.write("PASS B22 Mercur native split-order POST ingress: real Buyer/Owner/forged Bearer 401, zero OrderGroups, unchanged two-item Cart; no payment or checkout writer\\n")

    // Mercur 2.3.7 processPaymentWorkflow can capture BEFORE the split-order
    // validate hook. Verify the active native HTTP callback boundary itself
    // (not only the public frontdoor), without a provider session or money.
    const callbackPath="/hooks/payment/pp_system_default"
    const callbackOrigin="http://127.0.0.1:"+nativePort
    for(const authorization of [undefined,"Bearer b22-untrusted-not-a-token"]){
      const callbackResponse=await fetch(callbackOrigin+callbackPath,{
        method:"POST",headers:{"content-type":"application/json",
          ...(authorization?{authorization}:{})},
        body:JSON.stringify({b22_disposable_probe:true}),
        signal:AbortSignal.timeout(15000)
      })
      assert.equal(callbackResponse.status,403,
        "Native payment callback must fail closed before provider/workflow dispatch")
      assert.deepEqual(await callbackResponse.json(),
        {message:"Payment callback is not enabled"})
    }
    const chromeCallback=await reviewer.eval(`(async()=>{
      const response=await fetch('/hooks/payment/pp_system_default',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({b22_disposable_probe:true})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(chromeCallback.status,403,
      "Signed-in Chrome must not enable the native payment callback")
    assert.deepEqual(chromeCallback.body,
      {message:"Payment callback is not enabled"})
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
      [betaTwoSellerCart.id]))[0].n,0,
      "Denied callback cannot create an OrderGroup")
    const {data:callbackPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:betaTwoSellerCart.id}
    })
    assert.equal(callbackPaymentLinks.length,0,
      "Denied callback cannot attach a Cart payment collection")
    assert.equal((await cartService.retrieveCart(betaTwoSellerCart.id)).completed_at,
      null,"Denied callback must preserve the native open Cart")
    process.stdout.write("\nPASS B22 Chrome: native private HTTP and signed-in HTTPS payment callbacks return 403; Cart open, zero OrderGroup and payment links; no provider/capture\n")


    const betaSellerBlock=async(action:"block"|"unblock",
      sellerOrg:string,sellerId:string)=>browser.eval(`(async()=>{
        const session=await(await fetch('/personal/session')).json()
        const response=await fetch('/personal/store-buyer-blocks',{
          method:'POST',headers:{'content-type':'application/json',
            'x-csrf-token':session.csrf_token},
          body:JSON.stringify(${JSON.stringify({
            action,organization_id:sellerOrg,seller_id:sellerId,
            buyer_organization_id:organizations[1].id
          })})
        })
        return {status:response.status,body:await response.json()}
      })()`)
    assert.equal((await betaSellerBlock("block",organizations[0].id,
      gammaSellerId)).status,403,
      "Alpha Owner scope cannot issue Gamma Store's policy")
    const wrongBetaIssuer=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      return (await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action:"block",organization_id:sellerGamma.id,
          seller_id:gammaSellerId,
          buyer_organization_id:organizations[1].id
        })})
      })).status
    })()`)
    assert.equal(wrongBetaIssuer,403,
      "Buyer Organization Owner and staff may not control Gamma Seller policy")
    const activeBetaBlocks=async()=>{
      const [row]=await q(`select count(*)::int n
        from da_store_buyer_organization_block
        where buyer_organization_id=$1 and revoked_at is null`,
        [organizations[1].id])
      return row.n as number
    }
    assert.equal(await activeBetaBlocks(),0)
    assert.equal((await betaSellerBlock("block",organizations[0].id,
      ownerStoreId)).status,200)
    assert.equal(await activeBetaBlocks(),1)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403)
    // Alpha's earlier two-Store cart has its second Seller deliberately
    // suspended. Its native Customer/Organization ownership preflight still
    // works; do NOT expect sellable Seller scope from a suspended Store.
    const alphaBuyerPreflight=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id))
    assert.equal(alphaBuyerPreflight.status,200)
    assert.equal(alphaBuyerPreflight.body.organization_attributed,true)
    assert.equal((await q(`select count(*)::int n from
      da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,0,
      "Beta-only Store policy must not create a block on Buyer Alpha")
    assert.equal((await betaSellerBlock("block",sellerGamma.id,
      gammaSellerId)).status,200)
    assert.equal(await activeBetaBlocks(),2)
    assert.equal((await betaSellerBlock("unblock",organizations[0].id,
      ownerStoreId)).status,200)
    assert.equal(await activeBetaBlocks(),1)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403,
      "Gamma Store's Beta block survives Alpha Store's independent unblock")
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,
      gammaSellerId)).status,200)
    assert.equal(await activeBetaBlocks(),0)
    assert.deepEqual((await readNativeCart(betaScopeUrl)).body,
      betaOpenScope.body)
    assert.equal((await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })).items?.length,2,
      "No partial Cart mutation across separate seller companies")
    const [history]=await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is not null`,
      [organizations[1].id])
    assert.equal(history.n,2)
    assert.equal((await q(`select organization_id from
      da_buyer_cart_attribution where cart_id=$1`,
      [betaTwoSellerCart.id]))[0].organization_id,organizations[1].id)
    process.stdout.write("PASS B22 Alpha/Gamma separate legal Seller Organizations and Beta legal Buyer: two native Offers/Cart, two platform-approved Owner-origin links, wrong issuer 403, each Store block denies full scope, cross-Buyer isolation, independent unblock and audit history, checkout closed\\n")
    // Prepare a real, fully authorized Beta cart against Gamma while Beta buyer.purchase is still active.
    // The same cart will be completed only after the subsequent real Owner revocation.
    const hookProbeSku="B22-HOOK-REVOKED-GRANT-"+rand
    const {result:[hookProbeOffer]}=await createOffersWorkflow(container).run({
      input:{offers:[{
        seller_id:gammaSellerId,created_by:member.id,sku:hookProbeSku,
        variant_id:variant.id,shipping_profile_id:b22Profile.id,
        inventory_items:[{sku:hookProbeSku,stock_levels:[]}],
        prices:[{amount:0,currency_code:"eur"}],
        manage_inventory:false,allow_backorder:true
      }]}
    })
    assert.match(hookProbeOffer.id,/^offer_[A-Za-z0-9_-]+$/)
    assert.equal(hookProbeOffer.seller_id,gammaSellerId)
    const hookProbeSeller=await native.listSellers({id:gammaSellerId})
    assert.equal(hookProbeSeller.length,1)
    assert.equal(hookProbeSeller[0].status,"open")
    assert.ok(hookProbeSeller[0].approved_at)
    const hookProbeCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(hookProbeCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:hookProbeCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,quantity:1,
        requires_shipping:true,metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:hookProbeBefore}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.offer.id","items.offer.seller_id"],
      filters:{id:hookProbeCart.id}
    })
    assert.equal(hookProbeBefore.length,1)
    assert.equal(hookProbeBefore[0].customer?.id,nativeCustomer.id)
    assert.equal(Number(hookProbeBefore[0].total),0)
    assert.equal(hookProbeBefore[0].completed_at,null)
    assert.equal(hookProbeBefore[0].items.length,1)
    assert.equal(hookProbeBefore[0].items[0].offer?.id,hookProbeOffer.id)
    assert.equal(hookProbeBefore[0].items[0].offer?.seller_id,gammaSellerId)
    const hookProbeClaim=await claimCart(organizations[1].id,hookProbeCart.id)
    assert.equal(hookProbeClaim.status,200)
    assert.equal(hookProbeClaim.body.organization_id,organizations[1].id)
    assert.equal(hookProbeClaim.body.checkout_ready,false)
    const hookProbeAttribution=await q(`select a.person_id,a.customer_id,a.organization_id,
      e.action,x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[hookProbeCart.id])
    assert.equal(hookProbeAttribution.length,1)
    assert.equal(hookProbeAttribution[0].person_id,B.person)
    assert.equal(hookProbeAttribution[0].customer_id,nativeCustomer.id)
    assert.equal(hookProbeAttribution[0].organization_id,organizations[1].id)
    assert.equal(hookProbeAttribution[0].action,"organization.buyer_cart_attributed")
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Before revocation L must allow the exact attributed Beta→Gamma cart")
    // On THIS disposable Medusa/PG16 execution only, narrow the trusted
    // default Owner role policy, without altering Member grants or DB data.
    // HTTP and final one-statement checkout L must both deny the same
    // otherwise-eligible Cart; the old policy is restored in finally.
    const priorBuyerOwnerActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="products.edit"
      const narrowed=await readNativeCart(buyerCart(organizations[1].id,hookProbeCart.id))
      assert.equal(narrowed.status,403,"Owner buyer.purchase removed from trusted role policy must deny HTTP")
      assert.equal(await foundation.authorizeBuyerCheckout(
        hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
      ),false,"Owner role policy must also deny real final PostgreSQL checkout L")
      assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
        [hookProbeCart.id]))[0].n,0)
    }finally{
      if(priorBuyerOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=priorBuyerOwnerActions
    }
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Restored approved role default must allow the same attributed Cart")
    process.stdout.write("PASS B22 Owner role policy: narrowed buyer.purchase denies real HTTPS and PG16 final checkout L with zero OrderGroup; default restored\n")
    process.stdout.write("PASS B22 pre-revocation control: real Customer + immutable Beta Cart attribution + approved Gamma Store + active buyer.purchase passes Foundation L; zero-value Cart remains open\n")
    // A real Owner's Store-specific Buyer Organization block must deny the
    // native Mercur completion at L, not only the read-only Seller scope.
    // Restore only this task-owned block before the separate permission race.
    const gammaBlock=await betaSellerBlock("block",sellerGamma.id,gammaSellerId)
    assert.equal(gammaBlock.status,200,"Gamma Owner Store block via authenticated Chrome")
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),false,"Store Buyer Organization block committed before L must deny")
    const storeBlockRun=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:hookProbeCart.id},throwOnError:false
    })
    const storeBlockError=(storeBlockRun.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    assert.match(storeBlockError,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "Native Mercur validate must reject blocked Buyer before OrderGroup creation")
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
      [hookProbeCart.id]))[0].n,0)
    const {data:blockOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:hookProbeCart.id}
    })
    const {data:blockPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(blockOrderLinks.length,0)
    assert.equal(blockPaymentLinks.length,0)
    assert.equal((await cartService.retrieveCart(hookProbeCart.id)).completed_at,
      null,"Blocked Store cannot complete previously valid Cart")
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Unblock restores L eligibility only while buyer.purchase remains valid")
    process.stdout.write("\nPASS B22 real Mercur validate: real Chrome Gamma Store Buyer block denies attributed Beta Cart before OrderGroup/Order/payment writes; unblock restores L without completing Cart\n")

    // Positive native split-order proof ONLY inside this pre-authorized
    // disposable CI database. Zero-value, non-shipping, no provider or payment
    // collection. Do not expose the native checkout writer to a visitor.
    const zeroOrderCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(zeroOrderCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:zeroOrderCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:zeroCartBefore}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.requires_shipping","items.offer.id",
        "items.offer.seller_id"],
      filters:{id:zeroOrderCart.id}
    })
    assert.equal(zeroCartBefore.length,1)
    assert.equal(Number(zeroCartBefore[0].total),0)
    assert.equal(zeroCartBefore[0].completed_at,null)
    assert.equal(zeroCartBefore[0].customer?.id,nativeCustomer.id)
    assert.equal(zeroCartBefore[0].items.length,1)
    assert.equal(zeroCartBefore[0].items[0].requires_shipping,false,
      "Task-only no-shipping Cart cannot silently require shipping")
    assert.equal(zeroCartBefore[0].items[0].offer?.id,hookProbeOffer.id)
    assert.equal(zeroCartBefore[0].items[0].offer?.seller_id,gammaSellerId)
    const zeroClaim=await claimCart(organizations[1].id,zeroOrderCart.id)
    assert.equal(zeroClaim.status,200)
    assert.equal(zeroClaim.body.checkout_ready,false,
      "This internal proof never authorizes visitor checkout")
    assert.equal(await foundation.authorizeBuyerCheckout(
      zeroOrderCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Real Foundation L must authorize the positive synthetic Cart")
    const zeroGroupResult=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:zeroOrderCart.id},throwOnError:false
    })
    assert.equal(zeroGroupResult.errors?.length??0,0,
      "Native split-order must complete the authorized zero-total Cart")
    const zeroOrderGroupId=zeroGroupResult.result?.order_group_id
    assert.equal(typeof zeroOrderGroupId,"string")
    const zeroGroupRows=await q("select id from order_group where cart_id=$1",
      [zeroOrderCart.id])
    assert.equal(zeroGroupRows.length,1)
    assert.equal(zeroGroupRows[0].id,zeroOrderGroupId)
    const {data:zeroOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],
      filters:{cart_id:zeroOrderCart.id}
    })
    assert.equal(zeroOrderLinks.length,1,
      "One approved Gamma Seller creates exactly one native Order")
    assert.match(zeroOrderLinks[0].order_id,/^order_[A-Za-z0-9_-]+$/)
    const {data:zeroPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:zeroOrderCart.id}
    })
    assert.equal(zeroPaymentLinks.length,0,
      "Zero-total proof must not create payment collection or capture")
    const completedZeroCart=await cartService.retrieveCart(zeroOrderCart.id)
    assert.ok(completedZeroCart.completed_at,
      "Native Cart completion must persist after successful OrderGroup")
    assert.equal(completedZeroCart.customer_id,nativeCustomer.id)
    const zeroAttribution=await q("select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
      [zeroOrderCart.id])
    assert.equal(zeroAttribution.length,1)
    assert.equal(zeroAttribution[0].organization_id,organizations[1].id)
    assert.equal(zeroAttribution[0].customer_id,nativeCustomer.id)
    process.stdout.write("PASS B22 Chrome: authorized zero-value native Mercur split-order persisted one OrderGroup/Order and completed Cart with immutable Beta attribution; no payment or visitor checkout\\n")

    // Native Medusa system provider is an in-memory simulator. All writes
    // are in this preauthorized random disposable CI database; no external
    // payment, HTTP checkout route, provider configuration or payout.
    const paymentService=container.resolve("payment")
    const systemProviders=await paymentService.listPaymentProviders({
      id:"pp_system_default",is_enabled:true
    })
    assert.equal(systemProviders.length,1,
      "Only the built-in system simulator is allowed in this acceptance")
    await updateRegionsWorkflow(container).run({input:{
      selector:{id:region.id},
      update:{payment_providers:["pp_system_default"]}
    }})
    const paidCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(paidCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:paidCart.id,
      items:[{variant_id:variant.id,offer_id:gammaOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:gammaOffer.id}} as any]
    }})
    const {data:[paidCartGraph]}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.requires_shipping","items.offer.id",
        "items.offer.seller_id"],filters:{id:paidCart.id}
    })
    assert.ok(Number(paidCartGraph.total)>0,"Simulator must exercise payable Cart")
    assert.equal(paidCartGraph.completed_at,null)
    assert.equal(paidCartGraph.customer?.id,nativeCustomer.id)
    assert.equal(paidCartGraph.items.length,1)
    assert.equal(paidCartGraph.items[0].requires_shipping,false)
    assert.equal(paidCartGraph.items[0].offer?.seller_id,gammaSellerId)
    const paidClaim=await claimCart(organizations[1].id,paidCart.id)
    assert.equal(paidClaim.status,200)
    assert.equal(paidClaim.body.checkout_ready,false,
      "No visitor checkout authority is granted by the simulator")
    assert.equal(await foundation.authorizeBuyerCheckout(
      paidCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Payable Cart must pass the real fresh Foundation decision")
    const {result:payCollection}=await createPaymentCollectionForCartWorkflow(
      container).run({input:{cart_id:paidCart.id}})
    assert.ok(payCollection.id)
    const {result:paySession}=await createPaymentSessionsWorkflow(
      container).run({input:{
        payment_collection_id:payCollection.id,
        provider_id:"pp_system_default"
      }})
    assert.equal(paySession.provider_id,"pp_system_default")
    const simulatedAuthorization=await paymentService.authorizePaymentSession(
      paySession.id,{})
    assert.ok(simulatedAuthorization?.id,
      "Existing payment module must produce pre-order authorization")
    const authorizedSession=await paymentService.retrievePaymentSession(
      paySession.id,{relations:["payment","payment.captures"]}
    )
    assert.equal(authorizedSession.status,"authorized")
    assert.equal(authorizedSession.payment?.id,simulatedAuthorization.id)
    assert.equal(authorizedSession.payment?.captures?.length??0,0,
      "Authorization must not automatically capture before B22 L")
    const payableOrderRun=await completeCartWithSplitOrdersWorkflow(
      container).run({input:{cart_id:paidCart.id},throwOnError:false})
    assert.equal(payableOrderRun.errors?.length??0,0,
      "Native Mercur must accept an already-authorized simulated session")
    const payableGroups=await q(
      "select id from order_group where cart_id=$1",[paidCart.id])
    assert.equal(payableGroups.length,1)
    assert.equal(payableGroups[0].id,payableOrderRun.result?.order_group_id)
    const {data:payableOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:paidCart.id}
    })
    assert.equal(payableOrderLinks.length,1)
    const beforeCapture=await paymentService.retrievePayment(
      simulatedAuthorization.id,{relations:["captures"]}
    )
    assert.equal(beforeCapture.captures?.length??0,0,
      "Native order acceptance must precede any simulated capture")
    assert.ok((await cartService.retrieveCart(paidCart.id)).completed_at,
      "Payable Cart must be completed before capture")
    const {result:capturedSimulation}=await capturePaymentWorkflow(
      container).run({input:{payment_id:simulatedAuthorization.id}})
    assert.equal(capturedSimulation.id,simulatedAuthorization.id)
    const afterCapture=await paymentService.retrievePayment(
      simulatedAuthorization.id,{relations:["captures"]}
    )
    assert.equal(afterCapture.captures?.length,1,
      "Only one system-provider capture is recorded after Order")
    assert.ok(afterCapture.captured_at)
    const paidAttribution=await q(
      "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
      [paidCart.id])
    assert.equal(paidAttribution.length,1)
    assert.equal(paidAttribution[0].organization_id,organizations[1].id)
    assert.equal(paidAttribution[0].customer_id,nativeCustomer.id)
    process.stdout.write("\nPASS B22 native payment simulation: system provider authorized before L/order; native Mercur persisted single OrderGroup/Order; only then system capture recorded; no external payment, callback or visitor checkout\n")

    // Mercur stores the split-cart workflow with idempotent:false. Prove that
    // another native invocation cannot create a second order or charge an
    // already-completed Cart. This is serial retry, not concurrent callback
    // replay; the simulated provider has no external financial side effect.
    const replayCompletedPaidCart=await completeCartWithSplitOrdersWorkflow(
      container).run({input:{cart_id:paidCart.id},throwOnError:false})
    const replayCompletedErrors=(replayCompletedPaidCart.errors??[]).map(
      (entry:any)=>String(entry.error?.message??entry.error??entry.message??"")
    ).join("\n")
    assert.match(replayCompletedErrors,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "Completed Cart must be rejected by the native B22 validate hook")
    const repeatedGroups=await q(
      "select id from order_group where cart_id=$1",[paidCart.id])
    assert.equal(repeatedGroups.length,1,"Completed Cart replay cannot add Group")
    assert.equal(repeatedGroups[0].id,payableGroups[0].id)
    const {data:repeatedOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:paidCart.id}
    })
    assert.equal(repeatedOrderLinks.length,1,
      "Completed Cart replay cannot add a duplicate native Order")
    assert.equal(repeatedOrderLinks[0].order_id,payableOrderLinks[0].order_id)
    const replayedPayment=await paymentService.retrievePayment(
      simulatedAuthorization.id,{relations:["captures"]}
    )
    assert.equal(replayedPayment.captures?.length,1,
      "Completed Cart retry must leave exactly one prior capture")
    assert.equal(replayedPayment.captured_at?.valueOf(),
      afterCapture.captured_at?.valueOf())
    assert.ok((await cartService.retrieveCart(paidCart.id)).completed_at)
    process.stdout.write("\nPASS B22 native completed Cart retry: second Mercur split-order invocation denied; original OrderGroup/Order and single system-provider capture unchanged\n")


    // Pre-authorized but NOT capturable: the real Chrome Gamma Owner blocks
    // Beta before Mercur's L. The system provider has no external effects.
    // This is the paid-cart negative counterpart of the positive sequence.
    const deniedPaidCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(deniedPaidCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:deniedPaidCart.id,
      items:[{variant_id:variant.id,offer_id:gammaOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:gammaOffer.id}} as any]
    }})
    const {data:[deniedPaidGraph]}=await query.graph({
      entity:"cart",fields:["id","total","customer.id","items.id",
        "items.offer.seller_id"],filters:{id:deniedPaidCart.id}
    })
    assert.ok(Number(deniedPaidGraph.total)>0)
    assert.equal(deniedPaidGraph.customer?.id,nativeCustomer.id)
    assert.equal(deniedPaidGraph.items.length,1)
    assert.equal(deniedPaidGraph.items[0].offer?.seller_id,gammaSellerId)
    const deniedPaidClaim=await claimCart(organizations[1].id,deniedPaidCart.id)
    assert.equal(deniedPaidClaim.status,200)
    assert.equal(deniedPaidClaim.body.checkout_ready,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      deniedPaidCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Paid-cart negative control must start with valid L")
    const {result:deniedPaymentCollection}=
      await createPaymentCollectionForCartWorkflow(container).run({
        input:{cart_id:deniedPaidCart.id}
      })
    const {result:deniedPaymentSession}=
      await createPaymentSessionsWorkflow(container).run({input:{
        payment_collection_id:deniedPaymentCollection.id,
        provider_id:"pp_system_default"
      }})
    const deniedAuthorization=await paymentService.authorizePaymentSession(
      deniedPaymentSession.id,{})
    assert.ok(deniedAuthorization?.id)
    assert.equal((await paymentService.retrievePayment(
      deniedAuthorization.id,{relations:["captures"]}
    )).captures?.length??0,0)
    assert.equal((await betaSellerBlock("block",sellerGamma.id,gammaSellerId)).status,200)
    try{
      assert.equal(await foundation.authorizeBuyerCheckout(
        deniedPaidCart.id,nativeCustomer.id,[gammaSellerId]
      ),false,"Owner Store block committed before L must reject authorized Cart")
      const rejectedPaidRun=await completeCartWithSplitOrdersWorkflow(
        container).run({input:{cart_id:deniedPaidCart.id},throwOnError:false})
      const rejectedPaidMessage=(rejectedPaidRun.errors??[]).map((entry:any)=>
        String(entry.error?.message??entry.error??entry.message??"")).join("\n")
      assert.match(rejectedPaidMessage,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
        "Native Mercur L must reject a pre-authorized blocked Buyer")
      assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
        [deniedPaidCart.id]))[0].n,0)
      const {data:deniedOrderLinks}=await query.graph({
        entity:"order_cart",fields:["order_id"],filters:{cart_id:deniedPaidCart.id}
      })
      assert.equal(deniedOrderLinks.length,0)
      const unchangedPayment=await paymentService.retrievePayment(
        deniedAuthorization.id,{relations:["captures"]}
      )
      assert.equal(unchangedPayment.captures?.length??0,0,
        "No capture before or after failed B22 native checkout")
      assert.equal(unchangedPayment.captured_at??null,null)
      assert.equal((await cartService.retrieveCart(deniedPaidCart.id)).completed_at,
        null,"Failed paid Cart must remain open")
      const deniedAttribution=await q(
        "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
        [deniedPaidCart.id])
      assert.equal(deniedAttribution.length,1)
      assert.equal(deniedAttribution[0].organization_id,organizations[1].id)
      assert.equal(deniedAttribution[0].customer_id,nativeCustomer.id)
    }finally{
      assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    }
    process.stdout.write("\nPASS B22 native payment denial: pre-authorized system-provider Cart blocked by real Store Owner before L; Mercur rejected with zero OrderGroup/Order/capture and preserved immutable Buyer attribution\n")

    // POST-L cutoff: the native Mercur order-group INSERT can be paused by
    // a task-owned PostgreSQL SHARE table lock without blocking earlier
    // SELECTs. A WAITING RowExclusiveLock proves validate/L has finished.
    // Real Chrome Owner commits Store block during that pause; checkout
    // must finish because the Product Owner's L cutoff was already crossed.
    // Zero-value cart only; no payment session, capture, provider or payout.
    const postLCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(postLCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:postLCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:[postLGraph]}=await query.graph({
      entity:"cart",fields:["id","total","customer.id","completed_at",
        "items.id","items.offer.seller_id"],filters:{id:postLCart.id}
    })
    assert.equal(Number(postLGraph.total),0)
    assert.equal(postLGraph.customer?.id,nativeCustomer.id)
    assert.equal(postLGraph.completed_at,null)
    assert.equal(postLGraph.items.length,1)
    assert.equal(postLGraph.items[0].offer?.seller_id,gammaSellerId)
    const postLClaim=await claimCart(organizations[1].id,postLCart.id)
    assert.equal(postLClaim.status,200)
    assert.equal(postLClaim.body.checkout_ready,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      postLCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Post-L cutoff control must start with a valid Buyer")
    const postLBarrier=new Client({connectionString:u.toString()})
    await postLBarrier.connect()
    let postLBarrierHeld=false
    let postLStoreBlocked=false
    let pendingPostLCheckout:Promise<{run?:any;error?:string}>|undefined
    try{
      await postLBarrier.query("BEGIN")
      postLBarrierHeld=true
      const postLBarrierPid=(await postLBarrier.query(
        "select pg_backend_pid()::int as pid"
      )).rows[0].pid as number
      await postLBarrier.query("LOCK TABLE order_group IN SHARE MODE")
      pendingPostLCheckout=completeCartWithSplitOrdersWorkflow(
        container).run({input:{cart_id:postLCart.id},throwOnError:false}).then(
          (run:any)=>({run}),(error:unknown)=>({error:String(error)})
        )
      await until(async()=>{
        const rows=await q(`select count(*)::int n from pg_locks l
          where l.locktype='relation' and l.relation='order_group'::regclass
            and l.mode='RowExclusiveLock' and l.granted=false
            and l.pid<>$1`,[postLBarrierPid])
        return rows[0].n===1
      },19000,"B22 native OrderGroup INSERT waits AFTER real validate L")
      assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
        [postLCart.id]))[0].n,0,
        "Paused post-L workflow must not yet have an OrderGroup")
      const postLBlock=await betaSellerBlock("block",sellerGamma.id,gammaSellerId)
      assert.equal(postLBlock.status,200,"Real Chrome Owner block after L")
      postLStoreBlocked=true
      assert.equal(await foundation.authorizeBuyerCheckout(
        postLCart.id,nativeCustomer.id,[gammaSellerId]
      ),false,"Next L must see the later committed Store block")
      await postLBarrier.query("ROLLBACK")
      postLBarrierHeld=false
      const completedPostL=await pendingPostLCheckout
      assert.equal(completedPostL.error,undefined)
      assert.equal(completedPostL.run?.errors?.length??0,0,
        "Native checkout already past L must not be retroactively denied")
      const postLGroups=await q("select id from order_group where cart_id=$1",
        [postLCart.id])
      assert.equal(postLGroups.length,1)
      assert.equal(postLGroups[0].id,completedPostL.run?.result?.order_group_id)
      const {data:postLOrderLinks}=await query.graph({
        entity:"order_cart",fields:["order_id"],filters:{cart_id:postLCart.id}
      })
      assert.equal(postLOrderLinks.length,1)
      assert.ok((await cartService.retrieveCart(postLCart.id)).completed_at)
      const {data:postLPaymentLinks}=await query.graph({
        entity:"cart_payment_collection",fields:["payment_collection_id"],
        filters:{cart_id:postLCart.id}
      })
      assert.equal(postLPaymentLinks.length,0,
        "Post-L zero-value checkout must not create a payment collection")
      const postLAttribution=await q(
        "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
        [postLCart.id])
      assert.equal(postLAttribution.length,1)
      assert.equal(postLAttribution[0].organization_id,organizations[1].id)
      assert.equal(postLAttribution[0].customer_id,nativeCustomer.id)
    }finally{
      if(postLBarrierHeld)await postLBarrier.query("ROLLBACK")
      await postLBarrier.end()
      if(pendingPostLCheckout)await pendingPostLCheckout
      if(postLStoreBlocked)
        assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    }
    process.stdout.write("\nPASS B22 post-L cutoff: native OrderGroup INSERT waited after validate L, real Chrome Store block committed during wait; checkout persisted one OrderGroup/Order with unchanged Buyer and zero payment; later L denied\n")

    // Native Mercur already acquires a per-Cart lock and checks the existing
    // OrderGroup. Two independent workflow invocations must not create two
    // orders even when the first is demonstrably past L and waiting to INSERT.
    // Only task-owned zero-total Cart/PG16 are used; no provider or capture.
    const concurrentCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(concurrentCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    await addToCartWorkflow(container).run({input:{
      cart_id:concurrentCart.id,
      items:[{variant_id:variant.id,offer_id:hookProbeOffer.id,
        quantity:1,requires_shipping:false,
        metadata:{offer_id:hookProbeOffer.id}} as any]
    }})
    const {data:[concurrentCartGraph]}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id",
        "items.id","items.offer.seller_id"],filters:{id:concurrentCart.id}
    })
    assert.equal(Number(concurrentCartGraph.total),0)
    assert.equal(concurrentCartGraph.completed_at,null)
    assert.equal(concurrentCartGraph.customer?.id,nativeCustomer.id)
    assert.equal(concurrentCartGraph.items.length,1)
    assert.equal(concurrentCartGraph.items[0].offer?.seller_id,gammaSellerId)
    const concurrentClaim=await claimCart(organizations[1].id,concurrentCart.id)
    assert.equal(concurrentClaim.status,200)
    assert.equal(concurrentClaim.body.checkout_ready,false)
    assert.equal(await foundation.authorizeBuyerCheckout(
      concurrentCart.id,nativeCustomer.id,[gammaSellerId]
    ),true)
    assert.equal(process.env.DOGRUADRES_B22_PG_LOCK_TEST,"true")
    const locking=container.resolve("locking")
    const probeKey="b22-pg-lock-probe:"+rand
    await locking.acquire(probeKey)
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [probeKey]))[0].n,1,"Native Medusa must use persisted Postgres locking")
    assert.equal(await locking.release(probeKey),true)
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [probeKey]))[0].n,0,"Task-only provider probe lock must be released")
    // The installed official PG provider persists acquire() locks in a table.
    // Test a short *expired* task-owned key, without a Cart, real worker crash,
    // or protected data. Expiry must not be mistaken for automatic recovery.
    const expiredProbeKey="b22-pg-expiry-probe:"+rand
    await locking.acquire(expiredProbeKey,{expire:1})
    try{
      const activeProbe=await q(
        "select owner_id,expiration>now() as active from locking where id=$1",
        [expiredProbeKey])
      assert.equal(activeProbe.length,1)
      assert.equal(activeProbe[0].owner_id,null)
      assert.equal(activeProbe[0].active,true)
      await until(async()=>{
        const expired=await q(
          "select expiration<=now() as expired from locking where id=$1",
          [expiredProbeKey])
        return expired.length===1 && expired[0].expired===true
      },5000,"B22 task-owned PostgreSQL lock TTL expiration")
      let attemptedReacquire=false
      try{
        await locking.acquire(expiredProbeKey,{expire:1})
        attemptedReacquire=true
      }catch(error){
        assert.match(String(error),/Failed to acquire lock/i,
          "Official Postgres provider must report expired-row conflict")
      }
      assert.equal(attemptedReacquire,false,
        "An expired provider row cannot currently be reacquired automatically")
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [expiredProbeKey]))[0].n,1,
        "Expired provider row persists without an explicit release")
    }finally{
      // In Medusa 2.21.2 release() deletes an expired row but returns false
      // because its TTL has elapsed. Verify actual deletion below instead.
      assert.equal(await locking.release(expiredProbeKey),false,
        "Expired scoped lock release reports elapsed lease")
    }
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [expiredProbeKey]))[0].n,0,
      "Only the task-owned expired probe row is deleted")
    process.stdout.write("\nPASS B22 PostgreSQL expired lock behavior: task-owned one-second lock remained after expiration and rejected reacquisition; only explicit scoped release cleared it; crash recovery is NOT proven\n")
    // Independent native Medusa process exits abnormally after acquire().
    // Never terminate a host process, protected worker or Cart transaction.
    const abandonedKey="b22-pg-process-exit:"+rand
    const exitedProvider=spawnSync("bun",[
      "run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"
    ],{
      cwd:process.cwd(),env:{...process.env,B22_ABRUPT_LOCK_TEST_KEY:abandonedKey},
      encoding:"utf8",timeout:45000,maxBuffer:1024*1024,stdio:["ignore","pipe","pipe"]
    })
    assert.ok(!exitedProvider.error && exitedProvider.status===86 &&
      String(exitedProvider.stdout??"").includes("B22_TASK_PROVIDER_LOCK_BEFORE_ABRUPT_EXIT"),
      "Independent disposable Medusa provider must acquire and exit 86; logs retained only in memory")
    try{
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [abandonedKey]))[0].n,1,"Exited provider left exact task-owned lock row")
      await until(async()=>{
        const row=await q("select expiration<=now() as expired from locking where id=$1",
          [abandonedKey])
        return row.length===1 && row[0].expired===true
      },5000,"B22 expired provider lock after abrupt process exit")
      let recovered=false
      try{
        await locking.acquire(abandonedKey,{expire:1})
        recovered=true
      }catch(error){
        assert.match(String(error),/Failed to acquire lock/i)
      }
      assert.equal(recovered,false,"Expired lock may not be assumed recoverable")
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [abandonedKey]))[0].n,1)
    }finally{
      // No Cart key and no global releaseAll: exact synthetic probe key only.
      await locking.release(abandonedKey)
    }
    assert.equal((await q("select count(*)::int n from locking where id=$1",
      [abandonedKey]))[0].n,0,"Synthetic lock cleanup scoped by exact key")
    process.stdout.write("\nOBSERVED B22 abrupt Medusa process exit: expired provider lock persists and rejects reacquisition; exact task-only cleanup; checkout recovery BLOCKED\n")
    // Only installed official Redis is tested: two isolated native processes,
    // no real Cart, order, payment, or production service.
    const redisKey="b22-redis-process-exit:"+rand
    const redisEnv:NodeJS.ProcessEnv={
      ...process.env,
      DOGRUADRES_B22_PG_LOCK_TEST:"false",
      DOGRUADRES_B22_REDIS_LOCK_TEST:"true",
      LOCKING_REDIS_URL:"redis://127.0.0.1:6379",
      B22_REDIS_PROBE_KEY:redisKey,
    }
    const cmd=["run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"]
    const firstRedis=spawnSync("bun",cmd,{
      cwd:process.cwd(),env:{...redisEnv,B22_REDIS_PROBE_MODE:"crash"},
      encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:45000,maxBuffer:1024*1024
    })
    assert.ok(!firstRedis.error&&firstRedis.status===86&&
      String(firstRedis.stdout??"").includes("B22_REDIS_NATIVE_LOCK_BEFORE_EXIT"),
      "B22 disposable Redis lock acquire and abrupt exit required")
    const secondRedis=spawnSync("bun",cmd,{
      cwd:process.cwd(),env:{...redisEnv,B22_REDIS_PROBE_MODE:"recover"},
      encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:65000,maxBuffer:1024*1024
    })
    assert.ok(!secondRedis.error&&secondRedis.status===0&&
      String(secondRedis.stdout??"").includes("B22_REDIS_NATIVE_LOCK_RECOVERED_AFTER_TTL"),
      "B22 native Redis must deny active key, then recover after expiry")
    process.stdout.write("\nPASS B22 official Redis provider: independent process exit, live-lock denial, automatic TTL recovery; native Mercur Cart checkout NOT TESTED on Redis\n")


    type NativeCartAttempt={run?:any;error?:string}
    const startCartAttempt=():Promise<NativeCartAttempt>=>
      completeCartWithSplitOrdersWorkflow(container).run({
        input:{cart_id:concurrentCart.id},throwOnError:false
      }).then((run:any)=>({run}),(error:unknown)=>({error:String(error)}))
    const concurrentBarrier=new Client({connectionString:u.toString()})
    await concurrentBarrier.connect()
    let concurrentBarrierHeld=false
    let firstConcurrentAttempt:Promise<NativeCartAttempt>|undefined
    let secondaryProcessDone:Promise<{code:number|null;output:string}>|undefined
    let primaryAttempt:NativeCartAttempt|undefined
    let secondaryOutcome:{code:number|null;output:string}|undefined
    try{
      await concurrentBarrier.query("BEGIN")
      concurrentBarrierHeld=true
      const concurrentBarrierPid=(await concurrentBarrier.query(
        "select pg_backend_pid()::int as pid"
      )).rows[0].pid as number
      await concurrentBarrier.query("LOCK TABLE order_group IN SHARE MODE")
      firstConcurrentAttempt=startCartAttempt()
      await until(async()=>{
        const rows=await q(`select count(*)::int n from pg_locks l
          where l.locktype='relation' and l.relation='order_group'::regclass
            and l.mode='RowExclusiveLock' and l.granted=false
            and l.pid<>$1`,[concurrentBarrierPid])
        return rows[0].n===1
      },19000,"B22 first native process passed L and waits on OrderGroup INSERT")
      assert.equal((await q("select count(*)::int n from locking where id=$1",
        [concurrentCart.id]))[0].n,1,
        "First Medusa process must own the PostgreSQL Cart lock at L")
      // Diagnostic only: Mercur 2.3.7 passes millisecond constants to
      // Medusa 2.21.2's seconds-based acquireLockStep. Check the real lease.
      const nativeLease=await q(
        "select owner_id, extract(epoch from (expiration - now()))::double precision as seconds_left from locking where id=$1",
        [concurrentCart.id])
      assert.equal(nativeLease.length,1,
        "Task-owned native Cart must have exactly one persisted lease")
      assert.equal(nativeLease[0].owner_id,null)
      const nativeLeaseSeconds=Number(nativeLease[0].seconds_left)
      assert.ok(Number.isFinite(nativeLeaseSeconds) &&
        nativeLeaseSeconds>119900 && nativeLeaseSeconds<=120000,
        "Installed Mercur/Medusa unit mismatch must be observed, not assumed: native Cart lease near 120000 seconds")
      process.stdout.write("\nOBSERVED B22 native Cart TTL mismatch: PostgreSQL lease near 120000 seconds instead of intended 120 seconds; checkout remains BLOCKED\n")
      let output=""
      let stderr=""
      let started=false
      const classifiedStartupFailure=()=>{
        // Logs can contain secrets; never echo them to CI or GitHub. Report
        // only a bounded, predefined diagnostic label and process phase.
        const source=(output+"\\n"+stderr).toLowerCase()
        const phase=output.includes("B22_SECONDARY_NATIVE_INVOKED")
          ?"native-invoked":output.includes("B22_SECONDARY_PG_LOCK_CONFLICT")
          ?"lock-confirmed":output.includes("B22_SECONDARY_PROVIDER_READY")
          ?"provider-ready":output.includes("B22_SECONDARY_SCOPE_READY")
          ?"scope-ready":"before-script"
        const cause=/eaddrinuse|address already in use/i.test(source)
          ?"port-conflict":/cannot find module|module not found|module resolution/i.test(source)
          ?"module-resolution":/permission denied|eacces/i.test(source)
          ?"process-permission":/relation .*does not exist|migration/i.test(source)
          ?"database-schema":/failed to acquire lock|already locked/i.test(source)
          ?"lock-conflict":/connection refused|econnrefused/i.test(source)
          ?"connection-refused":/error running script|assertionerror/i.test(source)
          ?"script-error":"unclassified"
        return "phase="+phase+"; category="+cause
      }
      let resolveStarted!:()=>void
      let rejectStarted!:(reason:Error)=>void
      const secondInvoked=new Promise<void>((resolve,reject)=>{
        resolveStarted=resolve;rejectStarted=reject
      })
      // medusa exec may run under Node even when the CI parent is Bun.
      // Use the existing installed Bun CLI explicitly for its `run` command.
      const secondary=spawn("bun",[
        "run","medusa","exec","./integration-tests/postgres/b22-store-ui.exec.ts"
      ],{
        cwd:process.cwd(),
        env:{...process.env,B22_SECOND_PROCESS_CART_ID:concurrentCart.id},
        stdio:["ignore","pipe","pipe"],
        signal:AbortSignal.timeout(60000)
      })
      secondaryProcessDone=new Promise(resolve=>{
        secondary.stdout?.on("data",(chunk:Buffer)=>{
          output=(output+String(chunk)).slice(-16000)
          if(!started && output.includes("B22_SECONDARY_PG_LOCK_CONFLICT") &&
              output.includes("B22_SECONDARY_NATIVE_INVOKED")){
            started=true
            resolveStarted()
          }
        })
        // Keep any native Medusa diagnostics only in process-local memory.
        // Report a fixed classification, never raw logs or environment.
        secondary.stderr?.on("data",(chunk:Buffer)=>{
          stderr=(stderr+String(chunk)).slice(-16000)
        })
        secondary.on("error",(error:Error)=>{
          if(!started)rejectStarted(Error("B22 secondary Medusa process could not start"))
          resolve({code:null,output})
        })
        secondary.on("close",(code:number|null)=>{
          if(!started)rejectStarted(Error(
            "B22 secondary process did not reach native workflow; exit="+
            String(code)+"; "+classifiedStartupFailure()
          ))
          resolve({code,output})
        })
      })
      await secondInvoked
      assert.equal((await q(
        "select count(*)::int n from order_group where cart_id=$1",
        [concurrentCart.id]
      ))[0].n,0,"Both processes must overlap before the first OrderGroup write")
      await concurrentBarrier.query("ROLLBACK")
      concurrentBarrierHeld=false
      primaryAttempt=await firstConcurrentAttempt
      secondaryOutcome=await secondaryProcessDone
    }finally{
      if(concurrentBarrierHeld)await concurrentBarrier.query("ROLLBACK")
      await concurrentBarrier.end()
      if(firstConcurrentAttempt)await firstConcurrentAttempt
      if(secondaryProcessDone)await secondaryProcessDone
    }
    assert.equal(primaryAttempt?.error,undefined)
    assert.equal(primaryAttempt?.run?.errors?.length??0,0,
      "First native process must complete its authorized Cart")
    assert.equal(secondaryOutcome?.code,0,
      "Independent native Medusa process must complete its safe retry")
    assert.ok(secondaryOutcome?.output.includes("B22_SECONDARY_NATIVE_DENIED")||
      secondaryOutcome?.output.includes("B22_SECONDARY_NATIVE_SUCCESS"),
      "Independent native process must return a classified safe result")
    const concurrentGroups=await q(
      "select id from order_group where cart_id=$1",[concurrentCart.id])
    assert.equal(concurrentGroups.length,1,
      "Independent native Medusa processes must persist exactly one OrderGroup")
    assert.equal(primaryAttempt?.run?.result?.order_group_id,concurrentGroups[0].id)
    const {data:concurrentOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:concurrentCart.id}
    })
    assert.equal(concurrentOrderLinks.length,1,
      "Independent processes must persist exactly one Order")
    assert.ok((await cartService.retrieveCart(concurrentCart.id)).completed_at)
    const {data:concurrentPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:concurrentCart.id}
    })
    assert.equal(concurrentPaymentLinks.length,0)
    const concurrentAttribution=await q(
      "select organization_id,customer_id from da_buyer_cart_attribution where cart_id=$1",
      [concurrentCart.id])
    assert.equal(concurrentAttribution.length,1)
    assert.equal(concurrentAttribution[0].organization_id,organizations[1].id)
    assert.equal(concurrentAttribution[0].customer_id,nativeCustomer.id)
    process.stdout.write("\nPASS B22 concurrent native Cart checkout: two separate Medusa processes observed shared PostgreSQL Cart lock after L at PG16 OrderGroup INSERT barrier; one completed Cart, one OrderGroup/Order, zero payment, unchanged Buyer attribution\n")

    // Deterministic L/commit race using the production buyer-permission
    // advisory lock and the real Chrome Owner mutation. No successful Cart
    // completion, OrderGroup or payment is exercised in this test.
    const buyerRevokeBarrier=new Client({connectionString:u.toString()})
    await buyerRevokeBarrier.connect()
    let pendingBuyerRevoke:Promise<{status:number;error?:string}>|undefined
    try{
      await buyerRevokeBarrier.query("BEGIN")
      const barrierPid=(await buyerRevokeBarrier.query(
        "select pg_backend_pid()::int as pid"
      )).rows[0].pid as number
      await buyerRevokeBarrier.query(
        "select pg_advisory_xact_lock(hashtext('b22-buyer-purchase'),hashtext($1))",
        [organizations[1].id+":"+B.person]
      )
      pendingBuyerRevoke=betaPermission("revoke").then(
        (response:any)=>({status:response.status as number}),
        (error:unknown)=>({status:0,error:String(error)})
      )
      // Prove that the actual browser-driven mutation is already waiting on
      // this exact lock; merely starting a Promise would not prove overlap.
      await until(async()=>{
        const waiting=await q(`select count(*)::int n from pg_locks held
          join pg_locks waiting
            on waiting.locktype='advisory'
           and waiting.database=held.database
           and waiting.classid=held.classid
           and waiting.objid=held.objid
           and waiting.objsubid=held.objsubid
           and waiting.pid<>held.pid
           and waiting.granted=false
          where held.pid=$1 and held.locktype='advisory'
            and held.granted=true`,[barrierPid])
        return waiting[0].n===1
      },19000,"B22 real Chrome Owner revoke waits on existing grant lock")
      assert.equal(await foundation.authorizeBuyerCheckout(
        hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
      ),true,"L before the concurrent Owner revoke commits must see the prior grant")
    } finally {
      try{await buyerRevokeBarrier.query("ROLLBACK")}
      finally{await buyerRevokeBarrier.end()}
    }
    assert.ok(pendingBuyerRevoke,"Expected a real in-flight browser revocation")
    assert.equal((await pendingBuyerRevoke).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"An independent Beta protected Owner retains authority after self-grant revoke")
    process.stdout.write("PASS B22 Owner authority: advisory barrier proved a real grant revocation commit; native Buyer scope remains authorized by protected Owner, not an obsolete self-grant\n")
    assert.equal((await readNativeCart(betaScopeUrl)).status,200,
      "Protected Beta Owner's own Cart stays readable after self-grant revocation")
    assert.equal((await claimCart(organizations[1].id,customerCart.id)).status,403,
      "Even an Owner cannot replace an existing Alpha immutable Cart attribution")
    // Keep this test a safe native checkout DENIAL: a fresh Owner Store block
    // (not self-grant revocation) causes the actual Mercur hook to refuse.
    assert.equal((await betaSellerBlock("block",sellerGamma.id,gammaSellerId)).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),false,"Store Buyer Organization block overrides even protected Owner authority")
    const hookRun=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:hookProbeCart.id},throwOnError:false
    })
    const hookErrorText=(hookRun.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    assert.match(hookErrorText,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "Mercur validate must deny the protected Owner's Cart because its Store buyer block is active")
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",[hookProbeCart.id]))[0].n,0)
    const {data:hookOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(hookOrderLinks.length,0)
    const {data:hookPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(hookPaymentLinks.length,0)
    const {data:hookCartAfter}=await query.graph({
      entity:"cart",fields:["id","total","completed_at","customer.id","items.id",
        "items.offer.id","items.offer.seller_id"],filters:{id:hookProbeCart.id}
    })
    assert.equal(hookCartAfter.length,1)
    assert.equal(Number(hookCartAfter[0].total),0)
    assert.equal(hookCartAfter[0].completed_at,null)
    assert.equal(hookCartAfter[0].customer?.id,nativeCustomer.id)
    assert.equal(hookCartAfter[0].items.length,1)
    assert.equal(hookCartAfter[0].items[0].offer?.id,hookProbeOffer.id)
    assert.equal(hookCartAfter[0].items[0].offer?.seller_id,gammaSellerId)
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,gammaSellerId)).status,200)
    assert.equal(await foundation.authorizeBuyerCheckout(
      hookProbeCart.id,nativeCustomer.id,[gammaSellerId]
    ),true,"Unblocking restores inherited Owner authority independently of an explicit grant")
    process.stdout.write("PASS B22 real Mercur validate: protected Owner still authorized after self-grant revoke, but Store Buyer Organization block denies native checkout with zero OrderGroup/Order/payment; unblock restores L\n")
    process.stdout.write("NOT TESTED B22: successful order placement, authorization/capture with a real payment provider, post-L overlap orchestration, independent exact-PR acceptance\\n")

    const forgedBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}&actor_id=cus_forged')
      return r.status
    })()`)
    assert.equal(forgedBuyer,400,"Forged Customer context rejected")
    // Actual browser selection, not only an HTTP request: B's newly-active
    // Alpha membership is refreshed before selecting that Organization.
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("document.getElementById('workspace').hidden===false")
    await reviewer.select(organizations[0].name,"member")
    await reviewer.wait("!document.getElementById('buyer-context-panel').hidden")
    assert.equal(await reviewer.eval(`document.getElementById('buyer-context-status').textContent.includes('Sepet ve ödeme henüz kullanıma açık değil')`),true)

    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")
    await browser.eval(`document.querySelector('#buyer-grants-form select[name=membership_id]').value=${JSON.stringify(alphaMember.id)}`)
    await browser.click('#buyer-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select revoked_at from da_organization_buyer_permission
        where id=$1`,[buyerGrant.id])
      return rows.length===1&&!!rows[0].revoked_at
    },19000,"B22 Chrome Owner revokes explicit buyer.purchase")
    const buyerRevoked=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.buyer_permission_revoked'
        and e.actor_person_id=$1 and e.organization_id=$2
        and e.target_id=$3 and e.previous_values->>'grant_id'=$4`,
      [A.person,organizations[0].id,B.person,buyerGrant.id])
    assert.equal(buyerRevoked[0].n,1,"Revocation must emit canonical outbox")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A buyer.purchase revocation committed before L must deny checkout")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const deniedAfterRevoke=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}')
      return r.status
    })()`)
    assert.equal(deniedAfterRevoke,403,"Server rechecks revoked buyer.purchase")
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id))).status,403,
      "Revoked buyer.purchase cannot read even its own native Cart")
    assert.equal((await claimCart(organizations[0].id,customerCart.id)).status,403,
      "Revoked buyer.purchase must not renew an earlier immutable Cart attribution")

    assert.equal(await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return r.status
    })()`),403,"Revoked buyer.purchase denies even a valid native Customer")

    await reviewer.click('#buyer-context-refresh')
    await reviewer.wait("document.getElementById('buyer-context-panel').hidden===true")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    process.stdout.write("PASS B22 Chrome: explicit buyer.purchase remains mandatory for Alpha Member; cross-Organization, forged actor and revoked Member denied; protected Owner independent\\n")

    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where person_id=$1 and organization_id=$2 and revoked_at is null`,
      [B.person,organizations[0].id]))[0].n,0)
    process.stdout.write("PASS B22 Chrome: Owner grants and revokes Alpha Member buyer.purchase with real audit/outbox, idempotent replay; independent protected Owner authority creates no self-grant\\n")
    // F-02: an actual native Medusa Customer GET completes, but its HTTP
    // response is held while a supported Customer unlink commits to PG16.
    // No fake upstream actor response, production hook or external service.
    // The native Store Customer endpoint requires Medusa's publishable token.
    // Reuse the existing disposable B22 key; never log or persist it.
    const previousCustomerPublishable=process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY
    process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY=b22PublishableKey.token
    const customerBeforeRace=await reviewer.eval("(async()=>{const r=await fetch('/personal/contexts?type=customer');return r.status})()")
    assert.equal(customerBeforeRace,200,"Valid Customer stays available before unlink")
    const customerBindingRows=await q(
      "select id from da_verified_actor_binding where person_id=$1 and actor_type='customer' and revoked_at is null",
      [B.person])
    assert.equal(customerBindingRows.length,1)
    const raceCookie=await reviewer.token()
    assert.match(raceCookie??"",/^[A-Za-z0-9_-]{43}$/)
    const nativeCustomerTarget=topology.privateOrigin+"/store/customers/me"
    const realNodeFetch=globalThis.fetch
    let nativeResponseReceived=false,gateReleased=false
    let releaseNative!:()=>void
    const nativeGate=new Promise<void>(resolve=>{releaseNative=()=>{gateReleased=true;resolve()}})
    let intercepted=false
    globalThis.fetch=async(...args:Parameters<typeof fetch>):Promise<Response>=>{
      const response=await realNodeFetch(...args)
      const target=typeof args[0]==="string"?args[0]:
        args[0] instanceof URL?args[0].toString():args[0].url
      if(!intercepted&&target===nativeCustomerTarget&&response.status===200){
        intercepted=true
        // Read the real native body before waiting. Only delivery to the
        // public response is paused; the upstream Customer GET already passed.
        await response.clone().arrayBuffer()
        nativeResponseReceived=true
        await nativeGate
      }
      return response
    }
    let inFlightCustomer:Promise<{status:number;body:any}>|undefined
    try{
      inFlightCustomer=new Promise((resolve,reject)=>{
        const request=tlsRequest(host+"/personal/contexts?type=customer",{
          method:"GET",ca:readFileSync(crt),
          headers:{Cookie:"da_session="+raceCookie}
        },response=>{
          let body=""
          response.setEncoding("utf8")
          response.on("data",chunk=>{body+=chunk})
          response.on("end",()=>{
            try{resolve({status:response.statusCode??0,body:JSON.parse(body)})}
            catch(error){reject(error)}
          })
        })
        request.on("error",reject)
        request.setTimeout(14000,()=>request.destroy(Error("F-02 Customer GET timed out")))
        request.end()
      })
      await until(async()=>nativeResponseReceived,10000,
        "F-02 actual Medusa Customer HTTP response held before public reply")
      const unlinkCode="(async()=>{"+
        "const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/links',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'unlink',binding_id:"+
        JSON.stringify(customerBindingRows[0].id)+"})});"+
        "return {status:r.status}})()"
      const unlinkOutcome=await reviewer.eval(unlinkCode)
      assert.equal(unlinkOutcome.status,200,
        "Supported CSRF-protected Customer unlink must commit while native GET is held")
      const revokedBinding=await q(
        "select revoked_at from da_verified_actor_binding where id=$1",
        [customerBindingRows[0].id])
      assert.equal(revokedBinding.length,1)
      assert.ok(revokedBinding[0].revoked_at,
        "Independent PG16 readback confirms Customer unlink was committed")
      assert.equal((await q(
        "select count(*)::int n from da_actor_credential where binding_id=$1 and retired_at is null",
        [customerBindingRows[0].id]))[0].n,0,
        "Revoked Customer leaves no live native credential")
      releaseNative()
      const outcome=await inFlightCustomer
      assert.equal(outcome.status,403,
        "F-02: a native response completed before committed unlink must not expose stale Customer context")
      assert.deepEqual(outcome.body,{message:"Access denied"})
      process.stdout.write("PASS F-02 actual native Customer GET held: supported unlink committed PG16; stale public context denied and credentials retired\n")
    }finally{
      if(!gateReleased)releaseNative()
      globalThis.fetch=realNodeFetch
      if(previousCustomerPublishable===undefined)delete process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY
      else process.env.DOGRUADRES_STORE_PUBLISHABLE_KEY=previousCustomerPublishable
      if(inFlightCustomer)await inFlightCustomer.catch(()=>{})
    }

    // The Organization Owner may explicitly grant AND revoke products.edit
    // for an active member; platform staff status is not sufficient.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    // A matching role is not a sufficient signal if the previous selected
    // Organization also had an Owner role. Wait for exact Organization scope
    // and freshly loaded Store/member options before the real Chrome click.
    await browser.wait(`new URLSearchParams(location.search).get('organization')===${JSON.stringify(organizations[0].id)} && JSON.parse(document.getElementById('detail').textContent||'{}').id===${JSON.stringify(organizations[0].id)}`)
    await browser.wait(`!document.getElementById('product-grants-panel').hidden && Array.from(document.querySelector('#product-grants-form select[name=seller_id]').options).some(o=>o.value===${JSON.stringify(ownerStoreId)}) && Array.from(document.querySelector('#product-grants-form select[name=membership_id]').options).some(o=>o.value===${JSON.stringify(alphaMember.id)}) && !document.querySelector('#product-grants-form button[value=grant]').disabled`)
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form');
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)};
      f.elements.namedItem('membership_id').value=${JSON.stringify(alphaMember.id)};
    })()`)
    const priorProductGrantPosts=browser.http.filter((x:any)=>
      x.path==="/personal/store-product-permissions"&&x.method==="POST").length
    await browser.click('#product-grants-form button[value="grant"]')
    await until(async()=>browser.http.filter((x:any)=>
      x.path==="/personal/store-product-permissions"&&x.method==="POST"
    ).length>priorProductGrantPosts,19000,
      "B22 Chrome Owner products.edit POST reaches first-party HTTP")
    const productGrantPosts=browser.http.filter((x:any)=>
      x.path==="/personal/store-product-permissions"&&x.method==="POST")
    assert.equal(productGrantPosts[productGrantPosts.length-1].status,200,
      "Actual Chrome Owner products.edit POST must be accepted")
    await until(async()=>{
      const rows=await q(`select g.id from da_store_product_permission g
        where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
          and g.permission='products.edit' and g.revoked_at is null`,
        [B.person,organizations[0].id,ownerStoreId])
      return rows.length===1
    },19000,"B22 Chrome Owner actual products.edit permission")
    const [issued]=await q(`select g.id,g.source_audit_event_id from da_store_product_permission g
      where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
        and g.revoked_at is null`,[B.person,organizations[0].id,ownerStoreId])
    const auditGrant=await q(`select e.action,e.actor_person_id,e.organization_id,e.target_id,x.id outbox_id
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.new_values->>'grant_id'=$2`,[issued.source_audit_event_id,issued.id])
    assert.equal(auditGrant.length,1)
    assert.equal(auditGrant[0].action,"organization.store_product_permission_granted")
    assert.equal(auditGrant[0].actor_person_id,A.person)
    assert.equal(auditGrant[0].organization_id,organizations[0].id)
    assert.equal(auditGrant[0].target_id,ownerStoreId)
    // Repeating the exact grant cannot create a second event or grant.
    const sameRequest={action:"grant",organization_id:organizations[0].id,
      seller_id:ownerStoreId,membership_id:alphaMember.id}
    const replayGrant=await browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/store-product-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(sameRequest)})
      });return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(replayGrant.status,200)
    assert.equal(replayGrant.body.grant_id,issued.id)
    assert.equal((await q(`select count(*)::int n from da_store_product_permission
      where person_id=$1 and organization_id=$2 and seller_id=$3`,
      [B.person,organizations[0].id,ownerStoreId]))[0].n,1)
    // A Person who is only a MEMBER of Alpha cannot grant products.edit,
    // even if that Person has an unrelated Beta Owner and platform staff role.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const forbiddenGrant=await reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/store-product-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(sameRequest)})
      });return response.status
    })()`)
    assert.equal(forbiddenGrant,403,"Other Organization Owner / platform staff cannot grant Alpha")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('product-grants-panel').hidden")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form');
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)};
      f.elements.namedItem('membership_id').value=${JSON.stringify(alphaMember.id)};
    })()`)
    await browser.click('#product-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select revoked_at from da_store_product_permission where id=$1`,[issued.id])
      return rows.length===1&&!!rows[0].revoked_at
    },19000,"B22 Chrome Owner actual products.edit revocation")
    const revokeAudit=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.store_product_permission_revoked'
        and e.actor_person_id=$1 and e.organization_id=$2 and e.target_id=$3`,
      [A.person,organizations[0].id,ownerStoreId])
    assert.equal(revokeAudit[0].n,1,"Revocation requires canonical outbox")
    process.stdout.write("PASS B22 Chrome: Owner grants active Member scoped products.edit, retry idempotent, foreign Member/staff 403, Owner revokes with PG16 audit/outbox\n")

    // Verify the PR #256 policy boundary with this SAME active protected Owner:
    // actual Chrome/HTTPS endpoints, task-only PG16 rows and audit/outbox.
    const previousPermissionPolicy=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    const policyHttp=async(operations:Array<"list"|"grant"|"revoke">)=>
      browser.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const member=${JSON.stringify(alphaMember.id)}
        const seller=${JSON.stringify(ownerStoreId)}
        const sessionResponse=await fetch('/personal/session')
        const session=await sessionResponse.json()
        const result={session:sessionResponse.status}
        const targets=[
          ['Buyer','/personal/buyer-permissions',{organization_id:org,membership_id:member}],
          ['Product','/personal/store-product-permissions',
            {organization_id:org,membership_id:member,seller_id:seller}]
        ]
        for(const action of ${JSON.stringify(operations)}){
          for(const [kind,path,scope] of targets){
            const response=action==='list'
              ? await fetch(path+'?organization_id='+encodeURIComponent(org))
              : await fetch(path,{method:'POST',
                  headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
                  body:JSON.stringify({...scope,action})})
            result[action+kind]=response.status
            if(action==='list')
              result[kind+'PrivateRows']=Object.hasOwn(await response.json(),'grants')
          }
        }
        return result
      })()`)
    const policyRows=async()=>({
      buyer:await q(`select id,person_id,organization_id,permission,issued_by_person_id,
        source_audit_event_id,revoked_at from da_organization_buyer_permission
        where organization_id=$1 order by id`,[organizations[0].id]),
      product:await q(`select id,person_id,organization_id,seller_id,permission,
        issued_by_person_id,source_audit_event_id,revoked_at
        from da_store_product_permission where organization_id=$1 order by id`,[organizations[0].id]),
      memberships:await q(`select id,person_id,role,status,protected_owner,revoked_at
        from da_organization_membership where organization_id=$1 order by id`,[organizations[0].id]),
      audit:await q(`select id,action,actor_person_id,organization_id,target_id
        from da_audit_event where organization_id=$1 order by id`,[organizations[0].id]),
      outbox:await q(`select x.id,x.source_audit_event_id from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.organization_id=$1 order by x.id`,[organizations[0].id])
    })
    try{
      delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      // Earlier B22 positive tests revoked both grants. Create fresh grants
      // with real CSRF so denial later tests revoking genuinely ACTIVE rows.
      const positive=await policyHttp(["list","grant"])
      for(const name of ["session","listBuyer","listProduct","grantBuyer","grantProduct"])
        assert.equal(positive[name],200,"Protected Owner positive "+name)
      const buyerActive=await q(`select g.id,g.issued_by_person_id,e.id audit_id,x.id outbox_id
        from da_organization_buyer_permission g
        join da_audit_event e on e.id=g.source_audit_event_id
          and e.action='organization.buyer_permission_granted'
          and e.organization_id=g.organization_id
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where g.person_id=$1 and g.organization_id=$2
          and g.permission='buyer.purchase' and g.revoked_at is null`,
        [B.person,organizations[0].id])
      const productActive=await q(`select g.id,g.issued_by_person_id,e.id audit_id,x.id outbox_id
        from da_store_product_permission g
        join da_audit_event e on e.id=g.source_audit_event_id
          and e.action='organization.store_product_permission_granted'
          and e.organization_id=g.organization_id and e.target_id=g.seller_id
        join da_audit_outbox x on x.source_audit_event_id=e.id
        where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
          and g.permission='products.edit' and g.revoked_at is null`,
        [B.person,organizations[0].id,ownerStoreId])
      assert.equal(buyerActive.length,1)
      assert.equal(productActive.length,1)
      assert.equal(buyerActive[0].issued_by_person_id,A.person)
      assert.equal(productActive[0].issued_by_person_id,A.person)
      const beforeDenied=await policyRows()
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit"
      const denied=await policyHttp(["list","grant","revoke"])
      assert.deepEqual(denied,{
        session:200,listBuyer:403,BuyerPrivateRows:false,
        listProduct:403,ProductPrivateRows:false,
        grantBuyer:403,grantProduct:403,revokeBuyer:403,revokeProduct:403
      },"Narrowed but protected Owner must lose both membership actions")
      assert.deepEqual(await policyRows(),beforeDenied,
        "Denied list/grant/revoke must not mutate permissions, membership, audit or outbox")
      delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      const restored=await policyHttp(["list","revoke"])
      for(const name of ["session","listBuyer","listProduct","revokeBuyer","revokeProduct"])
        assert.equal(restored[name],200,"Restored Owner positive "+name)
      assert.equal(restored.BuyerPrivateRows,true)
      assert.equal(restored.ProductPrivateRows,true)
      const endedBuyer=await q(`select revoked_at from da_organization_buyer_permission where id=$1`,
        [buyerActive[0].id])
      const endedProduct=await q(`select revoked_at from da_store_product_permission where id=$1`,
        [productActive[0].id])
      assert.equal(endedBuyer.length,1);assert.ok(endedBuyer[0].revoked_at)
      assert.equal(endedProduct.length,1);assert.ok(endedProduct[0].revoked_at)
      const revokeProof=await q(`select e.action,e.new_values->>'grant_id' grant_id,x.id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.organization_id=$1 and e.actor_person_id=$2
          and e.action in ('organization.buyer_permission_revoked',
                           'organization.store_product_permission_revoked')
          and e.new_values->>'grant_id' in ($3,$4)`,
        [organizations[0].id,A.person,buyerActive[0].id,productActive[0].id])
      assert.equal(revokeProof.length,2,
        "Restored Owner revocations require two canonical audit/outbox records")
      assert.deepEqual((await policyRows()).memberships,beforeDenied.memberships,
        "Protected Owner state must not be changed by permission-policy tests")
      process.stdout.write("PASS B22 Owner member-permission policy: protected Owner real HTTPS grant 200, narrowed list/grant/revoke 403 without private rows or PG16 changes, restored revoke 200 with audit/outbox\n")
    }finally{
      if(previousPermissionPolicy===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=previousPermissionPolicy
    }

    // CR-03: An active role-only "owner" without protected_owner cannot
    // change permissions or Store policy. Only task-owned PG16 rows are
    // temporarily changed; the real protected Alpha Owner stays active.
    const preRole=await q("select role,protected_owner,status from da_organization_membership where id=$1",[alphaMember.id])
    assert.equal(preRole.length,1)
    assert.equal(preRole[0].role,"member")
    assert.equal(preRole[0].protected_owner,false)
    assert.equal(preRole[0].status,"active")
    // Real pending invitation through the installed Medusa/DoğruAdres
    // transaction-aware service. This avoids direct SQL fabrication and
    // never sends an external SMTP message from the test.
    const pendingInvite=await foundation.createOrganizationInvitation({
      organization_id:organizations[0].id,
      actor_person_id:A.person,actor_type:"user",actor_id:A.actor,
      email:"b22-pending-revoke-"+rand+"@example.invalid",role:"member"
    })
    assert.match(pendingInvite.id,/^dainv_[A-Za-z0-9_-]+$/)
    const pendingBefore=await q(`select id,status,revoked_at,expires_at
      from da_organization_invitation
      where id=$1 and organization_id=$2`,
      [pendingInvite.id,organizations[0].id])
    assert.equal(pendingBefore.length,1,"Native invitation must persist")
    assert.equal(pendingBefore[0].status,"pending")
    assert.equal(pendingBefore[0].revoked_at,null)
    assert.ok(new Date(pendingBefore[0].expires_at).getTime()>Date.now(),
      "The target must be a REAL nonexpired pending invitation")
    await q("update da_organization_membership set role='owner',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
    try{
      const roleOnly=await q("select role,protected_owner,status from da_organization_membership where id=$1",[alphaMember.id])
      assert.equal(roleOnly.length,1)
      assert.equal(roleOnly[0].role,"owner")
      assert.equal(roleOnly[0].protected_owner,false)
      assert.equal(roleOnly[0].status,"active")
      const realOwner=await q("select role,protected_owner,status from da_organization_membership where id=$1",[memberships[0].id])
      assert.equal(realOwner.length,1)
      assert.equal(realOwner[0].role,"owner")
      assert.equal(realOwner[0].protected_owner,true)
      const snapshot=async()=> (await q(
        "select (select count(*)::int from da_organization_buyer_permission where organization_id=$1) buyer,"+
        "(select count(*)::int from da_store_product_permission where organization_id=$1) products,"+
        "(select count(*)::int from da_store_buyer_organization_block where owner_organization_id=$1) blocks,"+
        "(select count(*)::int from da_audit_event where organization_id=$1) audits,"+
        "(select count(*)::int from da_audit_outbox x join da_audit_event e on e.id=x.source_audit_event_id where e.organization_id=$1) outboxes",
        [organizations[0].id]))[0]
      const before=await snapshot()
      const beforeManager=await q(`select
        (select count(*)::int from da_organization_invitation where organization_id=$1) invitations,
        (select count(*)::int from da_organization_membership where organization_id=$1) memberships,
        (select status from da_organization_membership where id=$2) as target_status`,
        [organizations[0].id,alphaMember.id])
      assert.equal(beforeManager.length,1)
      const beforeInvitations=await q(`select id,status,revoked_at
        from da_organization_invitation where organization_id=$1 order by id`,
        [organizations[0].id])
      // Fixed, real pending target; never replace it with a missing ID.
      const invitationTarget=pendingInvite.id
      assert.ok(beforeInvitations.some((x:any)=>x.id===invitationTarget &&
        x.status==="pending" && x.revoked_at===null),
        "The exact existing pending invitation must be targeted")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const token=await reviewer.token()
      assert.match(token??"",/^[A-Za-z0-9_-]{43}$/)
      const script="(async()=>{"+
        "const session=await (await fetch('/personal/session')).json();"+
        "const send=async(path,value)=>{const r=await fetch(path,{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify(value)});return r.status};"+
        "const org="+JSON.stringify(organizations[0].id)+";"+
        "const member="+JSON.stringify(alphaMember.id)+";"+
        "const seller="+JSON.stringify(ownerStoreId)+";"+
        "return {buyerList:(await fetch('/personal/buyer-permissions?organization_id='+org)).status,"+
        "productList:(await fetch('/personal/store-product-permissions?organization_id='+org)).status,"+
        "buyerGrant:await send('/personal/buyer-permissions',{action:'grant',organization_id:org,membership_id:member}),"+
        "buyerRevoke:await send('/personal/buyer-permissions',{action:'revoke',organization_id:org,membership_id:member}),"+
        "productGrant:await send('/personal/store-product-permissions',{action:'grant',organization_id:org,seller_id:seller,membership_id:member}),"+
        "productRevoke:await send('/personal/store-product-permissions',{action:'revoke',organization_id:org,seller_id:seller,membership_id:member})"+
        "}})()"
      // Same active but deliberately UNPROTECTED Owner fixture: no native
      // role-only reader or management endpoint may accept its title.
      // Use only this disposable PG16 database, existing authenticated Chrome,
      // and the current server CSRF. Never echo invitation/session secrets.
      const managerDenied=await reviewer.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const membership=${JSON.stringify(alphaMember.id)}
        const invitation=${JSON.stringify(invitationTarget)}
        const session=await(await fetch('/personal/session')).json()
        const post=async(path,value)=>{
          const response=await fetch(path,{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
            body:JSON.stringify(value)})
          return response.status
        }
        return {
          memberships:(await fetch('/personal/memberships?organization='+org)).status,
          invitations:(await fetch('/personal/invitations?organization='+org)).status,
          audit:(await fetch('/personal/audit-timeline?organization='+org)).status,
          stores:(await fetch('/personal/organization-stores?organization='+org)).status,
          createInvite:await post('/personal/invitations',{action:'create',
            organization_id:org,email:'unprotected-owner@example.invalid',role:'member'}),
          revokeMember:await post('/personal/memberships',{action:'revoke',
            organization_id:org,membership_id:membership}),
          changeRole:await post('/personal/memberships',{action:'role',
            organization_id:org,membership_id:membership,role:'admin'}),
          revokeInvite:await post('/personal/invitations',{action:'revoke',
            organization_id:org,invitation_id:invitation})
        }
      })()`)
      for(const [name,status] of Object.entries(managerDenied))
        assert.equal(status,403,"Role-only Owner management/private read denied: "+name)
      assert.deepEqual(await snapshot(),before,
        "Unprotected Owner must not append any domain or audit/outbox writes")
      const afterManager=await q(`select
        (select count(*)::int from da_organization_invitation where organization_id=$1) invitations,
        (select count(*)::int from da_organization_membership where organization_id=$1) memberships,
        (select status from da_organization_membership where id=$2) as target_status`,
        [organizations[0].id,alphaMember.id])
      assert.deepEqual(afterManager,beforeManager,
        "Denied role-only Owner cannot change invitations or membership status")
      // An invitation can be revoked in-place without changing row count.
      // Compare each invitation's status/revocation timestamp as well.
      const afterInvitations=await q(`select id,status,revoked_at
        from da_organization_invitation where organization_id=$1 order by id`,
        [organizations[0].id])
      assert.deepEqual(afterInvitations,beforeInvitations,
        "Role-only Owner must not revoke an invitation or change its state")
      assert.deepEqual(await q(`select id,status,revoked_at,expires_at
        from da_organization_invitation where id=$1 and organization_id=$2`,
        [invitationTarget,organizations[0].id]),pendingBefore,
        "Denied revoke must leave the exact real pending invitation unchanged")
      assert.deepEqual(await snapshot(),before,
        "Denied role-change/invitation-revoke cannot write domain audit/outbox")
      process.stdout.write("PASS B22 protected Owner mutation negatives: role-only Owner HTTP 403 on membership role-change and invitation revoke; membership/invitation states and canonical audit/outbox unchanged\n")
      const denied=await reviewer.eval(script)
      for(const [name,status] of Object.entries(denied))
        assert.equal(status,403,"Role-only Owner denied: "+name)
      // Service-level denial is checked directly: a native Seller edge must
      // not accidentally mask a missing Foundation authorization check.
      for(const action of ["grant","revoke"] as const){
        assert.equal(await foundation.personalChangeBuyerPermission(token,{
          action,organization_id:organizations[0].id,membership_id:alphaMember.id}),null)
        assert.equal(await foundation.personalChangeStoreProductPermission(token,{
          action,organization_id:organizations[0].id,seller_id:ownerStoreId,
          membership_id:alphaMember.id}),null)
      }
      for(const action of ["block","unblock"] as const)
        assert.equal(await foundation.personalChangeStoreBuyerBlock(token,{
          action,organization_id:organizations[0].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[1].id}),null)
      assert.deepEqual(await snapshot(),before,
        "Role-only Owner must not persist permissions, block policy, audit or outboxes")
      process.stdout.write("PASS B22 protected Owner management: active role-only Owner 403 membership/invitation/audit/Store reads, invitation create and membership revoke; no invitations, membership or audit/outbox writes\n")
      process.stdout.write("PASS B22 CR-03 real Chrome/HTTP/PG16: active unprotected Owner 403 for grants and listings; service denies block and revoke, zero audit/outbox writes\n")
    }finally{
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
    }

    // Narrow only the trusted Owner invitation action while retaining the
    // same real pending invitation for restored-policy positive acceptance.
    const policyInvitations=await q(`select id,status,revoked_at,expires_at
      from da_organization_invitation where organization_id=$1 order by id`,
      [organizations[0].id])
    const policyAudits=await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizations[0].id])
    const policyOutboxes=await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizations[0].id])
    const oldInvitationActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit"
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const policyDenied=await browser.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const invite=${JSON.stringify(pendingInvite.id)}
        const session=await(await fetch('/personal/session')).json()
        const post=async(value)=>{
          const r=await fetch('/personal/invitations',{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
            body:JSON.stringify(value)})
          return r.status
        }
        return {
          list:(await fetch('/personal/invitations?organization='+org)).status,
          create:await post({action:'create',organization_id:org,
            email:'role-policy-denied@example.invalid',role:'member'}),
          revoke:await post({action:'revoke',organization_id:org,invitation_id:invite})
        }
      })()`)
      assert.deepEqual(policyDenied,{list:403,create:403,revoke:403},
        "Protected Owner must lose invitation access when role policy narrows")
      await assert.rejects(foundation.createOrganizationInvitation({
        organization_id:organizations[0].id,
        actor_person_id:A.person,actor_type:"user",actor_id:A.actor,
        email:"role-policy-service-denied@example.invalid",role:"member"
      }),/Organization action permission is required/)
      await assert.rejects(foundation.revokeOrganizationInvitation({
        organization_id:organizations[0].id,invitation_id:pendingInvite.id,
        actor_person_id:A.person,actor_type:"user",actor_id:A.actor
      }),/Organization action permission is required/)
      assert.deepEqual(await q(`select id,status,revoked_at,expires_at
        from da_organization_invitation where organization_id=$1 order by id`,
        [organizations[0].id]),policyInvitations,"Denied invitation must not change any state")
      assert.deepEqual(await q(`select id from da_audit_event
        where organization_id=$1 order by id`,[organizations[0].id]),
        policyAudits,"Denied invitation must not append audit")
      assert.deepEqual(await q(`select x.id from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.organization_id=$1 order by x.id`,[organizations[0].id]),
        policyOutboxes,"Denied invitation must not append outbox")
    }finally{
      if(oldInvitationActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=oldInvitationActions
    }
    const policyRestored=await browser.eval(`(async()=>{
      return (await fetch('/personal/invitations?organization='+${JSON.stringify(organizations[0].id)})).status
    })()`)
    assert.equal(policyRestored,200,"Restored policy permits Owner invitation read")
    // Positive authorization for the *same* pending invitation. The real
    // protected Alpha Owner now revokes it through browser HTTPS/CSRF and
    // the existing Medusa workflow. No test-only SQL mutation of the invite.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const authorizedRevoke=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/invitations',{
        method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action:"revoke",organization_id:organizations[0].id,
          invitation_id:pendingInvite.id
        })})
      })
      if(response.status!==200)return {status:response.status}
      const data=await response.json()
      return {status:response.status,id:data.invitation?.id,
        state:data.invitation?.status,revoked:!!data.invitation?.revoked_at}
    })()`)
    assert.deepEqual(authorizedRevoke,{
      status:200,id:pendingInvite.id,state:"revoked",revoked:true
    },"Protected Owner must revoke the same real pending invitation via HTTPS")
    const revokedInvite=await q(`select id,status,revoked_at
      from da_organization_invitation where id=$1 and organization_id=$2`,
      [pendingInvite.id,organizations[0].id])
    assert.equal(revokedInvite.length,1)
    assert.equal(revokedInvite[0].status,"revoked")
    assert.ok(revokedInvite[0].revoked_at)
    const revokeEvents=await q(`select e.action,e.actor_person_id,e.organization_id,
      e.target_id,x.id outbox_id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.organization_id=$1 and e.target_id=$2
        and e.action='organization.invitation_revoked'`,
      [organizations[0].id,pendingInvite.id])
    assert.equal(revokeEvents.length,1,
      "Exactly one canonical invitation revocation audit/outbox is required")
    assert.equal(revokeEvents[0].actor_person_id,A.person)
    assert.equal(revokeEvents[0].organization_id,organizations[0].id)
    assert.equal(revokeEvents[0].target_id,pendingInvite.id)
    process.stdout.write("PASS B22 protected Owner management: real pending invitation HTTP 403 for role-only Owner with no DB/audit mutation; same invitation HTTPS 200 revoked by protected Owner with single audit/outbox\n")
    process.stdout.write("PASS B22 Owner role policy: narrowed invitation.manage denies Owner HTTPS list/create/revoke and Foundation writes with unchanged PG16 invitation/audit/outbox; restored Owner revokes\n")

    // Positive read-back for the SAME scoped endpoints: a genuine protected
    // Alpha Owner and a current ordinary Alpha Admin remain allowed. Use only
    // task-owned memberships; restore temporary Admin role in every outcome.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const protectedReads=await browser.eval(`(async()=>{
      const org=${JSON.stringify(organizations[0].id)}
      return {
        memberships:(await fetch('/personal/memberships?organization='+org)).status,
        invitations:(await fetch('/personal/invitations?organization='+org)).status
      }
    })()`)
    assert.deepEqual(protectedReads,{memberships:200,invitations:200},
      "Real protected Alpha Owner keeps approved membership/invitation read access")
    const listPolicyMembershipBefore=await q(`select id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,[organizations[0].id])
    const listPolicyInvitationsBefore=await q(`select id,status,revoked_at from da_organization_invitation
      where organization_id=$1 order by id`,[organizations[0].id])
    const listPolicyAuditBefore=await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizations[0].id])
    const listPolicyOutboxBefore=await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizations[0].id])
    const previousListPolicy=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    await q("update da_organization_membership set role='admin',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase,products.edit,invitation.manage,membership.manage"
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const deniedList=await browser.eval(`(async()=>{
        const response=await fetch('/personal/memberships?organization='+${JSON.stringify(organizations[0].id)})
        const body=await response.json()
        return {status:response.status,privateRows:Object.hasOwn(body,'memberships')}
      })()`)
      assert.deepEqual(deniedList,{status:403,privateRows:false},
        "Narrowed protected Owner cannot receive private membership rows")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const adminReads=await reviewer.eval(`(async()=>{
        const org=${JSON.stringify(organizations[0].id)}
        const session=await(await fetch('/personal/session')).json()
        const post=async(path,payload)=>{
          const r=await fetch(path,{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
            body:JSON.stringify(payload)})
          return r.status
        }
        const memberships=await fetch('/personal/memberships?organization='+org)
        const invitations=await fetch('/personal/invitations?organization='+org)
        return {
          memberships:memberships.status,
          memberRows:Object.hasOwn(await memberships.json(),'memberships'),
          invitations:invitations.status,
          invitationRows:Object.hasOwn(await invitations.json(),'invitations'),
          roleChange:await post('/personal/memberships',{
            action:'role',organization_id:org,membership_id:${JSON.stringify(alphaMember.id)},role:'member'}),
          inviteCreate:await post('/personal/invitations',{
            action:'create',organization_id:org,email:'admin-role-only@example.invalid',role:'member'})
        }
      })()`)
      assert.deepEqual(adminReads,{
        memberships:403,memberRows:false,invitations:403,invitationRows:false,
        roleChange:403,inviteCreate:403,
      },"Role-only Admin must not read private records or change members/invitations")
    }finally{
      if(previousListPolicy===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=previousListPolicy
      await q("update da_organization_membership set role='member',protected_owner=false,updated_at=clock_timestamp() where id=$1",[alphaMember.id])
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
    }
    process.stdout.write("PASS B22 explicit permission: protected Owner reads 200; role-only Admin private reads, role edit and invitation create 403; no PG16 writes\n")

    const listPolicyRestored=await browser.eval(`(async()=>{
      return (await fetch('/personal/memberships?organization='+${JSON.stringify(organizations[0].id)})).status
    })()`)
    assert.equal(listPolicyRestored,200,"Owner membership.list returns after role policy restoration")
    assert.deepEqual(await q(`select id,status,revoked_at from da_organization_invitation
      where organization_id=$1 order by id`,[organizations[0].id]),
      listPolicyInvitationsBefore,"Admin denial cannot create or revoke invitations")
    assert.deepEqual(await q(`select id,role,status,protected_owner,revoked_at
      from da_organization_membership where organization_id=$1 order by id`,
      [organizations[0].id]),listPolicyMembershipBefore,
      "Denied membership read cannot change membership state")
    assert.deepEqual(await q(`select id from da_audit_event
      where organization_id=$1 order by id`,[organizations[0].id]),
      listPolicyAuditBefore,"Denied read cannot append audit")
    assert.deepEqual(await q(`select x.id from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.organization_id=$1 order by x.id`,[organizations[0].id]),
      listPolicyOutboxBefore,"Denied read cannot append outbox")
    process.stdout.write("PASS B22 Owner role policy: narrowed membership.list denies real Owner HTTPS GET 403 with no private rows or PG16 membership/audit/outbox writes; Admin 403; restored Owner 200\n")

    await verifyNativeOrganizationReadPolicy({
      container,ownerActor:A.actor,memberActor:B.actor,memberPersonId:B.person,
      alphaOrg:organizations[0].id,betaOrg:organizations[1].id,
      foreignOrg:sellerGamma.id,browser,q,
    })
    await verifyOwnerAuditTimelinePolicy({
      organizationId:organizations[0].id,adminMembershipId:alphaMember.id,
      browser,reviewer,q,
    })
    await verifyOwnerMembershipManagePolicy({
      organizationId:organizations[0].id,targetMembershipId:alphaMember.id,
      ownerPersonId:A.person,ownerActorId:A.actor,browser,foundation,q,
    })
    // Protected Owner writes a draft for their approved Store without grant.
    const ownerDraftAccess=await get('/personal/product-drafts?organization_id='+organizations[0].id)
    assert.equal(ownerDraftAccess.status,200)
    assert.ok(ownerDraftAccess.body.stores.some((row:any)=>row.id===ownerStoreId))
    assert.equal((await q("select count(*)::int n from da_store_product_permission where person_id=$1 and organization_id=$2 and seller_id=$3",[A.person,organizations[0].id,ownerStoreId]))[0].n,0)
    const narrowedDraftKey="dapd_"+randomBytes(16).toString("hex")
    const narrowedDraftTitle="B22 denied Owner role product "+rand
    const priorProductOwnerActions=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS="buyer.purchase"
      const deniedRead=await get('/personal/product-drafts?organization_id='+organizations[0].id)
      assert.equal(deniedRead.status,200)
      assert.deepEqual(deniedRead.body.stores,[],
        "With products.edit removed, no Store can be advertised for Owner editing")
      const deniedWrite=await browser.eval(`(async()=>{
        const session=await(await fetch('/personal/session')).json()
        const r=await fetch('/personal/product-drafts',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
          body:JSON.stringify(${JSON.stringify({
            request_id:narrowedDraftKey,organization_id:organizations[0].id,
            seller_id:ownerStoreId,title:narrowedDraftTitle
          })})
        })
        return r.status
      })()`)
      assert.equal(deniedWrite,403,"Narrowed Owner products.edit must deny real HTTP POST")
      assert.equal((await q("select count(*)::int n from da_product_draft_request where id=$1",
        [narrowedDraftKey]))[0].n,0,
        "Denied Owner edit must reserve no product intent")
      assert.equal((await q("select count(*)::int n from product where title=$1",
        [narrowedDraftTitle]))[0].n,0,"Denied Owner edit cannot create native product")
    }finally{
      if(priorProductOwnerActions===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=priorProductOwnerActions
    }
    const restoredOwnerDraft=await get('/personal/product-drafts?organization_id='+organizations[0].id)
    assert.equal(restoredOwnerDraft.status,200)
    assert.ok(restoredOwnerDraft.body.stores.some((row:any)=>row.id===ownerStoreId))
    process.stdout.write("PASS B22 Owner role policy: narrowed products.edit denies real HTTP POST and native PG16 product/intent writes, restored default lists approved Store\n")
    await browser.wait("!document.getElementById('product-draft-panel').hidden")
    const draftTitle="B22 browser product draft "+rand
    await browser.input("#product-draft-form input[name=title]",draftTitle)
    await browser.eval(`document.querySelector('#product-draft-form select[name=seller_id]').value=${JSON.stringify(ownerStoreId)}`)
    await browser.click("#product-draft-form button[type=submit]")
    await until(async()=>{
      const result=await q("select id,status from product where title=$1",[draftTitle])
      return result.length===1&&result[0].status==="draft"
    },19000,"B22 actual personal draft native PG16 persistence")
    await browser.wait("document.getElementById('product-draft-status').textContent.includes('Ürün taslağı kaydedildi')")
    const [written]=await q("select id,status,metadata from product where title=$1",[draftTitle])
    assert.match(written.id,/^prod_[A-Za-z0-9_-]+$/)
    assert.equal(written.status,"draft")
    const requestId=written.metadata?.dogruadres_draft_request_id
    assert.match(requestId,/^dapd_[0-9a-f]{32}$/)
    assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[written.id]))
      .map((row:any)=>row.seller_id),[ownerStoreId])
    const [intent]=await q(`select status,person_id,organization_id,seller_id,product_id,
      completion_audit_event_id from da_product_draft_request where id=$1`,[requestId])
    assert.equal(intent.status,"created")
    assert.equal(intent.person_id,A.person)
    assert.equal(intent.organization_id,organizations[0].id)
    assert.equal(intent.seller_id,ownerStoreId)
    assert.equal(intent.product_id,written.id)
    const audit=await q(`select e.id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.product_draft_created'
        and e.actor_person_id=$2 and e.organization_id=$3 and e.target_id=$4
        and e.new_values->>'request_id'=$5 and e.new_values->>'product_id'=$6`,
      [intent.completion_audit_event_id,A.person,organizations[0].id,ownerStoreId,requestId,written.id])
    assert.equal(audit.length,1,"Real product draft and canonical outbox must correspond")
    const productRequest={request_id:requestId,organization_id:organizations[0].id,
      seller_id:ownerStoreId,title:draftTitle}
    const draftPost=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:response.status,body:await response.json()}
    })()`)
    const replayProduct=await draftPost(productRequest)
    assert.equal(replayProduct.status,200)
    assert.equal(replayProduct.body.product_id,written.id)
    const receiptProduct=await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(requestId))
    assert.equal(receiptProduct.status,200)
    assert.equal(receiptProduct.body.status,"created")
    assert.equal(receiptProduct.body.product_id,written.id)
    // Real CI PG16 "native committed, Foundation outcome lost" fixture:
    // reserve once, run the *actual Mercur* workflow with deterministic ID,
    // intentionally omit the Foundation completion, then recover through
    // the authenticated browser without a second native create.
    const recoveryKey="dapd_"+randomBytes(16).toString("hex")
    const recoveryId="prod_"+recoveryKey.slice(5)
    const recoveryTitle="B22 interrupted native draft "+rand
    const fingerprint=createHash("sha256").update(JSON.stringify([
      organizations[0].id,ownerStoreId,recoveryTitle
    ])).digest("hex")
    await q(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values ($1,$2,$3,$4,$5)`,[recoveryKey,A.person,organizations[0].id,ownerStoreId,fingerprint])
    const {result:recoveredNative}=await createProductsWorkflow(container).run({
      input:{products:[{
        id:recoveryId,title:recoveryTitle,status:"draft",seller_ids:[ownerStoreId],
        metadata:{dogruadres_draft_request_id:recoveryKey}
      }],created_by:ownerStoreId}
    })
    assert.equal(recoveredNative.length,1)
    assert.equal(recoveredNative[0].id,recoveryId,"Installed Mercur must preserve caller ID")
    const recoveryBefore=await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(recoveryKey))
    assert.equal(recoveryBefore.status,200)
    assert.equal(recoveryBefore.body.status,"review_required",
      "Native draft alone must not fabricate Foundation completion")
    const reconcile=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:r.status,body:await r.json()}
    })()`)
    const reconcilePayload={...productRequest,request_id:recoveryKey,
      title:recoveryTitle,action:"reconcile"}
    const recoveredOnce=await reconcile(reconcilePayload)
    assert.equal(recoveredOnce.status,200)
    assert.deepEqual(recoveredOnce.body,{status:"created",product_id:recoveryId})
    const recoveredAgain=await reconcile(reconcilePayload)
    assert.equal(recoveredAgain.status,200)
    assert.deepEqual(recoveredAgain.body,{status:"created",product_id:recoveryId})
    const [recoveredLedger]=await q(`select status,product_id,completion_audit_event_id
      from da_product_draft_request where id=$1`,[recoveryKey])
    assert.equal(recoveredLedger.status,"created")
    assert.equal(recoveredLedger.product_id,recoveryId)
    const nativeCount=await q(`select count(*)::int n from product
      where id=$1 and title=$2 and metadata->>'dogruadres_draft_request_id'=$3`,
      [recoveryId,recoveryTitle,recoveryKey])
    assert.equal(nativeCount[0].n,1,"Reconcile must not create another product")
    assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[recoveryId]))
      .map((x:any)=>x.seller_id),[ownerStoreId])
    const proofCount=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.product_draft_created'
        and e.new_values->>'request_id'=$2 and e.new_values->>'product_id'=$3`,
      [recoveredLedger.completion_audit_event_id,recoveryKey,recoveryId])
    assert.equal(proofCount[0].n,1,"Reconciled outcome needs canonical audit/outbox")
    // A reserved request with no native product must NOT be turned into a
    // false success or trigger a product create on a reconcile-only request.
    const absentKey="dapd_"+randomBytes(16).toString("hex")
    await q(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values($1,$2,$3,$4,$5)`,[absentKey,A.person,organizations[0].id,ownerStoreId,
      createHash("sha256").update(JSON.stringify([organizations[0].id,ownerStoreId,recoveryTitle])).digest("hex")])
    const absent=await reconcile({...reconcilePayload,request_id:absentKey})
    assert.equal(absent.status,200)
    assert.equal(absent.body.status,"review_required")
    assert.equal((await q("select status from da_product_draft_request where id=$1",[absentKey]))[0].status,"reserved")
    assert.equal((await q("select count(*)::int n from product where id=$1",
      ["prod_"+absentKey.slice(5)]))[0].n,0)
    process.stdout.write("PASS B22 native reconciliation confirmed: real Mercur draft already committed, Foundation reserved, authenticated Chrome repair with canonical audit/outbox and zero duplicate products; absent native record stays reserved\\n")
    assert.equal((await draftPost({...productRequest,title:draftTitle+" changed"})).status,403)
    assert.equal((await draftPost({...productRequest,organization_id:organizations[1].id})).status,403)
    assert.equal((await q("select count(*)::int n from product where title=$1",[draftTitle]))[0].n,1)
    assert.equal((await q("select count(*)::int n from da_product_draft_request where id=$1",[requestId]))[0].n,1)
    // A different Alpha Member, even a Beta Owner/platform reviewer, cannot
    // use A's intent or product without the independent products.edit grant.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const memberCannotWrite=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({...productRequest,request_id:"dapd_"+randomBytes(16).toString("hex")})})
      });return response.status
    })()`)
    assert.equal(memberCannotWrite,403)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    assert.equal((await q("select count(*)::int n from da_store_product_permission where person_id=$1 and organization_id=$2 and seller_id=$3 and revoked_at is null",[A.person,organizations[0].id,ownerStoreId]))[0].n,0)
    assert.equal((await draftPost(productRequest)).status,200,
      "Protected Owner's completed draft remains available without an explicit grant")
    assert.equal((await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(requestId))).status,200)
    assert.equal((await q("select count(*)::int n from product where title=$1",[draftTitle]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: protected Owner native draft without self grant, PG16 product_seller/audit/outbox, exact replay no duplicate, conflicting key/foreign Member denied\\n")

    // B22 PG16 negative race: the native INSERT is held while a *different*
    // authenticated protected Owner revokes an ordinary Admin's products.edit.
    // The real Chrome requests and native Mercur workflow run unmocked.
    let racePromoted=false,raceDemoted=false,raceFn=false,raceTrigger=false
    const raceBarrier=new Client({connectionString:u.toString()})
    await raceBarrier.connect()
    let raceBarrierHeld=false
    const raceKey="dapd_"+randomBytes(16).toString("hex")
    const raceProductId="prod_"+raceKey.slice("dapd_".length)
    const raceTitle="B22 native products edit race "+rand
    try{
      await foundation.changeMembership({
        organization_id:organizations[0].id,membership_id:alphaMember.id,
        actor_person_id:A.person,actor_type:"user",actor_id:A.actor,role:"owner"
      })
      racePromoted=true
      await foundation.changeMembership({
        organization_id:organizations[0].id,membership_id:memberships[0].id,
        actor_person_id:A.person,actor_type:"user",actor_id:A.actor,role:"admin"
      })
      raceDemoted=true
      const [roles]=await q("select count(*)::int n from da_organization_membership where organization_id=$1 and protected_owner=true and status='active'",[organizations[0].id])
      assert.equal(roles.n,1)
      const ownerEdit=async(action:"grant"|"revoke")=>{
        const intent={action,organization_id:organizations[0].id,
          seller_id:ownerStoreId,membership_id:memberships[0].id}
        return reviewer.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/personal/store-product-permissions',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify("+JSON.stringify(intent)+")});"+
          "return {status:r.status,body:await r.json()}})()")
      }
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const grant=await ownerEdit("grant")
      assert.equal(grant.status,200)
      const grantRow=await q("select id from da_store_product_permission where person_id=$1 and organization_id=$2 and seller_id=$3 and revoked_at is null",[A.person,organizations[0].id,ownerStoreId])
      assert.equal(grantRow.length,1)
      // Task-owned disposable PG16 only. ID is generated hex, not user input.
      await q("create function b22_native_product_pause_v1() returns trigger language plpgsql as $b22$ begin if NEW.id='"+raceProductId+"' then perform pg_advisory_xact_lock(hashtext('b22-native-draft-pause'),hashtext('"+raceProductId+"')); end if; return NEW; end $b22$")
      raceFn=true
      await q("create trigger b22_native_product_pause_v1 after insert on product for each row execute function b22_native_product_pause_v1()")
      raceTrigger=true
      await raceBarrier.query("BEGIN")
      raceBarrierHeld=true
      const barrierPid=(await raceBarrier.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      await raceBarrier.query("select pg_advisory_xact_lock(hashtext('b22-native-draft-pause'),hashtext($1))",[raceProductId])
      const racePayload={request_id:raceKey,organization_id:organizations[0].id,
        seller_id:ownerStoreId,title:raceTitle}
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      let createDone=false
      const createPending=browser.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/product-drafts',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify(racePayload)+")});"+
        "return {status:r.status,body:await r.json()}})()"
      ).then((result:any)=>{createDone=true;return result},(err:unknown)=>{createDone=true;throw err})
      const waiters=async(pid:number)=>Number((await q(
        "select count(*)::int n from pg_locks h join pg_locks w "+
        "on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid "+
        "and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid "+
        "and w.granted=false where h.pid=$1 and h.locktype='advisory' and h.granted=true",
        [pid]))[0].n)
      await until(async()=>await waiters(barrierPid)===1,19000,
        "B22 native product INSERT waits on task-only PG16 transaction barrier")
      assert.equal(createDone,false)
      assert.equal((await q("select status from da_product_draft_request where id=$1",[raceKey]))[0].status,"reserved")
      let revokeDone=false
      const revokePending=ownerEdit("revoke").then(
        (x:any)=>{revokeDone=true;return x},(e:unknown)=>{revokeDone=true;throw e})
      await until(async()=>{
        const [row]=await q(
          "select count(*)::int n from pg_locks h join pg_locks w "+
          "on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid "+
          "and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid "+
          "and w.granted=false where h.pid<>$1 and h.locktype='advisory' and h.granted=true",
          [barrierPid])
        return row.n>=1
      },19000,"B22 real Owner revoke waits on product creation authorization lock")
      assert.equal(revokeDone,false)
      assert.equal(createDone,false)
      assert.equal((await q("select count(*)::int n from da_store_product_permission where id=$1 and revoked_at is null",[grantRow[0].id]))[0].n,1)
      assert.equal((await q("select count(*)::int n from product where id=$1",[raceProductId]))[0].n,0)
      await raceBarrier.query("ROLLBACK")
      raceBarrierHeld=false
      const created=await createPending,revoked=await revokePending
      assert.ok([201,403].includes(created.status),
        "HTTP may observe revocation after the prior authorized native commit")
      assert.equal(revoked.status,200)
      assert.equal(revoked.body.status,"revoked")
      const [ledger]=await q("select status,product_id,completion_audit_event_id,completed_at from da_product_draft_request where id=$1",[raceKey])
      const [revocation]=await q("select revoked_at from da_store_product_permission where id=$1",[grantRow[0].id])
      assert.equal(ledger.status,"created")
      assert.equal(ledger.product_id,raceProductId)
      assert.ok(revocation.revoked_at)
      assert.ok(new Date(ledger.completed_at).getTime()<new Date(revocation.revoked_at).getTime(),
        "The native and Foundation product completion must precede revoke")
      assert.equal((await q("select count(*)::int n from product where id=$1",[raceProductId]))[0].n,1)
      assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[raceProductId])).map((v:any)=>v.seller_id),[ownerStoreId])
      assert.equal((await q("select count(*)::int n from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id where e.id=$1 and e.action='organization.product_draft_created' and e.actor_person_id=$2 and e.organization_id=$3 and e.new_values->>'request_id'=$4 and e.new_values->>'product_id'=$5",[ledger.completion_audit_event_id,A.person,organizations[0].id,raceKey,raceProductId]))[0].n,1)
      const deniedPayload={...racePayload,request_id:"dapd_"+randomBytes(16).toString("hex"),title:"B22 denied after revoke "+rand}
      const denied=await draftPost(deniedPayload)
      assert.equal(denied.status,403)
      assert.equal((await q("select count(*)::int n from product where title=$1",[deniedPayload.title]))[0].n,0)
      assert.equal((await draftPost(racePayload)).status,403,"Revoke must block replay of the earlier product")
      process.stdout.write("PASS B22 Chrome: real native product INSERT and protected Owner products.edit revoke serialized on PG16; committed product/audit predates revoke; next Member HTTP 403 and zero new product\n")
    }finally{
      if(raceBarrierHeld)await raceBarrier.query("ROLLBACK")
      await raceBarrier.end()
      if(raceTrigger)await q("drop trigger if exists b22_native_product_pause_v1 on product")
      if(raceFn)await q("drop function if exists b22_native_product_pause_v1()")
      if(raceDemoted)await foundation.changeMembership({
        organization_id:organizations[0].id,membership_id:memberships[0].id,
        actor_person_id:B.person,actor_type:"user",actor_id:B.actor,role:"owner"
      })
      if(racePromoted)await foundation.changeMembership({
        organization_id:organizations[0].id,membership_id:alphaMember.id,
        actor_person_id:A.person,actor_type:"user",actor_id:A.actor,role:"member"
      })
      await browser.send("Page.bringToFront")
      await browser.send("Page.reload",{ignoreCache:true})
      await reviewer.send("Page.reload",{ignoreCache:true})
    }


    // B22 protected Owner revoke vs real native Seller creation. Gamma is a
    // separate task-owned Organization; this negative must not revoke A's
    // Alpha purchasing/product permissions used by unrelated assertions.
    const [secondGammaOwner]=await foundation.createMemberships([{
      organization_id:sellerGamma.id,person_id:B.person,
      role:"owner",status:"active",protected_owner:true
    }])
    assert.match(secondGammaOwner.id,/^[A-Za-z0-9_-]+$/)
    const ownerRaceEmail="b22-owner-revoke-race-"+rand+"@example.invalid"
    const ownerRaceName="B22 Owner in-flight Store "+rand
    const ownerRaceRequest={organization_id:sellerGamma.id,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:ownerRaceName,email:ownerRaceEmail,currency_code:"try"}
    const ownerRaceBarrier=new Client({connectionString:u.toString()})
    await ownerRaceBarrier.connect()
    let ownerBarrierHeld=false,ownerPauseFn=false,ownerPauseTrigger=false
    try{
      const [gammaMembershipBeforeRace]=await q(
        "select status,protected_owner from da_organization_membership where id=$1",
        [gammaOwnerMembership.id])
      assert.equal(gammaMembershipBeforeRace.status,"active")
      assert.equal(gammaMembershipBeforeRace.protected_owner,true)
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      // The prior product-race test reloads the Chrome page. Wait for the
      // async Organization list, not merely for the workspace shell.
      await browser.wait(`!document.getElementById('workspace').hidden &&
        Array.from(document.querySelectorAll('#organizations button')).some(
          b=>b.textContent===${JSON.stringify(sellerGamma.name+" — owner")})`)
      await browser.select(sellerGamma.name,"owner")
      await q("create function b22_native_seller_owner_pause_v1() returns trigger language plpgsql as $b22$ begin if NEW.email='"+ownerRaceEmail+"' then perform pg_advisory_xact_lock(hashtext('b22-native-owner-create-pause'),hashtext('"+ownerRaceEmail+"')); end if; return NEW; end $b22$")
      ownerPauseFn=true
      await q("create trigger b22_native_seller_owner_pause_v1 after insert on seller for each row execute function b22_native_seller_owner_pause_v1()")
      ownerPauseTrigger=true
      await ownerRaceBarrier.query("BEGIN")
      ownerBarrierHeld=true
      const ownerBarrierPid=(await ownerRaceBarrier.query("select pg_backend_pid()::int pid")).rows[0].pid as number
      await ownerRaceBarrier.query("select pg_advisory_xact_lock(hashtext('b22-native-owner-create-pause'),hashtext($1))",[ownerRaceEmail])
      let ownerCreateFinished=false
      const ownerCreatePending=browser.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify(ownerRaceRequest)+")});"+
        "return {status:r.status,body:await r.json()}})()"
      ).then((v:any)=>{ownerCreateFinished=true;return v},
        (e:unknown)=>{ownerCreateFinished=true;throw e})
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks h join pg_locks w on w.locktype=h.locktype and w.database=h.database and w.classid=h.classid and w.objid=h.objid and w.objsubid=h.objsubid and w.pid<>h.pid and w.granted=false where h.pid=$1 and h.locktype='advisory' and h.granted=true",[ownerBarrierPid])
        return w.n===1
      },19000,"Actual Mercur Seller INSERT blocked by task-owned PG16 advisory barrier")
      assert.equal(ownerCreateFinished,false)
      assert.equal((await q("select status from da_store_application where id=$1",[ownerRaceRequest.application_id]))[0].status,"creating",
        "Native Store creation must follow an independently COMMITTED idempotency claim")
      assert.equal((await q("select count(*)::int n from seller where email=$1",[ownerRaceEmail]))[0].n,0,
        "Native Seller insertion is uncommitted while its transaction waits")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const ownerRevokeRequest={
        action:"revoke",organization_id:sellerGamma.id,
        membership_id:gammaOwnerMembership.id
      }
      let ownerRevokeFinished=false
      const ownerRevokePending=reviewer.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/memberships',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify(ownerRevokeRequest)+")});"+
        "return {status:r.status,body:await r.json()}})()"
      ).then((v:any)=>{ownerRevokeFinished=true;return v},
        (e:unknown)=>{ownerRevokeFinished=true;throw e})
      await until(async()=>{
        const [w]=await q("select count(*)::int n from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.granted=false and l.locktype in ('transactionid','tuple') and a.datname=current_database() and a.query ilike '%da_organization_membership%'")
        return w.n>=1
      },19000,"Real second protected Owner revocation waits on applicant membership row")
      assert.equal(ownerRevokeFinished,false)
      assert.equal(ownerCreateFinished,false)
      const [stillOwner]=await q("select status,protected_owner from da_organization_membership where id=$1",[gammaOwnerMembership.id])
      assert.equal(stillOwner.status,"active")
      assert.equal(stillOwner.protected_owner,true)
      await ownerRaceBarrier.query("ROLLBACK")
      ownerBarrierHeld=false
      const submitted=await ownerCreatePending
      const revoked=await ownerRevokePending
      assert.equal(submitted.status,201,
        "Native Seller and authoritative Origin must complete before the Owner revoke commits")
      assert.equal(submitted.body.status,"pending_approval")
      assert.match(submitted.body.seller_id,/^sel_[A-Za-z0-9_-]+$/)
      assert.equal(revoked.status,200)
      const [revokedMember]=await q("select status,revoked_at from da_organization_membership where id=$1",[gammaOwnerMembership.id])
      assert.equal(revokedMember.status,"revoked")
      assert.ok(revokedMember.revoked_at)
      const [ownerRaceLedger]=await q("select status,seller_id from da_store_application where id=$1",[ownerRaceRequest.application_id])
      assert.equal(ownerRaceLedger.status,"created")
      assert.equal(ownerRaceLedger.seller_id,submitted.body.seller_id)
      const nativeSeller=await native.listSellers({id:submitted.body.seller_id})
      assert.equal(nativeSeller.length,1)
      assert.equal(nativeSeller[0].status,"pending_approval")
      assert.equal(nativeSeller[0].approved_at,null,
        "Owner submission must never itself approve Store sales")
      assert.equal((await q("select count(*)::int n from seller where email=$1",[ownerRaceEmail]))[0].n,1)
      assert.equal((await q("select count(*)::int n from da_organization_seller_ownership o join da_audit_event e on e.id=o.verification_audit_event_id join da_audit_outbox x on x.source_audit_event_id=e.id where o.organization_id=$1 and o.seller_id=$2 and o.revoked_at is null and e.action='organization.store_application_created' and e.new_values->>'application_id'=$3",[sellerGamma.id,submitted.body.seller_id,ownerRaceRequest.application_id]))[0].n,1,
        "Owner native Seller requires exactly one authoritative Org link and audit/outbox")
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const deniedOwnerStore=await browser.eval("(async()=>{const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/personal/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify("+JSON.stringify({...ownerRaceRequest,
          application_id:"daapp_"+randomBytes(16).toString("hex"),
          email:"b22-owner-post-revoke-"+rand+"@example.invalid"})+")});"+
        "return r.status})()")
      assert.equal(deniedOwnerStore,403)
      assert.equal((await q("select count(*)::int n from seller where email=$1",["b22-owner-post-revoke-"+rand+"@example.invalid"]))[0].n,0)
      assert.equal((await q("select count(*)::int n from da_store_application where person_id=$1 and organization_id=$2 and id<>$3 and created_at >= (select created_at from da_store_application where id=$3)",[A.person,sellerGamma.id,ownerRaceRequest.application_id]))[0].n,0)
      process.stdout.write("PASS B22 Chrome: real Mercur Seller INSERT and Owner membership revoke serialized on PG16; Seller pending plus source audit/outbox before revoke, next Owner Store POST403 and zero Seller\n")
    }finally{
      if(ownerBarrierHeld)await ownerRaceBarrier.query("ROLLBACK")
      await ownerRaceBarrier.end()
      if(ownerPauseTrigger)await q("drop trigger if exists b22_native_seller_owner_pause_v1 on seller")
      if(ownerPauseFn)await q("drop function if exists b22_native_seller_owner_pause_v1()")
      // The revoked Gamma workspace is no longer selectable by A. Do NOT
      // reload it and confuse a denied tenant with a failed global login.
      // Test that the same Personal session still authorizes unrelated Alpha,
      // then select Alpha before the pre-existing browser acceptance cases.
      await browser.send("Page.bringToFront")
      await browser.wait("document.visibilityState==='visible'")
      const stillPersonal=await get("/personal/session")
      assert.equal(stillPersonal.status,200,
        "Gamma Owner revoke must not terminate A's independent Alpha Person session")
      await browser.select(organizations[0].name,"owner")
      // Gamma Owner membership was revoked above. The privacy observer
      // compares the full Organization set against the one loaded at login;
      // its correct fail-closed behavior can conceal a stale workspace at the
      // next 5-second check. Reload ONLY after selecting still-authorized
      // Alpha, so the browser obtains the fresh server-authorized scope.
      // Never disable the observer or keep using a stale Organization view.
      await browser.send("Page.reload",{ignoreCache:true})
      await browser.wait(`(()=>{
        if(document.getElementById('workspace').hidden)return false
        const detail=JSON.parse(document.getElementById('detail').textContent||'{}')
        return detail.id===${JSON.stringify(organizations[0].id)} && detail.role==='owner'
      })()`)
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
    }

    // Native Member context now requires the SAME live legal Organization
    // used by the personal Store list; SellerMember alone is insufficient.
    const storeContext=(org:string,seller:string)=>
      '/personal/contexts?type=member&organization='+encodeURIComponent(org)+
      '&seller='+encodeURIComponent(seller)
    const authorizedContext=await get(storeContext(organizations[0].id,ownerStoreId))
    assert.equal(authorizedContext.status,200,
      "B22 native Member context response category: "+
      (typeof authorizedContext.body?.message==="string"?
        authorizedContext.body.message.slice(0,50):"unavailable"))
    assert.equal(authorizedContext.body.organization_id,organizations[0].id)
    assert.equal(authorizedContext.body.seller.id,ownerStoreId)
    assert.equal((await get(storeContext(organizations[1].id,ownerStoreId))).status,403)
    assert.equal((await get('/personal/contexts?type=member&seller='+ownerStoreId)).status,400)
    const replayApprove=await reviewer.eval(`(async()=>{
      const session=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({application_id:applicationId,seller_id:ownerStoreId})})})
      return response.status
    })()`)
    assert.equal(replayApprove,409,"Native approval must not execute twice")
    // Revoking a staff task immediately denies further platform approval
    // access; an Organization Owner cannot gain this permission implicitly.
    await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",[grantId])
    assert.equal(await reviewer.eval(`(async()=> (await fetch('/personal/platform/stores')).status)()`),403)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    // The visible Seller-context form must send the selected Organization.
    await browser.input('#seller input[name=seller]',ownerStoreId)
    await browser.click('#seller button')
    await browser.wait(`(()=>{try{
      return JSON.parse(document.getElementById('actor-result').textContent).seller.id===
        ${JSON.stringify(ownerStoreId)}
    }catch{return false}})()`)
    const sellerUiContext=await browser.eval("JSON.parse(document.getElementById('actor-result').textContent)")
    assert.equal(sellerUiContext.organization_id,organizations[0].id)
    assert.equal(sellerUiContext.seller.id,ownerStoreId)
    process.stdout.write("PASS B22 Chrome: Seller context UI includes selected Organization and authorized native Seller; missing-Organization HTTP 400 retained\n")
    assert.equal((await get(selected(organizations[0].id))).body.stores[0].id,ownerStoreId)
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(applicationName)})`),true)
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    // Keep the later existing fixture expectations intact: native suspension
    // hides this reviewed Store without altering the Owner→Org link.
    await suspendSellerWorkflow(container).run({input:{seller_id:ownerStoreId,reason:"B22 task-only native suspend"}})
    assert.equal((await get(storeContext(organizations[0].id,ownerStoreId))).status,403)
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.getElementById('org-stores-status').textContent.includes('görüntülenebilir onaylı mağaza bulunmuyor')")
    // ONLY SYNTHETIC isolated fixture records: approved action + matching
    // Organization/Store + canonical source outbox. No production reviewer,
    // document decision, operator grant or actual Store ownership is inferred.
    for(let n=0;n<3;n++){
      const org=organizations[n===2?1:0],event="daaud_b22_ui_"+n+"_"+rand
      await q(`insert into da_audit_event
        (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
        values($1,$2,'user',$3,$4,'organization.store_association_approved',
          'dogruadres-access','store-association',$5,now())`,
        [event,A.person,A.actor,org.id,stores[n].id])
      await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
        values($1,$2,'dogruadres-access','{}'::jsonb)`,["daaob_b22_ui_"+n+"_"+rand,event])
      await q(`insert into da_organization_seller_ownership
        (id,organization_id,seller_id,verification_audit_event_id,verified_at)
        values($1,$2,$3,$4,now())`,
        ["daown_b22_ui_"+n+"_"+rand,org.id,stores[n].id,event])
    }
    // A platform association does not replace the separate native approval.
    const unapprovedAudit="daaud_b22_unapproved_"+rand
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
      values($1,$2,'user',$3,$4,'organization.store_association_approved',
        'dogruadres-access','store-association',$5,now())`,
      [unapprovedAudit,A.person,A.actor,organizations[0].id,unapprovedStore.id])
    await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
      values($1,$2,'dogruadres-access','{}'::jsonb)`,
      ["daaob_b22_unapproved_"+rand,unapprovedAudit])
    await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values($1,$2,$3,$4,now())`,
      ["daown_b22_unapproved_"+rand,organizations[0].id,unapprovedStore.id,unapprovedAudit])
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    const alpha=await get(selected(organizations[0].id))
    assert.equal(alpha.status,200)
    assert.deepEqual(alpha.body.stores.map((s:any)=>s.id).sort(),stores.slice(0,2).map(s=>s.id).sort())
    assert.equal(alpha.body.stores.some((store:any)=>store.id===unapprovedStore.id),false,
      "Unapproved Seller must stay hidden even with platform association and Member link")
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(unapprovedStore.name)})`),false)
    // Native Store suspension must independently remove ONLY its own Store
    // without revoking Person, Organization membership or platform association.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:stores[0].id,reason:"B22 task-only suspension negative"
    }})
    const suspended=await native.listSellers({id:stores[0].id})
    assert.equal(suspended.length,1)
    assert.equal(suspended[0].status,"suspended")
    assert.ok(suspended[0].approved_at,"Suspension must retain historical native approval")
    const alphaSuspended=await get(selected(organizations[0].id))
    assert.equal(alphaSuspended.status,200)
    assert.deepEqual(alphaSuspended.body.stores.map((x:any)=>x.id),[stores[1].id])
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores.map((x:any)=>x.id),[stores[2].id],
      "Independent Organization Store visibility must survive Alpha suspension")
    // A native Store suspend can trigger the privacy observer while the
    // Organization choice list is reloading. Wait for the SAME authorized
    // Owner button; do not fabricate a selection or relax the later denial.
    await browser.wait(`Array.from(document.querySelectorAll('#organizations button')).some(
      b=>b.textContent===${JSON.stringify(organizations[0].name+" — owner")})`)
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(stores[0].name)})`),false)
    await unsuspendSellerWorkflow(container).run({input:{seller_id:stores[0].id}})
    const reopened=await native.listSellers({id:stores[0].id})
    assert.equal(reopened.length,1);assert.equal(reopened[0].status,"open")
    assert.ok(reopened[0].approved_at)
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores.map((x:any)=>x.id).sort(),
      stores.slice(0,2).map(x=>x.id).sort())
    await browser.select(organizations[1].name,"admin")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    const beta=await get(selected(organizations[1].id))
    assert.equal(beta.status,200);assert.deepEqual(beta.body.stores.map((s:any)=>s.id),[stores[2].id])
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(stores[0].name)})`),false)
    assert.equal((await get(selected(organizations[2].id))).status,403)
    assert.equal((await get(selected(organizations[1].id),{"x-seller-id":stores[0].id})).status,400)
    // Revoke the platform association without disturbing protected owner.
    await q("update da_organization_seller_ownership set revoked_at=now() where seller_id=$1",[stores[2].id])
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    await native.updateMembers([{id:member.id,is_active:false}])
    assert.equal((await get(selected(organizations[0].id))).status,403)
    await native.updateMembers([{id:member.id,is_active:true}])
    // An authorized protected Owner revokes only A's unprotected Admin
    // membership in Beta via the supported Foundation service. Native
    // SellerMember and Person's active session remain intact.
    const revoked=await foundation.changeMembership({
      organization_id:organizations[1].id,membership_id:betaAdminMembership.id,
      actor_person_id:B.person,actor_type:"user",actor_id:B.actor,status:"revoked",
    })
    assert.equal(revoked.status,"revoked")
    assert.equal((await get(selected(organizations[1].id))).status,403,
      "Revoked Organization Admin cannot retain Store access")
    assert.equal((await q("select status from da_organization_membership where id=$1",
      [betaAdminMembership.id]))[0].status,"revoked")
    assert.equal((await get(selected(organizations[0].id))).status,200,
      "Unrelated active Organization must survive Beta revocation")
    // No actor-native JWT or personal details should reach the page.
    const privateView=await browser.eval("({jwt:/eyJ[A-Za-z0-9_-]+\\.eyJ/.test(document.body.innerText),local:Object.keys(localStorage),session:Object.keys(sessionStorage)})")
    assert.equal(privateView.jwt,false);assert.deepEqual(privateView.local,[]);assert.deepEqual(privateView.session,[])
    // Organization membership revocation may make the privacy observer hide
    // the old workspace immediately. Do NOT fake visible state, disable the
    // observer, or assume that a stale Owner button must remain clickable.
    // Both supported user actions share the exact same CSRF-protected lock.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const ownerButton=await browser.eval(`Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent===${JSON.stringify(organizations[0].name+" — owner")})`)
    let clickedLock=false
    if(ownerButton){
      // The visible UI path is preferred, but the privacy observer may
      // conceal it BETWEEN the Owner selection and actual button click.
      await browser.select(organizations[0].name,"owner")
      // A real privacy observer may clear the panel after membership revoke.
      // Accept concealment ONLY when the entire workspace is genuinely
      // hidden. Otherwise insist on the correct Organization and both stores.
      await browser.wait(`(()=>{
        if(document.getElementById('workspace').hidden)return true
        const detail=JSON.parse(document.getElementById('detail').textContent||'{}')
        return detail.id===${JSON.stringify(organizations[0].id)}
          &&document.querySelectorAll('#org-stores p').length===2
      })()`)
      assert.equal((await get(selected(organizations[0].id))).status,200)
      if(!(await browser.eval("document.getElementById('workspace').hidden"))){
        assert.equal(await browser.eval(`JSON.parse(document.getElementById('detail').textContent||'{}').id===${JSON.stringify(organizations[0].id)}&&document.querySelectorAll('#org-stores p').length===2`),true,
          "Visible workspace must show both authorized Owner stores")
      }
      const visible=await browser.eval(`(()=>{
        const button=document.getElementById('session-lock')
        return button&&!button.hidden&&!button.disabled&&
          !document.getElementById('workspace').hidden&&
          document.visibilityState==='visible'
      })()`)
      if(visible){
        try{
          await browser.click("#session-lock")
          clickedLock=true
        }catch(error){
          // Only a genuinely concealed page may take the existing real
          // HTTP/CSRF lock route. Never ignore an ordinary failed click.
          const concealed=await browser.eval(`(()=>{
            const button=document.getElementById('session-lock')
            return !button||button.hidden||button.disabled||
              document.getElementById('workspace').hidden
          })()`)
          if(!concealed)throw error
        }
      }
    }
    if(clickedLock){
      await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
      await browser.wait("document.getElementById('status').textContent.includes('Oturum kilitlendi')")
    }else{
      // A genuinely concealed page cannot click a hidden button. Use the
      // same real public session-lock contract with the authenticated browser,
      // the current session's anti-CSRF proof and actual server transaction.
      const lock=await browser.eval(`(async()=>{
        const response=await fetch('/personal/session')
        if(response.status!==200)return {session_status:response.status,lock_status:null}
        const session=await response.json()
        const outcome=await fetch('/personal/session?action=lock',{
          method:'DELETE',headers:{'x-csrf-token':session.csrf_token}
        })
        return {session_status:response.status,lock_status:outcome.status}
      })()`)
      assert.equal(lock.session_status,200,"Private UI conceal is not a logout bypass")
      assert.equal(lock.lock_status,200,"Real same-origin CSRF-protected lock must succeed")
      await browser.send("Page.reload",{ignoreCache:true})
      await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
      process.stdout.write("PASS B22 Chrome: observer concealed stale Organization UI; same session explicitly locked over CSRF-protected HTTP and fresh Chrome reload\\n")
    }
    // The cookie is no longer set in Chrome. Probe the OLD exact opaque
    // credential explicitly over task-owned HTTPS to rule out UI-only hiding.
    const denied=await new Promise<number>((resolve,reject)=>{
      const req=tlsRequest(host+selected(organizations[0].id),{
        method:"GET",ca:readFileSync(crt),headers:{cookie:"da_session="+cookie}
      },res=>{res.resume();res.on("end",()=>resolve(res.statusCode??0))})
      req.on("error",reject);req.setTimeout(10000,()=>req.destroy(Error("B22 locked replay timeout")));req.end()
    })
    assert.ok([401,403].includes(denied),"Locked session's old cookie must never read Store data")
    const sessionHash=createHash("sha256").update(cookie).digest("hex")
    const locked=await q("select status from da_browser_session where id=$1",[sessionHash])
    assert.equal(locked.length,1)
    assert.equal(locked[0].status,"revoked","Real PG16 confirms session lock")
    const hidden=await browser.eval("({store:document.getElementById('org-stores').textContent,selection:document.getElementById('detail').textContent,local:Object.keys(localStorage),session:Object.keys(sessionStorage)})")
    assert.equal(hidden.store,"");assert.equal(hidden.selection,"")
    assert.deepEqual(hidden.local,[]);assert.deepEqual(hidden.session,[])
    process.stdout.write("PASS B22 Chrome: native pending Seller on page 2 approved, newer Owner Store separately approved, 30 older non-native records fail closed\n")
    process.stdout.write("PASS B22 Chrome: two Person browsers, platform staff-approved native Seller, Owner sees only approved Store; revoked staff denied\n")
    process.stdout.write("PASS B22 Chrome: Owner Store application creates pending native Seller and direct Organization link, replay deduped and foreign Organization denied\n")
    process.stdout.write("PASS B22 Chrome: native suspension hides only affected Store; unrelated Organization unaffected; approved Store reopens through native workflow\n")
    process.stdout.write("PASS B22 Chrome: native OPEN Seller with no approved_at remains hidden despite platform association and Member link\n")
    process.stdout.write("PASS B22 Chrome: locked personal session clears Store UI, old opaque cookie rejected and PG16 session revoked\n")
    process.stdout.write("PASS B22 Chrome: real MFA and dual-proof Member link with two Organization scopes; approved synthetic Store fixtures read and revoked access denied\n")
    // B-01: real native MFA recovery versus a failed Foundation outbox.
    // Only isolated random disposable B22 CI PG16; no real user or prod path.
    const recoveryIdentity=await q(
      "select auth_identity_id from da_login_binding where person_id=$1 and actor_type='user' and revoked_at is null",
      [B.person])
    assert.equal(recoveryIdentity.length,1)
    const enabledFactors=await auth.listAuthMfa(
      {auth_identity_id:recoveryIdentity[0].auth_identity_id,status:"enabled"},{take:2})
    assert.equal(enabledFactors.length,1,"B22 Person B must have one live TOTP factor")
    const nativeRecoveryPost=async()=>reviewer.eval(
      "(async()=>{const sr=await fetch('/personal/session');"+
      "if(sr.status!==200)return {status:sr.status,body:{}};"+
      "const session=await sr.json();"+
      "const response=await fetch('/personal/mfa/manage',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'recovery_codes'})});"+
      "return {status:response.status,body:await response.json()}})()")
    const recoveryAuditCount=async()=>Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.recovery_codes_generated'",
      [B.person]))[0].n)
    const recoveryOutboxCount=async()=>Number((await q(
      "select count(*)::int n from da_security_outbox x join da_audit_event e on e.id=x.audit_event_id where e.actor_person_id=$1 and e.action='mfa.recovery_codes_generated'",
      [B.person]))[0].n)
    const beforeRecovery=await recoveryAuditCount()
    assert.equal(await recoveryOutboxCount(),beforeRecovery)
    const positiveRecovery=await nativeRecoveryPost()
    assert.equal(positiveRecovery.status,200,"Actual Medusa recovery generation must succeed")
    assert.equal(positiveRecovery.body.sessions_revoked,false)
    assert.equal(positiveRecovery.body.recovery_codes?.length,10)
    assert.equal(new Set(positiveRecovery.body.recovery_codes).size,10)
    assert.equal(await recoveryAuditCount(),beforeRecovery+1)
    assert.equal(await recoveryOutboxCount(),beforeRecovery+1)
    // Test-only PG DDL forces only the MFA recovery audit outbox insert to fail.
    // Real native Auth operation runs first in its own module transaction.
    await q("create function b22_mfa_outbox_fault_v1() returns trigger language plpgsql as $b22$ begin if exists(select 1 from da_audit_event e where e.id=NEW.audit_event_id and e.action='mfa.recovery_codes_generated') then raise exception 'B22 forced recovery outbox failure'; end if; return NEW; end $b22$")
    let installedRecoveryFault=false
    try{
      await q("create trigger b22_mfa_outbox_fault_v1 before insert on da_security_outbox for each row execute function b22_mfa_outbox_fault_v1()")
      installedRecoveryFault=true
      const uncertainRecovery=await nativeRecoveryPost()
      assert.equal(uncertainRecovery.status,503,
        "No HTTP success when the native operation precedes a failed Foundation audit")
      assert.match(uncertainRecovery.body?.message??"",/INDETERMINATE/)
      assert.equal(Object.prototype.hasOwnProperty.call(uncertainRecovery.body,"recovery_codes"),false)
      assert.equal(await recoveryAuditCount(),beforeRecovery+1,
        "Audit write must roll back when its security outbox insert fails")
      assert.equal(await recoveryOutboxCount(),beforeRecovery+1)
      assert.equal(await reviewer.eval(
        "(async()=> (await fetch('/personal/session')).status)()"),200,
        "Recovery generation is not factor disable; full session remains valid")
      process.stdout.write("PASS B-01 native MFA recovery: real Medusa success writes Foundation audit/outbox; forced post-native outbox failure returns INDETERMINATE 503, no code disclosure or false audit\n")
    }finally{
      if(installedRecoveryFault)
        await q("drop trigger b22_mfa_outbox_fault_v1 on da_security_outbox")
      await q("drop function b22_mfa_outbox_fault_v1()")
    }

    // B-01 MFA disable: use only an existing B22 CI synthetic browser and PG16.
    // Supported platform policy and recovery-code HTTP flows create a real
    // current full session; no direct synthetic epoch/version manipulation.
    const freshDisableCodes=await nativeRecoveryPost()
    assert.equal(freshDisableCodes.status,200,
      "Real recovery API must refresh B's codes after the earlier fault")
    assert.equal(freshDisableCodes.body.recovery_codes?.length,10)
    const disableCodes=freshDisableCodes.body.recovery_codes as string[]
    const reloginWithRecovery=async(code:string)=>{
      // Lock a still-active old browser session via the real CSRF route, if any.
      const lock=await reviewer.eval("(async()=>{"+
        "const session=await fetch('/personal/session');"+
        "if(session.status!==200)return session.status;"+
        "const value=await session.json();"+
        "const response=await fetch('/personal/session?action=lock',{method:'DELETE',"+
        "headers:{'x-csrf-token':value.csrf_token}});return response.status})()")
      assert.ok([200,401,403].includes(lock),"Only actual expired or explicitly locked prior session")
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.getElementById('login').hidden===false")
      await reviewer.input("#login input[name=email]",B.email)
      await reviewer.input("#login input[name=password]",B.password)
      await reviewer.click("#login button")
      await reviewer.wait("document.getElementById('challenge').hidden===false")
      assert.equal(await reviewer.eval("(()=>{const select=document.querySelector('#challenge select[name=method]');select.value='recovery_code';select.dispatchEvent(new Event('change',{bubbles:true}));return select.value})()"),"recovery_code")
      await reviewer.input("#challenge input[name=code]",code)
      await reviewer.click("#challenge button")
      await reviewer.wait("document.getElementById('workspace').hidden===false")
      assert.equal(await reviewer.eval("(async()=> (await fetch('/personal/session')).status)()"),200)
    }
    // Reauthenticate just before the true platform-mode transition to
    // avoid claiming an old stale strong-proof as current authority.
    await reloginWithRecovery(disableCodes[0])
    const [existingMfaPolicy]=await q(
      "select version,platform_mode from da_mfa_policy where id='current'")
    assert.ok(!existingMfaPolicy||existingMfaPolicy.platform_mode==="required",
      "B22 default policy must not silently change before this probe")
    const staffMfaId="da_staff_mfa_"+rand
    await q("insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason) values($1,$2,'security.mfa.manage','platform',$2,'B22 disposable native MFA policy fixture')",[staffMfaId,B.person])
    const policyVersion=Number(existingMfaPolicy?.version??0)
    const policyResponse=await reviewer.eval(
      "(async()=>{const sr=await fetch('/personal/session');"+
      "if(sr.status!==200)return {status:sr.status};"+
      "const session=await sr.json();"+
      "const response=await fetch('/personal/mfa',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'platform',platform_mode:'optional',expected_version:"+policyVersion+"})});"+
      "return {status:response.status}})()")
    assert.equal(policyResponse.status,200,
      "Real task-only staff grant + authenticated MFA mode transition required")
    const [optionalPolicy]=await q(
      "select version,platform_mode from da_mfa_policy where id='current'")
    assert.equal(optionalPolicy.platform_mode,"optional")
    assert.equal(Number(optionalPolicy.version),policyVersion+1)
    // A changed platform MFA revision must invalidate the previous session.
    assert.equal(await reviewer.eval(
      "(async()=> (await fetch('/personal/session')).status)()"),401)
    await reloginWithRecovery(disableCodes[1])
    let preDisableCookie=await reviewer.token()
    assert.match(preDisableCookie??"",/^[A-Za-z0-9_-]{43}$/)
    const disableBeforeAudit=Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.native_factor_disabled'",
      [B.person]))[0].n)
    // B-01 double fault: BOTH the native-disable and all-session-revocation
    // outbox writes are rejected by a test-only PG16 trigger. A secure flow
    // must abort BEFORE mutating the actual native MFA factor.
    let epochBeforeDisable=Number((await q(
      "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch)
    const countLogoutAudit=async()=>Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='session.all_revoked'",[B.person]))[0].n)
    const countLogoutOutbox=async()=>Number((await q(
      "select count(*)::int n from da_security_outbox x join da_audit_event e on e.id=x.audit_event_id where e.actor_person_id=$1 and e.action='session.all_revoked'",[B.person]))[0].n)
    let logoutAuditBefore=await countLogoutAudit()
    let logoutOutboxBefore=await countLogoutOutbox()
    assert.equal(logoutAuditBefore,logoutOutboxBefore)
    const oldCookieStatus=async()=>new Promise<number>((resolve,reject)=>{
      const request=tlsRequest(host+"/personal/session",{
        method:"GET",ca:readFileSync(crt),
        headers:{cookie:"da_session="+preDisableCookie}
      },response=>{response.resume();response.on("end",()=>resolve(response.statusCode??0))})
      request.on("error",reject)
      request.setTimeout(10000,()=>request.destroy(Error("MFA disable old cookie timed out")))
      request.end()
    })
    assert.equal(await oldCookieStatus(),200)
    const enabledFactorList=async()=>auth.listAuthMfa(
      {auth_identity_id:recoveryIdentity[0].auth_identity_id,status:"enabled"},{take:2})
    const nativeDisablePost=async()=>reviewer.eval(
      "(async()=>{const sr=await fetch('/personal/session');"+
      "if(sr.status!==200)return {status:sr.status,body:{}};"+
      "const session=await sr.json();"+
      "const response=await fetch('/personal/mfa/manage',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'disable',method:'recovery_code',code:"+JSON.stringify(disableCodes[2])+"})});"+
      "return {status:response.status,body:await response.json()}})()")
    let disableFunctionInstalled=false,disableTriggerInstalled=false
    try{
      await q("create function b22_mfa_disable_outbox_fault_v1() returns trigger language plpgsql as $b22$ begin if exists(select 1 from da_audit_event e where e.id=NEW.audit_event_id and e.action in ('mfa.native_factor_disabled','session.all_revoked')) then raise exception 'B22 forced MFA disable and revocation outbox failures'; end if; return NEW; end $b22$")
      disableFunctionInstalled=true
      await q("create trigger b22_mfa_disable_outbox_fault_v1 before insert on da_security_outbox for each row execute function b22_mfa_disable_outbox_fault_v1()")
      disableTriggerInstalled=true
      const denied=await nativeDisablePost()
      assert.equal(denied.status,503,
        "Broken Foundation precommit must not allow the native factor operation")
      assert.equal(denied.body?.message,"Service unavailable",
        "Native MFA was never attempted, so this is not a native INDETERMINATE outcome")
      assert.equal((await enabledFactorList()).length,1,
        "The original native factor MUST remain enabled after both outbox failures")
      assert.equal(await oldCookieStatus(),200,
        "Precommit failure preserves only the original MFA-protected session")
      assert.equal(await reviewer.eval(
        "(async()=> (await fetch('/personal/session')).status)()"),200)
      assert.equal(Number((await q(
        "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch),epochBeforeDisable)
      assert.equal(await countLogoutAudit(),logoutAuditBefore)
      assert.equal(await countLogoutOutbox(),logoutOutboxBefore)
      assert.equal(Number((await q(
        "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.native_factor_disabled'",
        [B.person]))[0].n),disableBeforeAudit)
      process.stdout.write("PASS B-01 MFA double-outbox failure: no native disable, original TOTP/session intact, no partial Foundation audit or epoch change\n")
      // Second boundary: a successful precommit, true Medusa native disable,
      // then a failing COMPLETION audit. Revocation must remain committed.
      await q("drop trigger b22_mfa_disable_outbox_fault_v1 on da_security_outbox")
      disableTriggerInstalled=false
      await q("drop function b22_mfa_disable_outbox_fault_v1()")
      disableFunctionInstalled=false
      // B-01 real policy race: an authorized independent A staff login sets
      // platform MFA to REQUIRED only AFTER B's audited revoke precommit,
      // while B's original HTTPS disable request is still in flight.
      // No direct database policy update or mocked native MFA response.
      const [staffAIdentity]=await q(
        "select auth_identity_id from da_login_binding where person_id=$1 and actor_type='user' and revoked_at is null",
        [A.person])
      assert.ok(staffAIdentity?.auth_identity_id)
      const {codes:staffCodes}=await auth.generateAuthMfaRecoveryCodes({
        auth_identity_id:staffAIdentity.auth_identity_id,count:10})
      assert.equal(staffCodes?.length,10)
      const staffGrantId="da_staff_mfa_race_"+rand
      await q("insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason) values($1,$2,'security.mfa.manage','platform',$2,'B22 disposable independent MFA policy race actor')",
        [staffGrantId,A.person])
      const loginStaffA=async(recoveryCode:string)=>{
        // These are repeated independent strong logins in a single real CI
        // suite. Respect the SERVER's existing per-minute 10/60 abuse caps:
        // never bypass, reset or directly write their persisted counters.
        const subject="subject:"+createHash("sha256").update(A.email.toLowerCase()).digest("hex")
        await until(async()=>{
          const [budget]=await q(
            "select coalesce((select attempts from da_login_attempt where bucket=$1 and minute=floor(extract(epoch from clock_timestamp())/60)),0)::int subject_attempts, coalesce((select max(attempts) from da_login_attempt where bucket like 'address:%' and minute=floor(extract(epoch from clock_timestamp())/60)),0)::int address_attempts",
            [subject])
          if(Number(budget.subject_attempts)>=9||Number(budget.address_attempts)>=58){
            await new Promise<void>(resolve=>setTimeout(resolve,900))
            return false
          }
          return true
        },70000,"B22 task-only Staff A genuine login rate window")
        // load() intentionally conceals personal data in a hidden tab.
        // Native Staff recovery login is a *visible* Chrome user journey,
        // independent of the earlier Gamma Owner revocation browser focus.
        await browser.send("Page.bringToFront")
        await browser.wait("document.visibilityState==='visible'")
        await browser.send("Page.reload",{ignoreCache:true})
        // Page.reload may return before the inline submit handler is installed.
        // A native HTML submit could otherwise bypass the intended POST/CDP
        // observation (and disclose credentials in URL query parameters).
        await browser.wait(`document.readyState==='complete' &&
          document.getElementById('login').hidden===false &&
          typeof document.getElementById('login').onsubmit==='function' &&
          document.querySelector('#login button').disabled===false`)
        // Repeated same-profile logins must not append to browser-restored
        // form values. This is the browser's ordinary "clear form" action.
        await browser.eval("document.getElementById('login').reset()")
        await browser.input("#login input[name=email]",A.email)
        await browser.input("#login input[name=password]",A.password)
        const beforeLogin=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/session").length
        await browser.click("#login button")
        try{
          await until(async()=>browser.http.filter((row:any)=>
            row.method==="POST"&&row.path==="/personal/session").length>beforeLogin,
            10000,"Real Staff A /personal/session HTTP result")
        }catch{
          // Status-only investigation: never publish input values, tokens,
          // cookies, recovery codes, bodies, origins or full request URLs.
          const dom=await browser.eval(`(()=>{
            const form=document.getElementById('login')
            return {ready:document.readyState,visible:!form.hidden,
              bound:typeof form.onsubmit==='function',
              valid:form.checkValidity(),
              disabled:form.querySelector('button').disabled,
              pageVisible:document.visibilityState==='visible'}
          })()`)
          const recent=browser.http.filter((row:any)=>
            ["/personal/session","/personal/challenge"].includes(row.path))
            .slice(-5).map((row:any)=>({method:row.method,path:row.path,status:row.status}))
          throw Error("B22 Staff A login response not observed: "+JSON.stringify({dom,recent}))
        }
        const loginResponse=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/session").at(-1)
        assert.equal(loginResponse?.status,202,
          "Real strong-MFA challenge must begin with HTTP 202, not throttled or bypassed")
        await browser.wait("document.getElementById('challenge').hidden===false")
        assert.equal(await browser.eval("(()=>{const s=document.querySelector('#challenge select[name=method]');s.value='recovery_code';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()"),"recovery_code")
        await browser.input("#challenge input[name=code]",recoveryCode)
        const recoveryHttpBefore=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/challenge").length
        await browser.click("#challenge button")
        // Distinguish actual native recovery rejection from subsequent UI
        // rendering/session failures. Never log or return a recovery code.
        await until(async()=>browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/challenge").length>recoveryHttpBefore,
          10000,"B22 Staff A native recovery POST settled")
        const recoveryHttp=browser.http.filter((row:any)=>
          row.method==="POST"&&row.path==="/personal/challenge").at(-1)
        assert.equal(recoveryHttp?.status,200,
          "B22 Staff A native MFA recovery HTTP must succeed before showing workspace")
        try{
          await browser.wait("document.getElementById('workspace').hidden===false")
        }catch{
          // Safe diagnosis: HTTP statuses and visibility ONLY. No Person
          // identifier, cookie, password, recovery code, or response body.
          const safe=browser.http.filter((row:any)=>
            ["/personal/challenge","/personal/session","/personal/organizations"]
              .includes(row.path)).slice(-8).map((row:any)=>
                ({method:row.method,path:row.path,status:row.status}))
          const visibility=await browser.eval("document.visibilityState")
          throw new Error("B22 Staff A post-recovery UI did not open: "+
            JSON.stringify({visibility,http:safe}))
        }
        assert.equal(await browser.eval("(async()=> (await fetch('/personal/session')).status)()"),200)
      }
      const staffSetPlatform=async(mode:"required"|"optional",version:number)=>browser.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/mfa',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'platform',platform_mode:"+JSON.stringify(mode)+
        ",expected_version:"+version+"})});return {status:r.status}})()")
      await loginStaffA(staffCodes[0])
      const foundationPrototype=Object.getPrototypeOf(foundation)
      const originalPrepare=foundationPrototype.personalPrepareNativeMfaDisable
      let reachedPrecommit=false,gateReleased=false
      let releasePrecommit!:()=>void
      const precommitGate=new Promise<void>(resolve=>{releasePrecommit=()=>{gateReleased=true;resolve()}})
      foundationPrototype.personalPrepareNativeMfaDisable=async function(this:any,...args:any[]){
        const prepared=await originalPrepare.apply(this,args)
        if(prepared?.person_id===B.person){
          reachedPrecommit=true
          await precommitGate
        }
        return prepared
      }
      let inFlightPolicyRace:Promise<any>|undefined
      try{
        inFlightPolicyRace=nativeDisablePost()
        await until(async()=>reachedPrecommit,10000,
          "MFA platform policy switch after B's committed session revoke")
        assert.equal(await oldCookieStatus(),401,
          "B session revocation must commit before policy writer changes required mode")
        const [beforeRequired]=await q("select version,platform_mode from da_mfa_policy where id='current'")
        assert.equal(beforeRequired.platform_mode,"optional")
        const toRequired=await staffSetPlatform("required",Number(beforeRequired.version))
        assert.equal(toRequired.status,200,
          "Real independently authenticated Staff A must commit required policy via HTTP")
        const [requiredPolicy]=await q("select version,platform_mode from da_mfa_policy where id='current'")
        assert.equal(requiredPolicy.platform_mode,"required")
        releasePrecommit()
        const raced=await inFlightPolicyRace
        assert.equal(raced.status,409,
          "Required policy committed before native completion must block factor disable")
        assert.equal((await enabledFactorList()).length,1,
          "Verified native Medusa TOTP must remain enabled under newly required MFA")
        assert.equal(await oldCookieStatus(),401)
        process.stdout.write("PASS B-01 MFA policy race: separate Staff A HTTP required transition committed between B precommit and native operation; native factor remained enabled, old B session denied\n")
      }finally{
        if(!gateReleased)releasePrecommit()
        foundationPrototype.personalPrepareNativeMfaDisable=originalPrepare
        if(inFlightPolicyRace)await inFlightPolicyRace.catch(()=>{})
      }
      // Restore optional only through the same real MFA challenge + authorized
      // platform staff API. This permits the pre-existing post-native fault
      // regression to run with a fresh B session and its original invariants.
      await loginStaffA(staffCodes[1])
      const [requiredPolicy]=await q("select version,platform_mode from da_mfa_policy where id='current'")
      assert.equal(requiredPolicy.platform_mode,"required")
      assert.equal((await staffSetPlatform("optional",Number(requiredPolicy.version))).status,200)
      await reloginWithRecovery(disableCodes[3])
      // B-01: a second genuinely independent Chrome profile completes a NEW
      // native MFA login after the first Person-wide revocation commits, but
      // before native factor disable begins. A secure implementation refuses
      // the disable (409) rather than leaving that session trusted after the
      // native factor disappears. Existing audit/epoch and native factor stay.
      const newSessionBrowser=new B06Chrome(host,"B")
      browsers.push(newSessionBrowser)
      await newSessionBrowser.start(crt)
      preDisableCookie=await reviewer.token()
      assert.match(preDisableCookie??"",/^[A-Za-z0-9_-]{43}$/)
      assert.equal(await oldCookieStatus(),200)
      const raceAuditBefore=await countLogoutAudit()
      const raceNativeBefore=await enabledFactorList()
      assert.equal(raceNativeBefore.length,1)
      let newSessionGateReached=false,newSessionGateReleased=false
      let releaseNewSessionGate!:()=>void
      const newSessionGate=new Promise<void>(resolve=>{
        releaseNewSessionGate=()=>{newSessionGateReleased=true;resolve()}
      })
      const originalPrepareNewSession=foundationPrototype.personalPrepareNativeMfaDisable
      foundationPrototype.personalPrepareNativeMfaDisable=async function(this:any,...args:any[]){
        const prepared=await originalPrepareNewSession.apply(this,args)
        if(prepared?.person_id===B.person){
          newSessionGateReached=true
          await newSessionGate
        }
        return prepared
      }
      let newSessionRace:Promise<any>|undefined
      try{
        newSessionRace=nativeDisablePost()
        await until(async()=>newSessionGateReached,10000,
          "MFA disable precommit before another Person B full login")
        assert.equal(await oldCookieStatus(),401)
        // Real second profile, password and a previously unused native recovery
        // code; neither native Auth nor the HTTP session endpoint is mocked.
        await newSessionBrowser.input("#login input[name=email]",B.email)
        await newSessionBrowser.input("#login input[name=password]",B.password)
        await newSessionBrowser.click("#login button")
        await newSessionBrowser.wait("document.getElementById('challenge').hidden===false")
        assert.equal(await newSessionBrowser.eval(
          "(()=>{const s=document.querySelector('#challenge select[name=method]');s.value='recovery_code';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()"),
          "recovery_code")
        await newSessionBrowser.input("#challenge input[name=code]",disableCodes[4])
        await newSessionBrowser.click("#challenge button")
        await newSessionBrowser.wait("document.getElementById('workspace').hidden===false")
        const freshCookie=await newSessionBrowser.token()
        assert.match(freshCookie??"",/^[A-Za-z0-9_-]{43}$/)
        const newRows=await q(
          "select s.status,s.epoch,e.epoch current_epoch from da_browser_session s join da_person_security e on e.person_id=s.person_id where s.id=$1 and s.person_id=$2",
          [createHash("sha256").update(freshCookie!).digest("hex"),B.person])
        assert.equal(newRows.length,1)
        assert.equal(newRows[0].status,"active")
        assert.equal(String(newRows[0].epoch),String(newRows[0].current_epoch))
        assert.equal(await newSessionBrowser.eval(
          "(async()=> (await fetch('/personal/session')).status)()"),200)
        releaseNewSessionGate()
        const result=await newSessionRace
        assert.equal(result.status,409,
          "A newly authenticated full Person session must prevent native factor disable")
        assert.equal((await enabledFactorList()).length,1,
          "A refused disable must preserve the native factor for the new session")
        assert.equal(await oldCookieStatus(),401)
        assert.equal(await newSessionBrowser.eval(
          "(async()=> (await fetch('/personal/session')).status)()"),200)
        assert.equal(await countLogoutAudit(),raceAuditBefore+1,
          "Successful first revocation must keep its canonical audit/outbox")
        assert.equal(await countLogoutOutbox(),await countLogoutAudit())
        process.stdout.write("PASS B-01 MFA new-login race: independent Chrome B login committed between pre-native revocation and completion; native disable denied 409, factor and new session preserved, old cookie 401\n")
      }finally{
        if(!newSessionGateReleased)releaseNewSessionGate()
        foundationPrototype.personalPrepareNativeMfaDisable=originalPrepareNewSession
        if(newSessionRace)await newSessionRace.catch(()=>{})
      }
      // The original browser was correctly revoked in the aborted attempt.
      // Regain fresh MFA proof for the existing post-native fault regression.
      await reloginWithRecovery(disableCodes[5])
      // B-01 native-lock-first case: after the native callback is reached,
      // the Foundation advisory lock must hold an independent Staff A policy
      // writer until the callback finishes. The native Medusa operation is
      // genuinely called with an invalid proof after the controlled pause,
      // preserving the factor for the pre-existing post-native fault test.
      const concurrencyBLock=await newSessionBrowser.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return sr.status;"+
        "const s=await sr.json();"+
        "const r=await fetch('/personal/session?action=lock',{method:'DELETE',"+
        "headers:{'x-csrf-token':s.csrf_token}});return r.status})()")
      assert.equal(concurrencyBLock,200,
        "Close the concurrent B session before the native-first control")
      await loginStaffA(staffCodes[4])
      const nativeFirstPolicy=(await q(
        "select version,platform_mode from da_mfa_policy where id='current'"))[0]
      assert.equal(nativeFirstPolicy.platform_mode,"optional")
      preDisableCookie=await reviewer.token()
      assert.equal(await oldCookieStatus(),200)
      const originalNativeFirst=foundationPrototype.personalCompletePreparedNativeMfaDisable
      let nativeCallbackEntered=false,nativeFirstGateReleased=false
      let releaseNativeFirst!:()=>void
      const nativeFirstGate=new Promise<void>(resolve=>{
        releaseNativeFirst=()=>{nativeFirstGateReleased=true;resolve()}
      })
      foundationPrototype.personalCompletePreparedNativeMfaDisable=
        async function(this:any,prepared:any,operation:(identityId:string)=>Promise<unknown>,...rest:any[]){
          return originalNativeFirst.apply(this,[prepared,async(identityId:string)=>{
            if(prepared?.person_id===B.person){
              nativeCallbackEntered=true
              await nativeFirstGate
            }
            return operation(identityId)
          },...rest])
        }
      const invalidNativeDisablePost=async()=>reviewer.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status,body:{}};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/mfa/manage',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'disable',method:'recovery_code',code:'invalid-native-proof'})});"+
        "return {status:r.status,body:await r.json()}})()")
      let nativeFirstPending:Promise<any>|undefined
      let staffPolicyPending:Promise<any>|undefined
      let staffPolicySettled=false
      try{
        nativeFirstPending=invalidNativeDisablePost()
        await until(async()=>nativeCallbackEntered,10000,
          "Native MFA callback entered under real Foundation transaction lock")
        // Do not call /personal/session here: its Person row read correctly
        // waits for this native completion transaction's security row lock.
        staffPolicyPending=staffSetPlatform("required",Number(nativeFirstPolicy.version))
          .then(v=>{staffPolicySettled=true;return v},e=>{
            staffPolicySettled=true;return {status:-1,error:String(e)}
          })
        await until(async()=>{
          const [waiters]=await q(
            "select count(*)::int n from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and l.granted=false and a.datname=current_database()")
          return Number(waiters.n)>0
        },10000,"Independent Staff A policy writer waits on native MFA lock")
        assert.equal(staffPolicySettled,false,
          "Staff policy HTTP must NOT return while native callback holds the lock")
        const [stillOptional]=await q(
          "select platform_mode from da_mfa_policy where id='current'")
        assert.equal(stillOptional.platform_mode,"optional")
        releaseNativeFirst()
        const failedNative=await nativeFirstPending
        assert.equal(failedNative.status,503,
          "Actual native invalid proof must not successfully disable MFA")
        assert.match(failedNative.body?.message??"",/INDETERMINATE/)
        const wroteRequired=await staffPolicyPending
        assert.equal(wroteRequired.status,200,
          "Real Staff A policy writer must complete after native lock releases")
        const [requiredAfterLock]=await q(
          "select version,platform_mode from da_mfa_policy where id='current'")
        assert.equal(requiredAfterLock.platform_mode,"required")
        assert.ok(Number(requiredAfterLock.version)>Number(nativeFirstPolicy.version))
        assert.equal((await enabledFactorList()).length,1)
        assert.equal(await oldCookieStatus(),401)
        process.stdout.write("PASS B-01 MFA native-first policy race: real Staff A HTTP policy writer waited on PostgreSQL advisory lock through actual native Auth failed proof; required committed after release, native factor intact, old cookie 401\n")
      }finally{
        if(!nativeFirstGateReleased)releaseNativeFirst()
        foundationPrototype.personalCompletePreparedNativeMfaDisable=originalNativeFirst
        if(nativeFirstPending)await nativeFirstPending.catch(()=>{})
        if(staffPolicyPending)await staffPolicyPending.catch(()=>{})
      }
      await loginStaffA(staffCodes[5])
      const [policyAfterNativeFirst]=await q(
        "select version,platform_mode from da_mfa_policy where id='current'")
      assert.equal(policyAfterNativeFirst.platform_mode,"required")
      assert.equal((await staffSetPlatform("optional",Number(policyAfterNativeFirst.version))).status,200)
      await reloginWithRecovery(disableCodes[6])
      preDisableCookie=await reviewer.token()
      assert.match(preDisableCookie??"",/^[A-Za-z0-9_-]{43}$/)
      assert.equal(await oldCookieStatus(),200)
      epochBeforeDisable=Number((await q(
        "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch)
      logoutAuditBefore=await countLogoutAudit()
      logoutOutboxBefore=await countLogoutOutbox()
      assert.equal(logoutAuditBefore,logoutOutboxBefore)
      await q("create function b22_mfa_disable_outbox_fault_v1() returns trigger language plpgsql as $b22$ begin if exists(select 1 from da_audit_event e where e.id=NEW.audit_event_id and e.action='mfa.native_factor_disabled') then raise exception 'B22 forced post-native MFA completion audit failure'; end if; return NEW; end $b22$")
      disableFunctionInstalled=true
      await q("create trigger b22_mfa_disable_outbox_fault_v1 before insert on da_security_outbox for each row execute function b22_mfa_disable_outbox_fault_v1()")
      disableTriggerInstalled=true
      const uncertain=await nativeDisablePost()
      assert.equal(uncertain.status,503)
      assert.match(uncertain.body?.message??"",/INDETERMINATE/)
      assert.equal(await reviewer.eval(
        "(async()=> (await fetch('/personal/session')).status)()"),401,
        "Committed pre-native revocation denies the old browser")
      assert.equal(await oldCookieStatus(),401,
        "The exact old HTTPS cookie must fail even though post-native audit rolled back")
      assert.equal((await enabledFactorList()).length,0)
      const [nativeDisabled]=await auth.listAuthMfa(
        {auth_identity_id:recoveryIdentity[0].auth_identity_id,status:"disabled"},{take:2})
      assert.equal(nativeDisabled?.id,enabledFactors[0].id)
      assert.ok(Number((await q(
        "select epoch from da_person_security where person_id=$1",[B.person]))[0].epoch)>epochBeforeDisable)
      const allSessions=await q("select status from da_browser_session where person_id=$1",[B.person])
      assert.ok(allSessions.length>=2)
      assert.ok(allSessions.every((row:any)=>row.status!=="active"))
      assert.equal(await countLogoutAudit(),logoutAuditBefore+1)
      assert.equal(await countLogoutOutbox(),logoutOutboxBefore+1)
      assert.equal(Number((await q(
        "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='mfa.native_factor_disabled'",
        [B.person]))[0].n),disableBeforeAudit,
        "Failed post-native audit cannot be reported as committed")
      process.stdout.write("PASS B-01 MFA completion audit failure: native factor disabled, independent precommitted session revocation/audit survives, old HTTPS cookie denied\n")
      // Positive control for the NEW precommitted workflow: the other
      // already-enrolled synthetic Person A disables through the real
      // same-origin MFA route with a fresh native recovery proof. No
      // PostgreSQL trigger remains during this normal success path.
      await q("drop trigger b22_mfa_disable_outbox_fault_v1 on da_security_outbox")
      disableTriggerInstalled=false
      await q("drop function b22_mfa_disable_outbox_fault_v1()")
      disableFunctionInstalled=false
      await loginStaffA(staffCodes[2])
      const positiveNativeBefore=await auth.listAuthMfa(
        {auth_identity_id:staffAIdentity.auth_identity_id,status:"enabled"},{take:2})
      assert.equal(positiveNativeBefore.length,1)
      const aCookieBeforeDisable=await browser.token()
      assert.match(aCookieBeforeDisable??"",/^[A-Za-z0-9_-]{43}$/)
      const [aEpochBefore]=await q("select epoch from da_person_security where person_id=$1",[A.person])
      const aAuditCount=async(action:string)=>Number((await q(
        "select count(*)::int n from da_audit_event where actor_person_id=$1 and action=$2",
        [A.person,action]))[0].n)
      const beforeAllRevoked=await aAuditCount("session.all_revoked")
      const beforeFactorDisabled=await aAuditCount("mfa.native_factor_disabled")
      const positiveDisable=await browser.eval(
        "(async()=>{const sr=await fetch('/personal/session');"+
        "if(sr.status!==200)return {status:sr.status,body:{}};"+
        "const session=await sr.json();"+
        "const r=await fetch('/personal/mfa/manage',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
        "body:JSON.stringify({action:'disable',method:'recovery_code',code:"+JSON.stringify(staffCodes[3])+"})});"+
        "return {status:r.status,body:await r.json()}})()")
      assert.equal(positiveDisable.status,200,
        "Native MFA factor disable must succeed under the optional platform mode")
      assert.deepEqual(positiveDisable.body,{disabled:true,sessions_revoked:true})
      assert.equal((await auth.listAuthMfa(
        {auth_identity_id:staffAIdentity.auth_identity_id,status:"enabled"},{take:2})).length,0)
      const [aDisabledFactor]=await auth.listAuthMfa(
        {auth_identity_id:staffAIdentity.auth_identity_id,status:"disabled"},{take:2})
      assert.equal(aDisabledFactor?.id,positiveNativeBefore[0].id)
      assert.ok(Number((await q(
        "select epoch from da_person_security where person_id=$1",[A.person]))[0].epoch)>Number(aEpochBefore.epoch))
      assert.ok((await q(
        "select status from da_browser_session where person_id=$1",[A.person])).every((row:any)=>row.status!=="active"))
      assert.equal(await aAuditCount("session.all_revoked"),beforeAllRevoked+1)
      assert.equal(await aAuditCount("mfa.native_factor_disabled"),beforeFactorDisabled+1)
      const aCompletionOutbox=await q(
        "select e.action from da_audit_event e join da_security_outbox x on x.audit_event_id=e.id where e.actor_person_id=$1 and e.action in ('session.all_revoked','mfa.native_factor_disabled')",
        [A.person])
      assert.ok(aCompletionOutbox.some((row:any)=>row.action==="session.all_revoked"))
      assert.ok(aCompletionOutbox.some((row:any)=>row.action==="mfa.native_factor_disabled"))
      const replayA=await new Promise<number>((resolve,reject)=>{
        const req=tlsRequest(host+"/personal/session",{method:"GET",ca:readFileSync(crt),
          headers:{cookie:"da_session="+aCookieBeforeDisable}},res=>{
            res.resume();res.on("end",()=>resolve(res.statusCode??0))})
        req.on("error",reject)
        req.setTimeout(10000,()=>req.destroy(Error("Positive MFA old-cookie replay timeout")))
        req.end()
      })
      assert.equal(replayA,401,
        "Previously issued full browser cookie must be denied after normal native MFA disable")
      process.stdout.write("PASS B-01 MFA positive disable: real native factor disabled via HTTP; Foundation precommit epoch/session audit and completion audit/outbox persisted; original opaque cookie 401\n")
    }finally{
      if(disableTriggerInstalled)
        await q("drop trigger b22_mfa_disable_outbox_fault_v1 on da_security_outbox")
      if(disableFunctionInstalled)
        await q("drop function b22_mfa_disable_outbox_fault_v1()")
    }

    process.stdout.write("NOT TESTED B22 Chrome: actual platform document reviewer/writer, buyer checkout, independent acceptance and atomic cross-module revocation\n")

  }catch(error){
    // Preserve the first failed browser/HTTP assertion, rather than replacing
    // it with a secondary privacy failure observed during Chrome cleanup.
    originalB22Error=error
    throw error
  }finally{
    for(const b of browsers)await b.close()
    if(server)await new Promise<void>(r=>server!.close(()=>r()))
    if(privateServer)await new Promise<void>(r=>privateServer!.close(()=>r()))
    if(previousPrivateOrigin===undefined)delete process.env.DOGRUADRES_PRIVATE_API
    else process.env.DOGRUADRES_PRIVATE_API=previousPrivateOrigin
    if(previousTlsCert===undefined)delete process.env.DOGRUADRES_TLS_CERT
    else process.env.DOGRUADRES_TLS_CERT=previousTlsCert
    if(previousTlsKey===undefined)delete process.env.DOGRUADRES_TLS_KEY
    else process.env.DOGRUADRES_TLS_KEY=previousTlsKey
    if(previousListenerPort===undefined)delete process.env.DOGRUADRES_FRONTDOOR_PORT
    else process.env.DOGRUADRES_FRONTDOOR_PORT=previousListenerPort
    if(app)await app.close()
    await pg.end()
    rmSync(temp,{recursive:true,force:true})
    // Verify responses that closed during Chrome/server cleanup as well.
    // If another test already failed, preserve that primary diagnostic; the
    // entire job remains FAIL and this secondary error is still reported.
    if(originalB22Error===undefined)smtpGuard?.assertNoLeaks()
    else try {smtpGuard?.assertNoLeaks()}
      catch {process.stderr.write("SECONDARY SMTP privacy failure during cleanup; primary error preserved\n")}
  }
}
