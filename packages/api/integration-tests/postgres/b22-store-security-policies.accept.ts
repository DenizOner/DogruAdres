import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import {createServer as tlsServer,request as tlsRequest} from "node:https"
import {createServer as plainServer} from "node:http"
import {dirname,join} from "node:path"
import {createRequire} from "node:module"
import {ApiLoader,expressLoader} from "@medusajs/framework/http"
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync,cpSync,copyFileSync,symlinkSync,existsSync,openSync,closeSync} from "node:fs"
import {tmpdir} from "node:os"
import {spawn,spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {ingressConfig} from "../../src/utils/ingress-config"
import {requireOrganizationAccess} from "../../src/api/dogruadres/authorization"
import {completeCartWithSplitOrdersWorkflow,approveSellerWorkflow,suspendSellerWorkflow,unsuspendSellerWorkflow,createProductsWorkflow,createOffersWorkflow,createSellerCustomerGroupsWorkflow,createSellerPriceListsWorkflow,linkSellerRegionsWorkflow} from "@mercurjs/core/workflows"
import {createShippingProfilesWorkflow,addToCartWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow,createRegionsWorkflow,updateRegionsWorkflow,createPaymentCollectionForCartWorkflow,createPaymentSessionsWorkflow,capturePaymentWorkflow} from "@medusajs/medusa/core-flows"
import {B06Chrome} from "./b06-ui-browser"
import {verifyB22MultiOrgStaleStoreResponse} from "./b22-multiorg-stale-store-response.accept"
import {verifyB22TransferredRecovery,verifyAssignedRecipientUse,createB22CompletedSourceOrderFixture} from "./b22-store-name-transfer.accept"
import {verifyB22ScheduledSellerWindow} from "./b22-scheduled-seller-window.accept"
import {verifyRepeatedApprovedStoreRenameHistory} from "./b22-repeated-rename-history.accept"
import {prepareRenameBeforeStoreReactivation,verifyReactivationClaimFreezesRenames} from "./b22-reactivation-rename-claim.accept"
import {verifyB22PlatformClosingAppeal,
  verifyB22PlatformClosingSecondStageRequest,
  verifyB22RealOrderedSellerDay31WithGrant,
  verifyB22IndependentStaffClosingDecision} from "./b22-platform-closing-appeal.accept"
import {verifyTwoIndependentStaffNameRightRace} from "./b22-store-name-transfer-staff-race.accept"
import {verifyB22OwnedHistoricalOrder,verifyB22ForeignHistoricalOrder,verifyB22AuthorizedForeignHistoricalOrder} from "./b22-order-history.accept"
import {verifyB22NativeOwnerMailRetry} from "./b22-native-owner-mail-retry.accept"
import {verifyB22CoownerNativeMemberReadback,verifyB22LateProtectedOwnerClosingNotice} from "./b22-native-member-private-notice.accept"
import {SmtpResponsePrivacyGuard} from "./smtp-response-privacy-guard"
import {assertWcag22AxeInChrome} from "./wcag22-axe-chrome"
import {getFreePort,until as waitForLoopback,killProcess} from "./native-verification-browser"
import {otp,until} from "./b19-browser"
import {projectFoundationAuditEvent} from "../../src/modules/dogruadres-audit-index/envelope"
import {platformApprovedSellerIds} from "../../src/modules/dogruadres-access/legal-store-ownership"
import {IdentityAccessDenied} from "../../src/modules/dogruadres-access/identity-session"
import taxCertificateInventory, {inspectTaxCertificateSnapshot} from "../../src/scripts/tax-certificate-inventory"


export async function verifyPanelCspModes(browser:B06Chrome, container:any):Promise<void> {
  assert.equal(container.resolve("vendor_ui").getServingMode(),"static")
  const probe=async(label:string,url:string,sameOriginPath:string,allowedBackend?:string)=>{
    browser.phase="b22-dashboard-csp-"+label
    await browser.send("Page.navigate",{url})
    const expectedOrigin=new URL(url).origin
    try {
      await browser.wait("location.origin==="+JSON.stringify(expectedOrigin)+
        "&&!!document.querySelector('meta[http-equiv=Content-Security-Policy]')")
    } catch(error) {
      // Only fixed navigation metadata, never source, cookies, response bodies.
      const page=await browser.eval("({onExpectedOrigin:location.origin==="+
        JSON.stringify(expectedOrigin)+",onVendorLogin:location.pathname==='/seller/login',"+
        "hasCsp:!!document.querySelector('meta[http-equiv=Content-Security-Policy]')})")
      const navigation=browser.http.filter(r=>r.path.startsWith("/seller"))
        .map(({path,status})=>({path,status})).slice(-5)
      throw new Error(label+" expected native policy not visible: "+
        JSON.stringify({page,navigation})+"; "+String(error).slice(0,130))
    }
    const result=await browser.eval("(async()=>{"+
      "const rule=document.querySelector('meta[http-equiv=Content-Security-Policy]')?.content||'';"+
      "const local=await fetch("+JSON.stringify(sameOriginPath)+",{cache:'no-store'}).then(r=>r.status).catch(()=>0);"+
      "const blocked=await new Promise(resolve=>{"+
      "const target='https://dogruadres-csp-check.invalid';"+
      "let seen=false;"+
      "const observe=e=>{if(e.effectiveDirective==='connect-src'&&e.blockedURI.startsWith(target)){"+
      "seen=true;document.removeEventListener('securitypolicyviolation',observe);resolve(true)}};"+
      "document.addEventListener('securitypolicyviolation',observe);"+
      "fetch(target+'/feedback',{method:'POST',body:'synthetic-only'}).catch(()=>{});"+
      "setTimeout(()=>{document.removeEventListener('securitypolicyviolation',observe);resolve(seen)},1000);"+
      "});return {rule,local,blocked};})()")
    assert.ok(result.rule.includes("connect-src 'self'"),label+" must restrict cross-origin requests")
    if(allowedBackend)
      assert.ok(result.rule.split(" ").includes(allowedBackend),
        label+" must retain the explicitly configured local backend origin")
    else
      assert.equal(result.rule,"connect-src 'self'",label+" production panel allowlist")
    assert.equal(result.local,200,label+" real same-origin HTTP asset/session")
    assert.equal(result.blocked,true,label+" real Chrome external POST must be denied")
    process.stdout.write("PASS B22 Chrome: "+label+
      " connect-src blocked synthetic external POST; same-origin HTTP200\n")
  }
  // Mercur native /seller routes legitimately return 401 for a Person-only
  // session. Do NOT disable that authority boundary to inspect a static file.
  // Vite's own preview serves the exact built Vendor dist for browser proof.
  for(const scenario of [
    {panel:"vendor" as const,mode:"preview" as const,label:"Vendor BUILD"},
    {panel:"admin" as const,mode:"dev" as const,label:"Admin DEV"},
    {panel:"vendor" as const,mode:"dev" as const,label:"Vendor DEV"},
  ]){
    const port=await getFreePort()
    const cwd=join(process.cwd(),"../../apps",scenario.panel)
    const basePath=scenario.panel==="admin"?"/dashboard/":"/seller/"
    const startUrl="http://127.0.0.1:"+port+basePath
    const child=spawn("bun",
      ["run",scenario.mode,"--host","127.0.0.1","--port",String(port),"--strictPort"],{
      cwd,stdio:"ignore",detached:process.platform!=="win32",
      env:{...process.env,VITE_MERCUR_BACKEND_URL:browser.origin,
        MERCUR_DISABLE_TELEMETRY:"true"},
    })
    try{
      await waitForLoopback(async()=>{
        const response=await fetch(startUrl,{signal:AbortSignal.timeout(1000)})
        return response.ok
      },45000,scenario.label+" existing native Vite server")
      await probe(scenario.label,startUrl,basePath,
        scenario.mode==="dev"?browser.origin:undefined)
    }finally{
      // Bun can spawn a Vite child. Terminate only our dedicated process group.
      if(process.platform!=="win32"&&child.pid){
        try{process.kill(-child.pid,"SIGKILL")}catch{killProcess(child)}
      }else killProcess(child)
      await waitForLoopback(async()=>
        child.exitCode!==null||child.signalCode!==null,
        10000,scenario.label+" Vite process shutdown")
    }
  }
}

// Uses only the existing Mercur module middleware and its real built dashboard.
// This dedicated child terminates after invalidating its two genuine MFA sessions.
export async function verifyAdminSmtp(browser:B06Chrome, denied:B06Chrome, container:any,
  person:string, otherPerson:string, q:(sql:string,args?:unknown[])=>Promise<any[]>,guard:SmtpResponsePrivacyGuard) {
  assert.equal(container.resolve("admin_ui").getServingMode(),"static")
  const secret=process.env.B22_SMTP_CANARY!
  assert.match(secret,/^b22-smtp-[0-9a-f]{48}$/)
  browser.secretCanary=secret;denied.secretCanary=secret
  // Real HTTPS egress is the privacy authority; CDP body request IDs
  // can expire on navigation. Retain separate Chrome console leak checks.
  assert.equal(guard.secret,secret)
  const assertPrivateResponses=()=>guard.assertNoLeaks()
  const path="/personal"
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
    try {await b.wait("location.pathname==='/personal' && !!document.querySelector('#workspace:not([hidden])') && document.body.textContent.includes('Platform SMTP ve Bildirim Ayarları')")}
    catch(error){
      // Before any SMTP secret input: bounded diagnostics of this one native
      // navigation. No cookies, headers, HTML source or input values retained.
      await b.screenshot(join(evidence,"native-navigation-failed.png"))
      writeFileSync(join(evidence,"native-navigation-failed.json"),JSON.stringify({
        source:process.env.GITHUB_SHA,
        document:await b.eval("({onExpectedPath:location.pathname==='/personal',headingPresent:document.body.textContent.includes('Platform SMTP ve Bildirim Ayarları')})"),
        errors:b.runtimeErrors,
        http:b.http.filter(r=>r.phase===b.phase).map(({method,path,status})=>({method,path,status})),
      },null,2))
      throw error
    }
    assert.equal(await b.eval("location.pathname"),path)
  }
  const read=async(b:B06Chrome)=>{
    const response=await b.eval(`(async()=>{const r=await fetch('/platform/smtp');return {status:r.status,body:await r.json()}})()`)
    // Inspect while this document still owns the completed response body.
    assertPrivateResponses()
    return response
  }
  const hidden=async(b:B06Chrome)=>b.wait("document.querySelector('#smtp-platform')?.hidden===true")
  const reload=async(b:B06Chrome,status:number)=>{
    // Inspect response bodies before navigating away from their document.
    assertPrivateResponses()
    const start=b.http.length
    await b.send("Page.reload",{ignoreCache:true})
    await until(async()=>b.http.slice(start).some(r=>r.path==='/platform/smtp'&&r.method==='GET'&&r.status===status),
      20000,'New document SMTP GET '+status)
  }
  const digest=()=>q("select id,enabled,host,port,security,username,password_encrypted,from_email,from_name,version from da_platform_smtp_settings order by id")
  const before=await digest()
  assert.deepEqual(before,[],"Fresh dedicated SMTP database")
  // Negative checks precede any valid settings write.
  await verifyPanelCspModes(denied,container)
  await open(denied);await hidden(denied)
  // Test the actual production /personal CSP header, not a mocked header.
  // Only a synthetic .invalid host is attempted; no private information is
  // submitted to Mercur or any real remote service during this check.
  const policy=await denied.eval("(async()=>{const r=await fetch('/personal',{cache:'no-store'});return r.headers.get('content-security-policy')||''})()")
  assert.ok(policy.includes("connect-src 'self'"),"Personal console CSP must restrict external connections")
  const externalDenied=await denied.eval(`(async()=>{
    const testOrigin='https://dogruadres-csp-check.invalid';
    return await new Promise(resolve=>{
      let observed=false;
      const onViolation=event=>{
        if(event.effectiveDirective==='connect-src' && event.blockedURI.startsWith(testOrigin)){
          observed=true;
          document.removeEventListener('securitypolicyviolation',onViolation);
          resolve(true);
        }
      };
      document.addEventListener('securitypolicyviolation',onViolation);
      fetch(testOrigin+'/feedback',{method:'POST',body:'synthetic-only'}).catch(()=>{});
      setTimeout(()=>{document.removeEventListener('securitypolicyviolation',onViolation);resolve(observed)},700);
    });
  })()`)
  assert.equal(externalDenied,true,
    'Real Chrome must deny synthetic external Feedback-like POST via CSP')
  assert.equal((await read(denied)).status,403)
  assert.deepEqual(await digest(),before)
  mark("Unauthorized real MFA session GET403; no SMTP rows")
  const grant="da_staff_smtp_"+randomBytes(12).toString("hex")
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable SMTP acceptance fixture')`,[grant,person])
  await open(browser)
  await browser.wait("document.querySelector('#smtp-platform')?.hidden===false && !!document.querySelector('#smtp-form input[name=host]')")
  const first=await read(browser)
  assert.equal(first.status,200);assert.equal(first.body.can_manage,true)
  assert.equal(first.body.settings.version,0)
  assert.equal(await browser.eval("document.querySelector('#smtp-form input[name=host]').value"),first.body.settings.host)
  mark("Native Admin render and explicitly granted MFA session GET200")
  await browser.screenshot(join(evidence,"authorized-read.png"))
  writeFileSync(join(evidence,"authorized-read.json"),JSON.stringify({
    source:process.env.GITHUB_SHA,nativeModule:"personal_console",sameOrigin:true,
    realMfa:true,unauthorizedStatus:403,authorizedStatus:first.status,version:first.body.settings.version,
  },null,2))
  // DOM inputs and submit use real Chrome input events. SMTP remains disabled;
  // neither the separate send-test control nor any provider is invoked.
  if(await browser.eval("document.querySelector('#smtp-form input[name=enabled]').checked===true"))
    await browser.click("#smtp-form input[name=enabled]")
  const replace=async(selector:string,value:string)=>{
    await browser.click(selector)
    await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65})
    await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65})
    await browser.send("Input.insertText",{text:value})
  }
  await replace("#smtp-form input[name=host]","smtp.b22.example.invalid")
  await replace("#smtp-form input[name=from_email]","b22@example.invalid")
  await replace("#smtp-form input[name=password]",secret)
  assert.equal(await browser.eval("document.querySelector('#smtp-form input[name=host]').value==='smtp.b22.example.invalid'"),true)
  assert.equal(await browser.eval("document.querySelector('#smtp-form input[name=from_email]').value==='b22@example.invalid'"),true)
  assert.equal(await browser.eval("document.querySelector('#smtp-form').checkValidity()"),true)
  const saveStart=browser.http.length
  await browser.click("#smtp-form button")
  try {await browser.wait("document.body.textContent.includes('Ayar sürümü: 1') || document.body.textContent.includes('Config version: 1')")}
  catch(error){
    // Read back this one ambiguous attempt before the dedicated DB is retired.
    // Never retry its submit; retain no request payload or password/ciphertext.
    const posts=browser.http.slice(saveStart).filter(r=>r.path==='/platform/smtp'&&r.method==='POST')
    // Diagnostic metadata only: never depend on a stale CDP response body.
    const responses=posts.map(post=>({status:post.status}))
    const state=await browser.eval(`({
      versionRendered:document.body.textContent.includes('Ayar sürümü: 1') || document.body.textContent.includes('Config version: 1'),
      hostMatches:document.querySelector('#smtp-form input[name=host]')?.value==='smtp.b22.example.invalid',
      senderMatches:document.querySelector('#smtp-form input[name=from_email]')?.value==='b22@example.invalid',
      validity:Array.from(document.querySelectorAll('#smtp-form input')).map(e=>({name:e.name,valid:e.validity.valid})),
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
  await browser.wait("document.body.textContent.includes('Ayar sürümü: 1') || document.body.textContent.includes('Config version: 1')")
  assert.equal(await browser.eval("document.querySelector('#smtp-form input[name=host]').value"),saved[0].host)
  assert.equal(await browser.eval("document.querySelector('#smtp-form input[name=password]').value"),"")
  await browser.screenshot(join(evidence,"saved-refreshed.png"))
  mark("New document refresh GET200 and persisted settings rendered; password input empty")
  // A stale real HTTP writer must not overwrite the newer browser save.
  const stale=await browser.eval(`(async()=>{const s=await(await fetch('/personal/session')).json();
    const r=await fetch('/platform/smtp',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
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
    const start503=browser.http.length
    await browser.send("Page.reload",{ignoreCache:true})
    await until(async()=>browser.http.slice(start503).some(r=>r.path==='/personal'&&r.method==='GET'&&r.status===503),
      20000,'New document /personal GET 503')
    await browser.wait("!document.querySelector('#smtp-form')")
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
  const reloadSessionDenied=async(b:B06Chrome)=>{
    assertPrivateResponses()
    const start=b.http.length
    await b.send("Page.reload",{ignoreCache:true})
    await until(async()=>b.http.slice(start).some(r=>r.path==='/personal/session'&&r.method==='GET'&&(r.status===401||r.status===403)),
      20000,'New document /personal/session denied')
    await hidden(b)
  }
  await q("update da_browser_session set created_at=clock_timestamp()-interval '30 days' where id=$1",[bHash])
  assert.equal((await read(denied)).status,403)
  await reloadSessionDenied(denied)
  mark("Expired real session GET403 and form hidden")
  // A receives a new explicit fixture grant; a terminal DB fixture then revokes
  // its genuine session. No session is fabricated or restored by the test.
  await q(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'platform.smtp.manage','platform',$2,'B22 disposable revocation fixture')`,[grant+"_a",person])
  assert.equal((await read(browser)).status,200)
  const aHash=createHash('sha256').update(await browser.token()).digest('hex')
  await q("update da_browser_session set status='revoked' where id=$1",[aHash])
  assert.equal((await read(browser)).status,403)
  await reloadSessionDenied(browser)
  mark("Revoked real session GET403 and form hidden")
  assert.deepEqual(await digest(),saved)
  await guard.assertComplete()
  for(const b of [browser,denied]){
    assertPrivateResponses()
    assert.equal(b.secretLeaks,false,"Secret in Chrome protocol/console")
  }
  assert.ok(browser.http.some(r=>r.path===path&&r.status===200&&r.tls))
  assert.ok(browser.http.some(r=>r.path==='/platform/smtp'&&r.method==='POST'&&r.status===200))
  writeFileSync(join(evidence,"acceptance.json"),JSON.stringify({
    source:process.env.GITHUB_SHA,sameOrigin:true,nativeModule:"admin_ui",servingMode:"static",
    syntheticOnly:true,smtpEnabled:false,versionBefore:0,versionAfter:1,
    scenarios:["MFA and explicit grant GET200","browser save and PostgreSQL readback","refresh",
      "stale409 unchanged","unauthorized403","expired403","revoked403","GET500 form hidden","GET503 form hidden"],
    http:[...browser.http,...denied.http].map(({method,path,status,tls})=>({method,path,status,tls})),
  },null,2))
  process.stdout.write("PASS B22 Chrome: native Admin SMTP same-origin MFA/grant GET200, browser save/version/PG16/refresh, stale409 unchanged, unauthorized/expired/revoked403, real500/503 form hidden; disabled synthetic SMTP, no send\n")
}

export async function verifyMembershipNonDisclosure({
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
      const r=await fetch('/organization/memberships',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':${JSON.stringify(session.body.csrf_token)}},
        body:JSON.stringify({action:'role',organization_id:${JSON.stringify(organizationId)},
          membership_id:${JSON.stringify(target.id)},role:'member'})})
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
export async function verifyOwnerMembershipManagePolicy({
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
      const ownerList=await browser.eval(`(async()=>{
        const org=${JSON.stringify(organizationId)};
        return (await fetch('/organization/memberships?organization='+org)).status;
      })()`)
      assert.equal(ownerList,200,
        "Legacy settings cannot narrow current protected Owner membership access")
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
    // Preserve the approved no-Admin rule in real HTTP. Only a historical
    // Admin may be reduced to Member. The disposable test-only legacy fixture
    // is prepared with SQL, never through a visitor-facing Admin promotion.
    const legacyFixture=await q(`update da_organization_membership
      set role='admin',protected_owner=false,updated_at=clock_timestamp()
      where id=$1 and role='member' and protected_owner=false and status='active'
      returning id`,[targetMembershipId])
    assert.equal(legacyFixture.length,1,
      "Task-only existing Member can represent an old Admin for non-escalating acceptance")
    const restoredMembership=await browser.eval(`(async()=>{
      const org=${JSON.stringify(organizationId)}
      const member=${JSON.stringify(targetMembershipId)}
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/organization/memberships',{method:'POST',
        headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify({action:'role',organization_id:org,membership_id:member,role:'member'})})
      return {status:response.status,
        role:response.status===200?(await response.json()).membership?.role:null}
    })()`)
    assert.deepEqual(restoredMembership,{status:200,role:"member"},
      "Protected Owner must be able to reduce a historical Admin to ordinary Member")
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
    assert.equal(membershipChangedAudit[0].n,membershipChangedAuditBefore[0].n+1,
      "The one real legacy Admin -> Member transition needs one canonical audit/outbox")
    process.stdout.write("PASS B22 Owner role policy: fixed membership.manage under legacy setting; real Owner HTTP legacy Admin reduction audited\n")
}
 
// Dedicated real Chrome/PG16 audit timeline read-policy verification.
// Keeps strict source/audit observation independent of the large B22 body.
export async function verifyOwnerAuditTimelinePolicy({
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
      const r=await fetch('/organization/audit-timeline?organization='+${JSON.stringify(organizationId)})
      return r.status
    })()`)
    assert.equal(ownerDefault,200,"Default protected Owner can read scoped audit timeline")
    // This is a disposable ordinary Member, never a protected Owner.
    await q("update da_organization_membership set role='admin',protected_owner=false,updated_at=clock_timestamp() where id=$1",[adminMembershipId])
    try{
      process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=
        "buyer.purchase,products.edit,invitation.manage,membership.manage,membership.list"
      const deniedOwner=await browser.eval(`(async()=>{
        const r=await fetch('/organization/audit-timeline?organization='+${JSON.stringify(organizationId)})
        const body=await r.json()
        return {status:r.status,privateItems:Object.hasOwn(body,'items'),message:body.message}
      })()`)
      assert.equal(deniedOwner.status,200,"Protected Owner audit permission cannot be reduced by legacy setting")
      assert.equal(deniedOwner.privateItems,true,"Protected Owner retains scoped private audit items")
      await reviewer.send("Page.bringToFront")
      await reviewer.wait("document.visibilityState==='visible'")
      const adminRead=await reviewer.eval(`(async()=>{
        const r=await fetch('/organization/audit-timeline?organization='+${JSON.stringify(organizationId)})
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
      return (await fetch('/organization/audit-timeline?organization='+${JSON.stringify(organizationId)})).status
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
    process.stdout.write("PASS B22 Owner role policy: fixed audit.timeline.read keeps Owner HTTPS200 and Admin403; PG16 membership/audit/outbox unchanged\n")
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
export async function verifyNativeOrganizationReadPolicy({
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
    assert.equal((await nativeGet(A,alphaOrg)).organizationId,alphaOrg,
      "Protected Owner native read remains allowed despite legacy setting")
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
  process.stdout.write("PASS B22 native organization.read role policy: protected Owner remains allowed with legacy setting; Admin/Member unchanged, foreign/role-only Owner denied, native ingress401\n")
}

/** Real signed-in Chrome/HTTPS/PG16: two genuinely authorized native
 * Seller choices, selection retention and fail-closed lost-target refresh.
 */
