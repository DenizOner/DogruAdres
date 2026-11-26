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


export async function withLegacyPlatformClosingOrigin<T>(input:{
  q:(sql:string,params?:any[])=>Promise<any[]>;
  organizationId:string;sellerId:string;
  actorPersonId:string;actorId:string;
  run:()=>Promise<T>;
}):Promise<T>{
  const {q,organizationId,sellerId,actorPersonId,actorId,run}=input
  const [origin]=await q(`select o.id,o.verification_audit_event_id,e.action
    from da_organization_seller_ownership o
    join da_audit_event e on e.id=o.verification_audit_event_id
    where o.organization_id=$1 and o.seller_id=$2 and o.revoked_at is null`,
    [organizationId,sellerId])
  assert.ok(origin)
  assert.equal(origin.action,"organization.store_application_created")
  const sourceId="daaud_"+randomBytes(16).toString("hex")
  await q(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,organization_id,
     action,module,resource,target_id,role_context,occurred_at)
    values ($1,$2,'user',$3,$4,'organization.store_association_approved',
      'dogruadres-access','store-association',$5,'platform_staff',clock_timestamp())`,
    [sourceId,actorPersonId,actorId,organizationId,sellerId])
  await q(`insert into da_audit_outbox
    (id,source_audit_event_id,source_module,envelope)
    values ($1,$2,'dogruadres-access','{}'::jsonb)`,
    ["daaob_"+randomBytes(16).toString("hex"),sourceId])
  let moved=false,completed=false
  try{
    const changed=await q(`update da_organization_seller_ownership
      set verification_audit_event_id=$1
      where id=$2 and verification_audit_event_id=$3
        and revoked_at is null returning id`,
      [sourceId,origin.id,origin.verification_audit_event_id])
    assert.equal(changed.length,1)
    moved=true
    const result=await run()
    completed=true
    return result
  }finally{
    if(moved){
      const restored=await q(`update da_organization_seller_ownership
        set verification_audit_event_id=$1
        where id=$2 and verification_audit_event_id=$3
          and revoked_at is null returning id`,
        [origin.verification_audit_event_id,origin.id,sourceId])
      assert.equal(restored.length,1,
        "Task-only legacy Store Origin must be restored")
    }
    if(completed)process.stdout.write("PASS B22 Chrome/HTTPS/PG16: legacy approved Store association with native Seller and strong Staff; revoked and foreign Origin HTTP403; single closing/audit/outbox and Owner notice durable; original application proof restored\n")
  }
}

/** #311 P2: after same-page A→B→A logins, the lock test must probe the
 * CURRENT active native A session, not an already-revoked original cookie.
 * Keep this exact DB assertion outside the long B22 function so TS can
 * analyze it without weakening any check.
 */
export async function currentOwnerCookieForLock(input:{
  browser:B06Chrome;oldCookie:string;personId:string;
  q:(sql:string,params?:unknown[])=>Promise<any[]>;
}):Promise<string>{
  const cookie=await input.browser.token()
  assert.match(cookie??"",/^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(cookie,input.oldCookie,
    "Cross-Person login test must rotate A's exact native session")
  const hash=createHash("sha256").update(cookie!).digest("hex")
  assert.deepEqual(await input.q("select person_id,status from da_browser_session where id=$1",
    [hash]),[{person_id:input.personId,status:"active"}],
    "Lock acceptance must target the live, strongly authenticated Owner A session")
  return cookie!
}

export async function verifyStoreApplicationInitialReadRetry(input:{
  browser:B06Chrome;q:(sql:string,params?:any[])=>Promise<any[]>;
  organizationId:string;organizationName:string;
}):Promise<void>{
  const {browser,q,organizationId,organizationName}=input
  // Only the first READ response is faulted inside the task-only Chrome
  // browser. Retry uses actual HTTPS and the existing PG16 authorization.
  const before=await q(`select
    (select count(*)::int from da_store_application_draft where organization_id=$1) as drafts,
    (select count(*)::int from da_store_application where organization_id=$1) as applications,
    (select count(*)::int from da_audit_event where organization_id=$1
      and action in ('organization.store_application_draft_saved',
        'organization.store_application_created')) as audits`,[organizationId])
  assert.equal(before.length,1)
  await browser.eval("(()=>{"+
    "const real=window.fetch.bind(window);"+
    "window.__daApplicationRetryOriginal=window.fetch;"+
    "window.__daApplicationRetryFault='503';"+
    "window.__daApplicationRetryInjected=0;window.__daApplicationRetryReal=0;"+
    "window.fetch=(resource,options)=>{"+
    "const url=typeof resource==='string'?resource:resource?.url;"+
    "if(typeof url==='string'&&url.startsWith('/organization/store-applications?')&&"+
    "(!options?.method||options.method==='GET')){"+
    "const fault=window.__daApplicationRetryFault;"+
    "if(fault){window.__daApplicationRetryFault='';window.__daApplicationRetryInjected++;"+
    "if(fault==='503')return Promise.resolve(new Response(JSON.stringify({message:'Service unavailable'}),"+
    "{status:503,headers:{'Content-Type':'application/json'}}));"+
    "return real(resource,options).then(response=>response.status===200?"+
    "new Response('{',{status:200,headers:{'Content-Type':'application/json'}}):response)"+
    "}window.__daApplicationRetryReal++"+
    "}return real(resource,options)"+
    "};return true})()")
  try{
    await browser.select(organizationName,"owner")
    await browser.wait("!document.getElementById('store-application-panel').hidden&&"+
      "document.getElementById('store-application-status').textContent.includes('Başvurular güvenli biçimde okunamadı.')")
    assert.deepEqual(await browser.eval("({faults:window.__daApplicationRetryInjected,"+
      "reads:window.__daApplicationRetryReal})"),{faults:1,reads:0},
      "The very first Owner application read must fail without another silent GET")
    assert.equal(await browser.eval("document.getElementById('store-application-form').hidden"),true)
    await browser.click("#store-applications-refresh")
    await browser.wait("!document.getElementById('store-application-form').hidden&&"+
      "!document.getElementById('store-draft-form').hidden")
    assert.equal(await browser.eval("window.__daApplicationRetryReal"),1,
      "Refresh after first 503 must make a fresh authorized HTTPS GET")
    await browser.eval("window.__daApplicationRetryFault='malformed'")
    await browser.click("#store-applications-refresh")
    await browser.wait("document.getElementById('store-application-status').textContent.includes('Başvurular güvenli biçimde okunamadı.')")
    assert.equal(await browser.eval("window.__daApplicationRetryInjected"),2)
    assert.equal(await browser.eval("document.getElementById('store-application-form').hidden"),true,
      "Malformed successful response may never keep submission enabled")
    await browser.click("#store-applications-refresh")
    await browser.wait("!document.getElementById('store-application-form').hidden&&"+
      "!document.getElementById('store-draft-form').hidden")
    assert.equal(await browser.eval("window.__daApplicationRetryReal"),2,
      "Malformed response must not strand the verified Owner refresh button")
    assert.deepEqual(await q(`select
      (select count(*)::int from da_store_application_draft where organization_id=$1) as drafts,
      (select count(*)::int from da_store_application where organization_id=$1) as applications,
      (select count(*)::int from da_audit_event where organization_id=$1
        and action in ('organization.store_application_draft_saved',
          'organization.store_application_created')) as audits`,[organizationId]),before,
      "Read retries must not create a Store draft, Seller or audit")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: verified Owner initial Store applications GET simulated 503 and malformed response each recover by refresh; actual authorized HTTPS GET, no Store draft/Seller/audit writes\n")
  }finally{
    await browser.eval("(()=>{if(window.__daApplicationRetryOriginal){"+
      "window.fetch=window.__daApplicationRetryOriginal;"+
      "delete window.__daApplicationRetryOriginal;"+
      "delete window.__daApplicationRetryFault;"+
      "delete window.__daApplicationRetryInjected;"+
      "delete window.__daApplicationRetryReal}return true})()").catch(()=>{})
  }
}

export async function verifyStoreDraftPhonePersonLockRace(input:{
  browser:B06Chrome;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  connectionString:string;personId:string;organizationId:string;
  storeDraftId:string;draftEdited:string;personalPhone:string;
}):Promise<void>{
  const {browser,q,connectionString,personId,organizationId,storeDraftId,
    draftEdited,personalPhone}=input
  // #279 P2: Two simultaneous authenticated browser HTTPS operations on
  // one Person must WAIT for Person before touching session/epoch locks.
  const draftBarrier=new Client({connectionString:connectionString})
  const draftProbe=new Client({connectionString:connectionString})
  let draftBarrierConnected=false,draftProbeConnected=false
  let draftBarrierHeld=false,draftProbeHeld=false,raceStarted=false
  try{
    await draftBarrier.connect();draftBarrierConnected=true
    await draftProbe.connect();draftProbeConnected=true
    const beforeRaceAudits=Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='person.mobile_updated'",
      [personId]))[0].n)
    await draftBarrier.query("BEGIN");draftBarrierHeld=true
    await draftBarrier.query("select id from da_person where id=$1 for update",[personId])
    await browser.callFunction(
      "async function(org){"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const read=fetch('/organization/store-applications?organization_id='+encodeURIComponent(org),"+
      "{signal:AbortSignal.timeout(45000)}).then(async r=>({status:r.status,body:await r.json()}));"+
      "const write=fetch('/personal/profile',{method:'POST',headers:{"+
      "'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({mobile_phone:'+905551234568',expected_version:1}),"+
      "signal:AbortSignal.timeout(45000)}).then(async r=>({status:r.status,body:await r.json()}));"+
      "globalThis.__daDraftMobileRace=Promise.all([read,write]);return true}",
      organizationId)
    raceStarted=true
    await until(async()=>{
      const [w]=await q(`select
        count(*) filter (where query ilike '%for share of p%')::int readers,
        count(*) filter (where query ilike '%for update of p%')::int writers
        from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and query ilike '%from da_browser_session s%'`)
      return Number(w.readers)>=1&&Number(w.writers)>=1
    },15000,"#279 real draft SHARE and mobile UPDATE must both wait Person first")
    // Under the original session-first order, draft GET would already
    // lock the epoch. NOWAIT would fail while it waits for Person.
    await draftProbe.query("BEGIN");draftProbeHeld=true
    await draftProbe.query(
      "select epoch from da_person_security where person_id=$1 for update nowait",
      [personId])
    await draftProbe.query("ROLLBACK");draftProbeHeld=false
    await draftBarrier.query("COMMIT");draftBarrierHeld=false
    const outcome=await browser.eval("globalThis.__daDraftMobileRace")
    assert.equal(outcome.length,2)
    assert.equal(outcome[0].status,200,"Authorized draft GET must finish")
    assert.equal(outcome[0].body.drafts.find((d:any)=>d.id===storeDraftId)?.version,2)
    assert.equal(outcome[1].status,200,"Authenticated phone update must finish")
    assert.equal(outcome[1].body.version,2)
    assert.deepEqual(await q("select mobile_phone,mobile_version from da_person where id=$1",
      [personId]),[{mobile_phone:"+905551234568",mobile_version:2}])
    assert.deepEqual(await q("select version,name from da_store_application_draft where id=$1",
      [storeDraftId]),[{version:2,name:draftEdited}])
    const mobileRaceAudit=await q(`select e.id,e.new_values,x.id as outbox_id
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.actor_person_id=$1 and e.action='person.mobile_updated'`,[personId])
    assert.equal(mobileRaceAudit.length,beforeRaceAudits+1)
    assert.ok(!JSON.stringify(mobileRaceAudit).includes("+905551234568"),
      "Private phone must not leak in audit or outbox")
    const restored=await browser.callFunction(
      "async function(){const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/personal/profile',{method:'POST',headers:{"+
      "'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:JSON.stringify({mobile_phone:'+905551234567',expected_version:2})});"+
      "return {status:r.status,body:await r.json()}}")
    assert.equal(restored.status,200)
    assert.equal(restored.body.version,3)
    assert.deepEqual(await q("select mobile_phone,mobile_version from da_person where id=$1",
      [personId]),[{mobile_phone:personalPhone,mobile_version:3}])
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event where actor_person_id=$1 and action='person.mobile_updated'",
      [personId]))[0].n),beforeRaceAudits+2)
    process.stdout.write("PASS B22 Chrome/PG16: concurrent Store draft GET and Person mobile POST both wait Person-first, epoch NOWAIT free, HTTPS200 each, one private audit/outbox, draft unchanged\n")
  }finally{
    if(draftProbeHeld)await draftProbe.query("ROLLBACK")
    if(draftBarrierHeld)await draftBarrier.query("ROLLBACK")
    if(raceStarted)await browser.eval(
      "Promise.allSettled([globalThis.__daDraftMobileRace])").catch(()=>{})
    if(draftProbeConnected)await draftProbe.end()
    if(draftBarrierConnected)await draftBarrier.end()
  }
}

export async function verifyStoreDraftClosingPersonLockRace(input:{
  browser:B06Chrome;q:(sql:string,params?:any[])=>Promise<any[]>;
  connectionString:string;personId:string;organizationId:string;sellerId:string;
}):Promise<void>{
  const {browser,q,connectionString,personId,organizationId,sellerId}=input
  // #329 P2: both authorized GET paths must take Person before session/epoch;
  // no synthetic lock mock can establish the PostgreSQL lock order.
  const beforeDrafts=await q(
    "select id,name,version from da_store_application_draft where organization_id=$1 order by id",
    [organizationId])
  const beforeClosings=await q(
    "select count(*)::int n from da_store_owner_closing where seller_id=$1",[sellerId])
  const beforeAudits=await q(`select count(*)::int n from da_audit_event
    where organization_id=$1 and target_id=$2 and resource='store-owner-closing'`,
    [organizationId,sellerId])
  const barrier=new Client({connectionString})
  const probe=new Client({connectionString})
  let barrierConnected=false,probeConnected=false,barrierHeld=false,probeHeld=false
  let raceStarted=false
  try{
    await barrier.connect();barrierConnected=true
    await probe.connect();probeConnected=true
    await barrier.query("BEGIN");barrierHeld=true
    await barrier.query("select id from da_person where id=$1 for update",[personId])
    await browser.callFunction(
      "async function(org,seller){"+
      "const draft=fetch('/organization/store-applications?organization_id='+encodeURIComponent(org),"+
      "{cache:'no-store',signal:AbortSignal.timeout(45000)}).then(async r=>({status:r.status,body:await r.json()}));"+
      "const closing=fetch('/organization/store-owner-closing?'+new URLSearchParams({organization_id:org,seller_id:seller}),"+
      "{cache:'no-store',signal:AbortSignal.timeout(45000)}).then(async r=>({status:r.status,body:await r.json()}));"+
      "globalThis.__daDraftClosingRace=Promise.all([draft,closing]);return true}",
      organizationId,sellerId)
    raceStarted=true
    await until(async()=>{
      const [wait]=await q(`select count(*)::int n from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and query ilike '%from da_browser_session s%'
          and query ilike '%for share of p%'`)
      return Number(wait.n)>=2
    },15000,"#329 two real draft/closing GET Person-first lock waiters")
    // Prior UI status fetches can briefly hold epoch independently. Give
    // those finite reads time to finish while Person stays blocked: an
    // inverse session->Person lock order cannot escape this barrier and
    // must still FAIL rather than being treated as a transient conflict.
    await until(async()=>{
      await probe.query("BEGIN");probeHeld=true
      try{
        await probe.query(
          "select epoch from da_person_security where person_id=$1 for update nowait",
          [personId])
        await probe.query("ROLLBACK");probeHeld=false
        return true
      }catch(error){
        await probe.query("ROLLBACK");probeHeld=false
        if((error as {code?:string}).code!=="55P03")throw error
        return false
      }
    },4000,"#329 epoch NOWAIT must become free while Person barrier remains held")
    const [stillWaiting]=await q(`select count(*)::int n from pg_stat_activity
      where datname=current_database() and wait_event_type='Lock'
        and query ilike '%from da_browser_session s%'
        and query ilike '%for share of p%'`)
    assert.ok(Number(stillWaiting.n)>=2,"Both targeted GETs must still wait Person")
    await barrier.query("COMMIT");barrierHeld=false
    const values=await browser.eval("globalThis.__daDraftClosingRace")
    assert.equal(values.length,2)
    assert.equal(values[0].status,200,"Owner draft GET must finish without 503")
    assert.ok(Array.isArray(values[0].body.drafts))
    assert.equal(values[1].status,200,"Owner closing GET must finish without 503")
    assert.equal(values[1].body.organization_id,organizationId)
    assert.equal(values[1].body.seller_id,sellerId)
    assert.equal(values[1].body.state,"none")
    assert.equal(values[1].body.permanent_finalization_enabled,false)
    assert.deepEqual(await q(
      "select id,name,version from da_store_application_draft where organization_id=$1 order by id",
      [organizationId]),beforeDrafts,"Read race must not modify Store drafts")
    assert.deepEqual(await q(
      "select count(*)::int n from da_store_owner_closing where seller_id=$1",
      [sellerId]),beforeClosings,"Read race must not create closing state")
    assert.deepEqual(await q(`select count(*)::int n from da_audit_event
      where organization_id=$1 and target_id=$2 and resource='store-owner-closing'`,
      [organizationId,sellerId]),beforeAudits,"Read race must not append closing audit/outbox")
    process.stdout.write("PASS B22 Chrome/PG16: Store draft and Owner closing GET wait Person-first, epoch NOWAIT free, HTTPS200 each, no draft or closing writes\n")
  }finally{
    if(probeHeld)await probe.query("ROLLBACK")
    if(barrierHeld)await barrier.query("ROLLBACK")
    if(raceStarted)await browser.eval(
      "Promise.allSettled([globalThis.__daDraftClosingRace])").catch(()=>{})
    if(probeConnected)await probe.end()
    if(barrierConnected)await barrier.end()
  }
}


export async function verifyOwnerSubmittedMemberDraft(
  reviewer:B06Chrome,browser:B06Chrome,
  organizations:{id:string;name:string}[],rand:string,
  ownerPersonId:string,native:any,
  q:(sql:string,params?:any[])=>Promise<any[]>,
  secondPersonId:string,connectionString:string
):Promise<void>{
      // An earlier Member prepared a durable Beta draft; their explicit draft
      // permission was revoked. Only Beta's independently authenticated,
      // protected Owner can now submit that SAME saved version. Reuse Mercur
      // native Seller workflow; no second Seller mechanism or private payload.
      const submittedDraftName="B22 delegate "+rand
      const [ownerReviewedDraft]=await q(`select id,name,email,version,status
        from da_store_application_draft where organization_id=$1 and name=$2`,
        [organizations[1].id,submittedDraftName])
      assert.ok(ownerReviewedDraft)
      assert.equal(ownerReviewedDraft.status,"draft")
      assert.equal(ownerReviewedDraft.version,1)
      await reviewer.select(organizations[1].name,"owner")
      await reviewer.wait("Array.from(document.querySelectorAll('#store-application-list p')).some("+
        "p=>p.textContent.includes("+JSON.stringify(submittedDraftName)+") && "+
        "Array.from(p.querySelectorAll('button')).some(b=>b.textContent==='Bu taslağı resmî başvuruya gönder'))")
      const unauthorizedDraftSubmit=await browser.callFunction(
        "async function(org,id){const s=await(await fetch('/personal/session')).json();"+
        "const r=await fetch('/organization/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
        "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:id,"+
        "expected_version:1,application_id:'daapp_'+'b'.repeat(32)})});return r.status}",
        organizations[1].id,ownerReviewedDraft.id)
      assert.equal(unauthorizedDraftSubmit,403,
        "Revoked Member cannot convert a retained company draft into Seller")
      const deniedSubmitCsrf=await reviewer.callFunction(
        "async function(org,id){const r=await fetch('/organization/store-applications',{method:'POST',"+
        "headers:{'content-type':'application/json','x-csrf-token':'invalid'},"+
        "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:id,"+
        "expected_version:1,application_id:'daapp_'+'c'.repeat(32)})});return r.status}",
        organizations[1].id,ownerReviewedDraft.id)
      assert.equal(deniedSubmitCsrf,403,"Owner draft submission requires first-party CSRF")
      await reviewer.click("#store-application-list p button:nth-of-type(2)")
      await reviewer.wait("document.getElementById('store-application-status').textContent.includes('Taslak başvuruya gönderildi')")
      const [sentDraft]=await q(`select status,version,name,email,submitted_application_id
        from da_store_application_draft where id=$1`,[ownerReviewedDraft.id])
      assert.equal(sentDraft.status,"submitted")
      assert.equal(sentDraft.version,1)
      assert.equal(sentDraft.name,submittedDraftName)
      assert.equal(sentDraft.email,ownerReviewedDraft.email)
      assert.match(sentDraft.submitted_application_id,/^daapp_[0-9a-f]{32}$/)
      const [submittedApplication]=await q(`select id,status,seller_id,person_id
        from da_store_application where id=$1`,[sentDraft.submitted_application_id])
      assert.equal(submittedApplication.id,sentDraft.submitted_application_id)
      assert.equal(submittedApplication.status,"created")
      assert.equal(submittedApplication.person_id,ownerPersonId)
      assert.match(submittedApplication.seller_id,/^sel_[A-Za-z0-9_-]+$/)
      const [sellerFromDraft]=await native.listSellers({id:submittedApplication.seller_id})
      assert.equal(sellerFromDraft.name,ownerReviewedDraft.name)
      assert.equal(sellerFromDraft.status,"pending_approval")
      assert.equal(sellerFromDraft.approved_at,null)
      const submittedAudit=await q(`select e.actor_person_id,e.new_values,x.id as outbox_id
        from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
        where e.action='organization.store_application_created'
          and e.organization_id=$1 and e.target_id=$2`,
        [organizations[1].id,submittedApplication.seller_id])
      assert.equal(submittedAudit.length,1)
      assert.equal(submittedAudit[0].actor_person_id,ownerPersonId)
      assert.equal(submittedAudit[0].new_values.draft_id,ownerReviewedDraft.id)
      assert.equal(submittedAudit[0].new_values.draft_version,1)
      const ownerDraftPost=async(id:string,version:number)=>
        reviewer.callFunction("async function(org,draft,app,ver){"+
          "const s=await(await fetch('/personal/session')).json();"+
          "const r=await fetch('/organization/store-applications',{method:'POST',"+
          "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
          "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:draft,"+
          "expected_version:Number(ver),application_id:app})});"+
          "return {status:r.status,body:await r.json()}}",
          organizations[1].id,ownerReviewedDraft.id,id,String(version))
      const repeatDraft=await ownerDraftPost(submittedApplication.id,1)
      assert.equal(repeatDraft.status,200)
      assert.equal(repeatDraft.body.seller_id,submittedApplication.seller_id)
      assert.equal((await ownerDraftPost("daapp_"+randomBytes(16).toString("hex"),1)).status,409,
        "A different request ID cannot create a second Seller from one draft")
      assert.equal((await ownerDraftPost(submittedApplication.id,2)).status,409,
        "Stale draft version may not reuse a successful submission")
      assert.equal((await q(`select count(*)::int n from da_store_application
        where organization_id=$1`,[organizations[1].id]))[0].n,1)
      assert.equal((await q(`select count(*)::int n from da_organization_seller_ownership
        where organization_id=$1 and seller_id=$2 and revoked_at is null`,
        [organizations[1].id,submittedApplication.seller_id]))[0].n,1)
      process.stdout.write("PASS B22 Chrome: revoked Member's preserved Store draft submitted once by fresh-MFA protected Owner through native Mercur; duplicate/stale/CSRF/Member denied, PG16 draft/app/ownership/audit/outbox persisted, Seller pending only\n")
      await verifyStoreDraftSubmissionNegativePaths(
        reviewer,browser,organizations[1].id,ownerPersonId,
        secondPersonId,connectionString,q)
      await reviewer.select(organizations[0].name,"member")

 }
 

/** Exact new Store-draft path, live same-origin HTTPS + task-owned PG16.
 * Only disposable CI fixtures may change, and all fault injection is removed.
 * No free-text personal data or bearer/session secrets enter the logs.
 */
/** #280: The first real Owner HTTPS submission previously committed a
 * creating/submitting claim. Reproduce its native completion lock footprint
 * in real PostgreSQL while a different, separately authenticated Owner POSTs
 * that SAME ID. Only task-owned PG fixtures are changed, then restored.
 */
export async function verifyTwoOwnersStoreDraftApplicationLockOrder(input:{
  browser:B06Chrome;otherOwnerId:string;organizationId:string;
  draftId:string;applicationId:string;email:string;connectionString:string;
  q:(sql:string,params?:unknown[])=>Promise<any[]>
}):Promise<void>{
  const {browser,otherOwnerId,organizationId,draftId,applicationId,email,connectionString,q}=input
  const [claim]=await q("select id,person_id,status,seller_id from da_store_application where id=$1",[applicationId])
  assert.ok(claim&&claim.person_id!==otherOwnerId&&claim.status==="creating"&&claim.seller_id===null)
  const [draft]=await q("select status,submitted_application_id,version from da_store_application_draft where id=$1",[draftId])
  assert.deepEqual(draft,{status:"submitting",submitted_application_id:applicationId,version:1})
  const [membership]=await q(`select id,role,protected_owner from da_organization_membership
    where organization_id=$1 and person_id=$2 and status='active' and revoked_at is null
      and deleted_at is null`,[organizationId,otherOwnerId])
  assert.ok(membership&&["admin","member"].includes(membership.role)&&
    membership.protected_owner===false,
    "Second actor must have an existing, unprotected role in isolated PG16")
  const before=await q(`select
    (select count(*)::int from seller where email=$1) as sellers,
    (select count(*)::int from da_audit_event where action='organization.store_application_created'
      and new_values->>'draft_id'=$2) as completed_audits,
    (select count(*)::int from da_organization_seller_ownership where organization_id=$3) as origins`,
    [email,draftId,organizationId])
  const barrier=new Client({connectionString})
  let connected=false,held=false,started=false,promoted=false
  try{
    const changed=await q(`update da_organization_membership
      set role='owner',protected_owner=true,updated_at=clock_timestamp()
      where id=$1 and role=$2 and protected_owner=false and status='active'
        and revoked_at is null returning id`,[membership.id,membership.role])
    assert.equal(changed.length,1)
    promoted=true
    // Actual live membership authorization, not just a synthetic Owner label.
    const visible=await browser.callFunction(
      "async function(org){const r=await fetch('/organization/store-applications?organization_id='+"+
      "encodeURIComponent(org),{cache:'no-store'});return {status:r.status,body:await r.json()}}",
      organizationId)
    assert.equal(visible.status,200,"Second independently signed-in Owner must be authorized")
    assert.equal(visible.body.draft_role,"owner")
    await barrier.connect();connected=true
    await barrier.query("BEGIN");held=true
    // Same application SHARE lock held across native Mercur Seller creation
    // by personalWithStoreApplicationOwnerLock (not a mock DB lock).
    const retained=await barrier.query(
      "select id from da_store_application where id=$1 for share",[applicationId])
    assert.equal(retained.rows.length,1)
    await browser.callFunction(
      "async function(org,draft,app){"+
      "const session=await(await fetch('/personal/session')).json();"+
      "globalThis.__b22OwnerSameAppRace=fetch('/organization/store-applications',"+
      "{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({action:'submit_draft',organization_id:org,draft_id:draft,"+
      "expected_version:1,application_id:app}),signal:AbortSignal.timeout(45000)})"+
      ".then(async r=>({status:r.status,body:await r.json()}));return true}",
      organizationId,draftId,applicationId)
    started=true
    await until(async()=>{
      const [wait]=await q(`select count(*)::int n from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and query ilike '%select * from da_store_application where id=%for update%'`)
      return Number(wait.n)>=1
    },15000,"#280 different Owner real HTTPS POST must wait on application before draft")
    // If reserve still takes the draft first, NOWAIT here fails 55P03:
    // that recreates the actual native-finish deadlock edge.
    const available=await barrier.query(
      "select id from da_store_application_draft where id=$1 for update nowait",[draftId])
    assert.equal(available.rows.length,1)
    await barrier.query("ROLLBACK");held=false
    const result=await browser.eval("globalThis.__b22OwnerSameAppRace")
    assert.equal(result.status,403,
      "Different Owner must not claim the first Owner's committed request ID")
    assert.deepEqual(await q("select id,person_id,status,seller_id from da_store_application where id=$1",[applicationId]),[claim])
    assert.deepEqual(await q("select status,submitted_application_id,version from da_store_application_draft where id=$1",[draftId]),[draft])
    assert.deepEqual(await q(`select
      (select count(*)::int from seller where email=$1) as sellers,
      (select count(*)::int from da_audit_event where action='organization.store_application_created'
        and new_values->>'draft_id'=$2) as completed_audits,
      (select count(*)::int from da_organization_seller_ownership where organization_id=$3) as origins`,
      [email,draftId,organizationId]),before,
      "The losing Owner must not create a Seller, Origin or canonical audit")
    process.stdout.write("PASS B22 Chrome/PG16: two distinct protected Owners same draft/application ID; second HTTPS reserve waits application row before draft; first native claim finish draft NOWAIT free; loser403, creating/submitting and Seller/audit unchanged\n")
  }finally{
    if(held)await barrier.query("ROLLBACK")
    if(started)await browser.eval(
      "Promise.allSettled([globalThis.__b22OwnerSameAppRace])").catch(()=>{})
    if(connected)await barrier.end()
    if(promoted){
      const restored=await q(`update da_organization_membership
        set role=$2,protected_owner=false,updated_at=clock_timestamp()
        where id=$1 and role='owner' and protected_owner=true returning id`,
        [membership.id,membership.role])
      assert.equal(restored.length,1,"Restore the exact original task-only role")
    }
  }
}

export async function verifyStoreDraftSubmissionNegativePaths(
  reviewer:B06Chrome,browser:B06Chrome,organizationId:string,ownerId:string,
  otherOwnerId:string,connectionString:string,
  q:(sql:string,params?:unknown[])=>Promise<any[]>
):Promise<void>{
  assert.match(organizationId,/^daorg_[A-Za-z0-9_-]{1,80}$/)
  const stamp=randomBytes(7).toString("hex")
  const post=async(payload:Record<string,unknown>)=>
    reviewer.callFunction("async function(json){"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/organization/store-applications',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},"+
      "body:json});return {status:r.status,body:await r.json()}}",
      JSON.stringify(payload))
  const createDraft=async(label:string)=>{
    const draftId="dasdraft_"+randomBytes(16).toString("hex")
    const name="B22 "+label+" "+stamp
    const email="b22-"+label+"-"+stamp+"@example.invalid"
    const saved=await post({action:"save_draft",organization_id:organizationId,
      draft_id:draftId,expected_version:0,name,email,currency_code:"try"})
    assert.equal(saved.status,201,"Real HTTPS draft save for "+label)
    assert.equal(saved.body.draft_id,draftId)
    assert.equal(saved.body.version,1)
    return {draftId,name,email}
  }
  const submit=(draftId:string,version:number,applicationId:string)=>({
    action:"submit_draft",organization_id:organizationId,
    draft_id:draftId,expected_version:version,application_id:applicationId
  })
  const nativeCount=async(email:string)=>Number((await q(
    "select count(*)::int n from seller where email=$1",[email]))[0].n)

  // A real draft update wins BEFORE an old Owner form is submitted.
  const contested=await createDraft("stale")
  const latestName="B22 updated "+stamp
  const update=await post({action:"save_draft",organization_id:organizationId,
    draft_id:contested.draftId,expected_version:1,
    name:latestName,email:contested.email,currency_code:"try"})
  assert.equal(update.status,200)
  assert.equal(update.body.version,2)
  const staleApplication="daapp_"+randomBytes(16).toString("hex")
  const stale=await post(submit(contested.draftId,1,staleApplication))
  assert.equal(stale.status,409,"Updated draft must reject stale Owner snapshot")
  assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
    [staleApplication]))[0].n,0)
  assert.equal(await nativeCount(contested.email),0)
  assert.deepEqual(await q(
    "select name,version,status from da_store_application_draft where id=$1",
    [contested.draftId]),[{name:latestName,version:2,status:"draft"}])
  assert.equal((await q("select count(*)::int n from da_audit_event where action='organization.store_application_created' and new_values->>'draft_id'=$1",
    [contested.draftId]))[0].n,0)

  // Two distinct one-time application IDs are dispatched concurrently in
  // separate native HTTPS fetch operations; the draft is not pre-claimed.
  const appOne="daapp_"+randomBytes(16).toString("hex")
  const appTwo="daapp_"+randomBytes(16).toString("hex")
  const attempts=await reviewer.callFunction(
    "async function(left,right){const s=await(await fetch('/personal/session')).json();"+
    "const send=async body=>{const r=await fetch('/organization/store-applications',"+
    "{method:'POST',headers:{'content-type':'application/json',"+
    "'x-csrf-token':s.csrf_token},body});return {status:r.status,body:await r.json()}};"+
    "return Promise.all([send(left),send(right)])}",
    JSON.stringify(submit(contested.draftId,2,appOne)),
    JSON.stringify(submit(contested.draftId,2,appTwo)))
  assert.deepEqual(attempts.map((v:any)=>v.status).sort((a:number,b:number)=>a-b),
    [201,409],"Concurrent distinct application keys must produce only one success")
  const winner=attempts.find((v:any)=>v.status===201)
  assert.ok(winner&&[appOne,appTwo].includes(winner.body.application_id))
  assert.equal(winner.body.status,"pending_approval")
  const applications=await q("select id,status,seller_id from da_store_application where id=$1 or id=$2",
    [appOne,appTwo])
  assert.equal(applications.length,1)
  assert.equal(applications[0].id,winner.body.application_id)
  assert.equal(applications[0].status,"created")
  assert.equal(await nativeCount(contested.email),1)
  assert.deepEqual(await q("select status,version,submitted_application_id from da_store_application_draft where id=$1",
    [contested.draftId]),[{
    status:"submitted",version:2,submitted_application_id:winner.body.application_id
  }])
  const [seller]=await q("select status,approved_at from seller where id=$1",
    [applications[0].seller_id])
  assert.equal(seller.status,"pending_approval")
  assert.equal(seller.approved_at,null)
  assert.equal((await q("select count(*)::int n from da_organization_seller_ownership where organization_id=$1 and seller_id=$2 and revoked_at is null",
    [organizationId,applications[0].seller_id]))[0].n,1)
  assert.equal((await q("select count(*)::int n from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id where e.action='organization.store_application_created' and e.new_values->>'draft_id'=$1",
    [contested.draftId]))[0].n,1)
  process.stdout.write("PASS B22 Chrome/PG16: before-submit stale draft409/zero Seller; concurrent distinct application keys 201+409, one native pending Seller and one durable Origin/audit/outbox\n")

  // Expire only this genuine Owner's second-factor proof. Restore precisely
  // the original stored timestamp after the negative request; no fake login.
  const expiredDraft=await createDraft("expired")
  const deniedApp="daapp_"+randomBytes(16).toString("hex")
  const token=await reviewer.token()
  assert.match(token??"",/^[A-Za-z0-9_-]{43}$/)
  const sessionId=createHash("sha256").update(token!).digest("hex")
  const [session]=await q(
    "select person_id,status,mfa_purpose,last_strong_auth_at from da_browser_session where id=$1",
    [sessionId])
  assert.ok(session)
  assert.equal(session.person_id,ownerId)
  assert.equal(session.status,"active")
  assert.equal(session.mfa_purpose,"full")
  assert.ok(session.last_strong_auth_at)
  try{
    await q("update da_browser_session set last_strong_auth_at=clock_timestamp()-interval '20 minutes' where id=$1",
      [sessionId])
    const noMfa=await post(submit(expiredDraft.draftId,1,deniedApp))
    assert.equal(noMfa.status,403,"Owner with expired strong proof cannot send draft")
    assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
      [deniedApp]))[0].n,0)
    assert.equal(await nativeCount(expiredDraft.email),0)
  }finally{
    await q("update da_browser_session set last_strong_auth_at=$2 where id=$1",
      [sessionId,session.last_strong_auth_at])
  }
  const [policy]=await q("select store_application_enabled from da_organization where id=$1",
    [organizationId])
  assert.equal(policy.store_application_enabled,true)
  try{
    await q("update da_organization set store_application_enabled=false where id=$1",
      [organizationId])
    const deniedPolicy=await post(submit(expiredDraft.draftId,1,deniedApp))
    assert.equal(deniedPolicy.status,403,
      "Company policy suspension must bar this exact saved-draft endpoint")
  }finally{
    await q("update da_organization set store_application_enabled=$2 where id=$1",
      [organizationId,policy.store_application_enabled])
  }
  assert.equal((await q("select count(*)::int n from da_store_application where id=$1",
    [deniedApp]))[0].n,0)
  assert.equal(await nativeCount(expiredDraft.email),0)
  assert.deepEqual(await q("select status,version from da_store_application_draft where id=$1",
    [expiredDraft.draftId]),[{status:"draft",version:1}])
  process.stdout.write("PASS B22 Chrome/PG16: genuine Owner's expired strong proof and temporarily disabled company policy deny same draft with 403, zero native Seller and unchanged private draft\n")

  // Force failure AFTER the existing Mercur native Seller workflow reaches
  // Foundation's ownership finalization. The committed 'creating' claim must
  // survive even when native Seller rollback/commit outcome is uncertain.
  const uncertainDraft=await createDraft("uncertain")
  const uncertainApp="daapp_"+randomBytes(16).toString("hex")
  const faultFunction="b22_owner_draft_finish_fault_v1"
  let functionInstalled=false,triggerInstalled=false
  try{
    await q("create function "+faultFunction+
      "() returns trigger language plpgsql as $b22$ begin "+
      "if NEW.organization_id='"+organizationId+"' then "+
      "raise exception 'B22 isolated native Seller finalization interruption'; "+
      "end if; return NEW; end $b22$")
    functionInstalled=true
    await q("create trigger "+faultFunction+
      " before insert on da_organization_seller_ownership for each row execute function "+
      faultFunction+"()")
    triggerInstalled=true
    const interrupted=await post(submit(uncertainDraft.draftId,1,uncertainApp))
    assert.equal(interrupted.status,503,
      "Native Seller completion interrupted after creating claim must be uncertain")
    assert.equal(interrupted.body.message,"Outcome uncertain; check application status")
  }finally{
    if(triggerInstalled)await q("drop trigger if exists "+faultFunction+
      " on da_organization_seller_ownership")
    if(functionInstalled)await q("drop function if exists "+faultFunction+"()")
  }
  assert.deepEqual(await q("select status,seller_id from da_store_application where id=$1",
    [uncertainApp]),[{status:"creating",seller_id:null}])
  assert.deepEqual(await q("select status,submitted_application_id from da_store_application_draft where id=$1",
    [uncertainDraft.draftId]),[{status:"submitting",submitted_application_id:uncertainApp}])
  const uncertainNativeCount=await nativeCount(uncertainDraft.email)
  assert.ok(uncertainNativeCount<=1,"Interrupted native Seller has no duplicates")
  const sameRetry=await post(submit(uncertainDraft.draftId,1,uncertainApp))
  const alternateRetry=await post(submit(uncertainDraft.draftId,1,
    "daapp_"+randomBytes(16).toString("hex")))
  assert.equal(sameRetry.status,409,"Committed creating claim must block blind retry")
  assert.equal(alternateRetry.status,409,"Uncertain draft cannot create Seller from alternate ID")
  assert.equal(await nativeCount(uncertainDraft.email),uncertainNativeCount)
  assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1 and id=$2",
    [organizationId,uncertainApp]))[0].n,1)
  assert.equal((await q("select count(*)::int n from da_audit_event where action='organization.store_application_created' and new_values->>'draft_id'=$1",
    [uncertainDraft.draftId]))[0].n,0)
  await verifyTwoOwnersStoreDraftApplicationLockOrder({
    browser,otherOwnerId,organizationId,draftId:uncertainDraft.draftId,
    applicationId:uncertainApp,email:uncertainDraft.email,connectionString,q
  })
  process.stdout.write("PASS B22 Chrome/PG16: injected native Seller finalization interruption 503, durable creating/submitting, same/different retry409, no duplicate Seller, fault trigger removed\n")
}

/** Only disposable B22 CI fixtures: native Mercur Seller, existing Foundation
 * Origin chain and real Chrome first-party Staff/Owner sessions. No production
 * Seller or protected data is touched.
 */
export async function verifyReasonedStoreRejectionDuringPause(x:{
  reviewer:B06Chrome;browser:B06Chrome;native:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  org:string;orgName:string;ownerId:string;ownerActor:string;
  memberId:string;authIdentityId:string;rand:string
}){
  const {reviewer,browser,native,q}=x
  const reason="B22 synthetic rejected pending Store: required details are incomplete"
  const [seller]=await native.createSellers([{
    name:"B22 reasoned rejection "+x.rand,
    email:"b22-reject-"+x.rand+"@example.invalid",currency_code:"try"
  }])
  assert.ok(seller?.id)
  assert.equal(seller.status,"pending_approval")
  const app="daapp_"+randomBytes(16).toString("hex")
  await q(`insert into da_store_application
    (id,organization_id,person_id,member_actor_id,member_auth_identity_id,
     request_fingerprint,status,seller_id)
    values($1,$2,$3,$4,$5,repeat('a',64),'created',$6)`,
    [app,x.org,x.ownerId,x.memberId,x.authIdentityId,seller.id])
  const [origin]=await q(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,organization_id,action,module,
     resource,target_id,role_context,new_values,occurred_at)
    values('daaud_'||gen_random_uuid()::text,$1,'user',$2,$3,
      'organization.store_application_created','dogruadres-access',
      'store-application',$4,'owner',
      jsonb_build_object('application_id',$5::text,'status','pending_approval'),
      clock_timestamp()) returning id`,
    [x.ownerId,x.ownerActor,x.org,seller.id,app])
  assert.ok(origin?.id)
  await q(`insert into da_audit_outbox
    (id,source_audit_event_id,source_module,envelope)
    values('daaob_'||gen_random_uuid()::text,$1,'dogruadres-access','{}'::jsonb)`,
    [origin.id])
  await q(`insert into da_organization_seller_ownership
    (id,organization_id,seller_id,verification_audit_event_id,verified_at)
    values('daown_'||gen_random_uuid()::text,$1,$2,$3,clock_timestamp())`,
    [x.org,seller.id,origin.id])

  const direct=async(client:B06Chrome,body:object,invalidCsrf=false)=>
    client.callFunction("async function(body,invalid){"+
      "const session=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/platform/stores',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':"+
      "(invalid==='true'?'invalid':session.csrf_token)},body:body});"+
      "return {status:r.status,body:await r.json()}}",
      JSON.stringify(body),invalidCsrf?"true":"false")
  const target={application_id:app,seller_id:seller.id}
  assert.equal((await direct(browser,{...target,action:"reject",reason})).status,403,
    "Organization Owner cannot review or reject its own Store")
  assert.equal((await direct(reviewer,{...target,action:"reject",reason:"short"})).status,400)
  assert.equal((await direct(reviewer,{...target,action:"reject",reason},true)).status,403)
  assert.equal((await native.listSellers({id:seller.id}))[0].status,"pending_approval")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  await reviewer.click("#store-approval-refresh")
  await reviewer.wait("document.querySelector('#store-approval-list p')?.textContent.includes("+JSON.stringify(seller.name)+")")
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button')?.disabled"),true,
    "Approval is paused even though reasoned rejection is permitted")
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button[data-store-reject]')?.disabled"),false)
  // Let the real POST complete, then corrupt only its browser-visible 200
  // body. This proves the native decision persists while the UI refuses a
  // blind second write. The disposable CI page is the only interception scope.
  await reviewer.eval(`(()=>{
    const original=window.fetch;
    window.__b22RejectOriginalFetch=original;
    window.__b22RejectPostCount=0;
    window.fetch=async(...args)=>{
      const url=String(args[0]),method=args[1]?.method;
      if(url!=='/platform/stores'||method!=='POST')
        return original(...args);
      window.__b22RejectPostCount++;
      const response=await original(...args);
      if(response.status!==200)return response;
      return new Response('{broken JSON',{
        status:200,headers:{'content-type':'application/json'}
      });
    };
  })()`)
  await reviewer.input("#store-approval-list p textarea",reason)
  await reviewer.click("#store-approval-list p button[data-store-reject]")
  await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('Ret sonucu belirsiz')")
  assert.equal(await reviewer.eval("window.__b22RejectPostCount"),1)
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button[data-store-reject]').disabled"),true,
    "Malformed success response must keep the rejection action disabled")
  assert.equal(await reviewer.eval("document.querySelector('#store-approval-list p button').disabled"),true,
    "Malformed success response must keep approval disabled too")
  assert.equal(await reviewer.eval("window.__b22RejectPostCount"),1,
    "Chrome must not issue a second Store decision")
  // The injection is disposable: restore the genuine browser transport
  // before subsequent unrelated platform decision scenarios execute.
  await reviewer.eval("(()=>{window.fetch=window.__b22RejectOriginalFetch;"+
    "delete window.__b22RejectOriginalFetch;return true})()")
  const [terminated]=await native.listSellers({id:seller.id})
  assert.equal(terminated.status,"terminated")
  assert.equal(terminated.status_reason,reason)
  assert.equal(terminated.approved_at,null)
  assert.equal((await native.listSellers({id:seller.id}))[0].status,"terminated")
  assert.equal((await direct(reviewer,{...target,action:"reject",reason})).status,409,
    "A terminally rejected Seller cannot be rejected a second time")
  assert.equal((await direct(reviewer,target)).status,409,
    "The same rejected Seller cannot later be approved")
  const audits=await q(`select e.actor_person_id,e.new_values,x.id as outbox_id
    from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
    where e.action='organization.store_application_rejected'
      and e.organization_id=$1 and e.target_id=$2`,[x.org,seller.id])
  assert.equal(audits.length,1)
  assert.notEqual(audits[0].actor_person_id,x.ownerId,"Staff is not Organization Owner")
  assert.equal(audits[0].new_values.reason,reason)
  assert.equal(audits[0].new_values.status,"terminated")
  assert.ok(audits[0].outbox_id)
  const [recipientCount]=await q(`select count(*)::int n from da_notification_receipt n
    join da_audit_event e on e.id=n.audit_event_id
    where e.action='organization.store_application_rejected'
      and e.organization_id=$1 and e.target_id=$2`,[x.org,seller.id])
  const [eligibleOwners]=await q(`select count(*)::int n from da_organization_membership m
    join da_person p on p.id=m.person_id
    where m.organization_id=$1 and m.role='owner' and m.protected_owner=true
      and m.status='active' and m.deleted_at is null
      and p.disabled_at is null and p.deleted_at is null`,[x.org])
  assert.equal(recipientCount.n,eligibleOwners.n,
    "One private receipt for each active protected Owner, none for other Members")
  await browser.send("Page.bringToFront")
  const owner=await browser.callFunction("async function(org){"+
    "const r=await fetch('/organization/store-applications?organization_id='+encodeURIComponent(org));"+
    "return {status:r.status,body:await r.json()}}",x.org)
  assert.equal(owner.status,200)
  const match=owner.body.applications.find((a:any)=>a.id===app)
  assert.ok(match)
  assert.equal(match.seller_status,"terminated")
  assert.equal(match.rejection_reason,reason)
  const notice=await browser.callFunction("async function(org){"+
    "const r=await fetch('/organization/notifications?organization='+encodeURIComponent(org));"+
    "return {status:r.status,body:await r.json()}}",x.org)
  assert.equal(notice.status,200)
  assert.equal(notice.body.notifications.filter((n:any)=>
    n.title==="Mağaza başvurusu reddedildi"&&n.context===x.orgName).length,1)
  assert.equal(JSON.stringify(notice.body).includes(reason),false,
    "A private alert must not copy arbitrary staff reason text")
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  // An uncertain successful write must be reconciled with a fresh
  // authorized GET. Its terminated Seller must disappear from the
  // pending-review UI; there must be no retry of the write.
  await reviewer.click("#store-approval-refresh")
  await reviewer.wait("!document.getElementById('store-approval-list').textContent.includes("+JSON.stringify(seller.id)+")")
  assert.equal(await reviewer.eval("window.__b22RejectPostCount"),1,
    "Readback must not issue another platform Store decision")
  // P1 #323: a historical application must not confer live Seller status
  // after its Organization↔Seller provenance is revoked. Use the same signed-in
  // Owner and real HTTPS GET backed by this disposable native PG16 database.
  const liveOwnership=await q(`select id,revoked_at from da_organization_seller_ownership
    where organization_id=$1 and seller_id=$2`,[x.org,seller.id])
  assert.equal(liveOwnership.length,1)
  assert.equal(liveOwnership[0].revoked_at,null)
  const beforeRevocationAudit=(await q(`select count(*)::int n from da_audit_event
    where organization_id=$1 and target_id=$2`,[x.org,seller.id]))[0].n
  assert.equal((await q(`update da_organization_seller_ownership
    set revoked_at=clock_timestamp()
    where id=$1 and revoked_at is null returning id`,[liveOwnership[0].id])).length,1)
  try{
    const historical=await browser.callFunction("async function(org){"+
      "const r=await fetch('/organization/store-applications?organization_id='+encodeURIComponent(org),{cache:'no-store'});"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}}",x.org)
    assert.equal(historical.status,200)
    assert.match(String(historical.cache),/no-store/)
    const old=historical.body.applications.find((a:any)=>a.id===app)
    assert.ok(old,"Past Organization application must remain readable")
    assert.equal(old.status,"created")
    assert.equal(old.seller_id,seller.id)
    assert.equal(old.seller_status,"unknown",
      "Revoked ownership must not reveal the native Seller status")
    assert.equal(old.rejection_reason,null,
      "Revoked ownership must not reveal the native private rejection reason")
    assert.ok(!JSON.stringify(historical.body).includes(reason))
    assert.ok(!JSON.stringify(historical.body).includes("live_seller_authorized"))
    const actual=(await native.listSellers({id:seller.id}))[0]
    assert.equal(actual.status,"terminated","Native Seller status remains unchanged")
    assert.equal(actual.status_reason,reason,"Private canonical reason is not erased")

    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.click("#store-applications-refresh")
    await browser.wait("document.getElementById('store-application-list')?.textContent.includes('Başvurunun güncel mağaza sonucu doğrulanamadı')")
    const text=String(await browser.eval("document.getElementById('store-application-list').textContent"))
    assert.ok(text.includes(app),"Real Owner UI retains the historical application")
    assert.equal(text.includes(reason),false,"Real Owner UI must not render former Seller's private reason")
    assert.equal(text.includes("Mağaza başvurusu reddedildi"),false,
      "Real Owner UI must not show the now-unowned Store's native terminal result")
    const after=(await q(`select count(*)::int n from da_audit_event
      where organization_id=$1 and target_id=$2`,[x.org,seller.id]))[0].n
    assert.equal(after,beforeRevocationAudit,"Read-only forbidden status path creates zero audit writes")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: revoked Store ownership preserves historical application but hides live Seller status and private rejection reason in Owner HTTP and UI; no new audit\n")
  }finally{
    // Restore ONLY the temporary fixture for unrelated acceptance below.
    assert.equal((await q(`update da_organization_seller_ownership
      set revoked_at=null where id=$1 and revoked_at is not null
      returning id`,[liveOwnership[0].id])).length,1)
  }
  const reauthorized=await browser.callFunction("async function(org){"+
    "const r=await fetch('/organization/store-applications?organization_id='+encodeURIComponent(org),{cache:'no-store'});"+
    "return {status:r.status,body:await r.json()}}",x.org)
  assert.equal(reauthorized.status,200)
  const restored=reauthorized.body.applications.find((a:any)=>a.id===app)
  assert.ok(restored)
  assert.equal(restored.seller_status,"terminated")
  assert.equal(restored.rejection_reason,reason,
    "Only the currently verified Owner may resume private native status reads")
  // The real Owner UI test above necessarily foregrounds a different
  // first-party session. Staff panels fail closed while backgrounded; restore
  // their authorized visible state before the caller resumes policy review.
  await reviewer.send("Page.bringToFront")
  await reviewer.wait("document.visibilityState==='visible'")
  if(!await reviewer.eval("!document.getElementById('workspace').hidden && "+
      "!document.getElementById('platform-store-policy-panel').hidden")){
    // A page reload restores the authenticated workspace, NOT a panel that
    // the product intentionally initializes hidden. Do not bypass the
    // session/privacy guard or directly alter DOM.hidden. A real Staff
    // user must reopen the policy panel with the existing native UI button.
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible' && "+
      "!document.getElementById('workspace').hidden")
    if(await reviewer.eval("document.getElementById('platform-store-policy-panel').hidden")){
      await reviewer.click("#platform-store-policy-open")
      await reviewer.wait("!document.getElementById('platform-store-policy-panel').hidden")
    }
  }
  // P2 #325: same production proof SQL against 51 unrelated, fully
  // source-backed current Store associations in disposable PostgreSQL 16.
  // All fixture writes roll back: no native Seller, payment or live data.
  await q("begin")
  try{
    const [actor]=await q(`select actor_person_id,actor_type,actor_id
      from da_audit_event
      where action='organization.store_application_rejected'
        and organization_id=$1 and target_id=$2
      order by occurred_at desc limit 1`,[x.org,seller.id])
    assert.ok(actor?.actor_person_id&&actor?.actor_type&&actor?.actor_id)
    const fixtures=await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,
       module,resource,target_id,role_context,new_values,occurred_at)
      select 'daaud_'||gen_random_uuid()::text,$1,$2,$3,$4,
        'organization.store_association_approved','dogruadres-access',
        'store-association','sel_b22_scale_'||n::text,'platform_staff',
        '{}'::jsonb,clock_timestamp()
      from generate_series(1,51) n returning id,target_id`,
      [actor.actor_person_id,actor.actor_type,actor.actor_id,x.org])
    assert.equal(fixtures.length,51)
    const eventIds=fixtures.map(row=>row.id)
    const outbox=await q(`insert into da_audit_outbox
      (id,source_audit_event_id,source_module,envelope)
      select 'daaob_'||gen_random_uuid()::text,e.id,
        'dogruadres-access','{}'::jsonb
      from da_audit_event e where e.id=any($1::text[])
      returning id`,[eventIds])
    assert.equal(outbox.length,51)
    const related=await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      select 'daown_'||gen_random_uuid()::text,e.organization_id,
        e.target_id,e.id,clock_timestamp()
      from da_audit_event e where e.id=any($1::text[])
      returning id`,[eventIds])
    assert.equal(related.length,51)
    const [{n:active}]=await q(`select count(*)::int n
      from da_organization_seller_ownership
      where organization_id=$1 and revoked_at is null`,[x.org])
    assert.ok(active>50)
    // Source helper uses '?' placeholders; translate for the real PG client
    // with a strict count, never concatenate user-supplied SQL arguments.
    const scopedDb={execute:(sql:string,values:unknown[]=[])=>{
      let index=0
      const pgSql=sql.replace(/\?/g,()=>"$"+(++index))
      assert.equal(index,values.length)
      return q(pgSql,values)
    }}
    await assert.rejects(platformApprovedSellerIds(scopedDb,x.org),
      IdentityAccessDenied,"Original unfiltered >50 guard remains fail-closed")
    assert.deepEqual(await platformApprovedSellerIds(scopedDb,x.org,[seller.id]),
      [seller.id],"Unrelated Store count cannot hide one current valid application")
    const removed=await q(`update da_organization_seller_ownership
      set revoked_at=clock_timestamp()
      where id=$1 and revoked_at is null returning id`,[liveOwnership[0].id])
    assert.equal(removed.length,1)
    assert.deepEqual(await platformApprovedSellerIds(scopedDb,x.org,[seller.id]),[],
      "Revoked candidate cannot reveal live native Seller status")
  }finally{
    await q("rollback")
  }
  const [restoredOrigin]=await q(`select revoked_at from da_organization_seller_ownership
    where id=$1`,[liveOwnership[0].id])
  assert.equal(restoredOrigin?.revoked_at,null,
    "The original verified ownership must survive the rolled-back scale probe")
  process.stdout.write("PASS B22 real PG16: 51 unrelated audited Store associations do not hide bounded historical Seller proof; revoked candidate denied; global guard retained and fixture rolled back\n")
  process.stdout.write("PASS B22 Chrome/PG16: protected platform Staff reasoned pending Seller rejection during company pause, native terminated without approval, private Owner status and redacted notice, one audit/outbox, Owner/CSRF/short reason/replay denied\n")
}

/** Separate test helper avoids TypeScript's huge-main control-flow limit.
 * Both HTTPS requests use the existing real Owner session and isolated PG16.
 */
export async function verifyConcurrentCrossOrganizationStoreNames(
  browser:B06Chrome,alphaOrgId:string,gammaOrgId:string,stamp:string,
  q:(sql:string,params?:unknown[])=>Promise<any[]>
):Promise<void>{
  // Two legitimate Owner-controlled legal Organizations race one unused name
  // using genuinely concurrent first-party HTTPS POSTs and distinct keys.
  const raceName="B22 crossorg name "+stamp
  const raceApplications=[
    {organization_id:alphaOrgId,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:raceName,email:"b22-race-alpha-"+stamp+"@example.invalid",
      currency_code:"try"},
    {organization_id:gammaOrgId,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:raceName.toUpperCase(),email:"b22-race-gamma-"+stamp+"@example.invalid",
      currency_code:"try"}
  ]
  const raceOutcomes=await browser.eval(`(async()=>{
    const session=await(await fetch('/personal/session')).json()
    return Promise.all(${JSON.stringify(raceApplications)}.map(async input=>{
      const response=await fetch('/organization/store-applications',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(input)
      })
      const body=await response.json()
      return {status:response.status,
        seller_id:typeof body.seller_id==='string'?body.seller_id:null}
    }))
  })()`)
  assert.deepEqual(raceOutcomes.map((x:any)=>x.status).sort((a:number,b:number)=>a-b),
    [201,409],"Only one competing cross-Organization POST may win")
  const winnerIndex=raceOutcomes.findIndex((x:any)=>x.status===201)
  assert.ok(winnerIndex===0||winnerIndex===1)
  const raceWinner=raceApplications[winnerIndex]
  const raceLoser=raceApplications[1-winnerIndex]
  const raceSellerId=raceOutcomes[winnerIndex].seller_id as string
  assert.match(raceSellerId,/^sel_[A-Za-z0-9_-]+$/)
  assert.equal(raceOutcomes[1-winnerIndex].seller_id,null)
  const raceClaims=await q(`select id,organization_id,status,seller_id
    from da_store_application where id=any($1::text[])`,
    [raceApplications.map(x=>x.application_id)])
  assert.equal(raceClaims.length,1,"Losing request cannot reserve a second application")
  assert.deepEqual(raceClaims[0],{
    id:raceWinner.application_id,organization_id:raceWinner.organization_id,
    status:"created",seller_id:raceSellerId
  })
  const raceNative=await q(`select id,status from seller where email=any($1::text[])`,
    [raceApplications.map(x=>x.email)])
  assert.equal(raceNative.length,1,"Exactly one native Mercur Seller must exist")
  assert.equal(raceNative[0].id,raceSellerId)
  assert.equal(raceNative[0].status,"pending_approval")
  const raceEvents=await q(`select e.id as audit_id,x.id as outbox_id,
    o.organization_id,o.seller_id
    from da_audit_event e
    join da_audit_outbox x on x.source_audit_event_id=e.id
    join da_organization_seller_ownership o on o.verification_audit_event_id=e.id
    where e.action='organization.store_application_created'
    and e.new_values->>'application_id'=any($1::text[])`,
    [raceApplications.map(x=>x.application_id)])
  assert.equal(raceEvents.length,1,
    "Only the winning Organization may have an Origin, audit and outbox")
  assert.equal(raceEvents[0].organization_id,raceWinner.organization_id)
  assert.equal(raceEvents[0].seller_id,raceSellerId)
  assert.ok(raceEvents[0].audit_id&&raceEvents[0].outbox_id)
  assert.equal((await q(`select count(*)::int n from da_audit_event
    where action='organization.store_application_created'
    and new_values->>'application_id'=$1`,[raceLoser.application_id]))[0].n,0,
    "Losing Organization must have zero successful Store creation audits")
  process.stdout.write("PASS B22 Chrome/PG16: simultaneous Alpha/Gamma normalized Store name 201+409; one native Seller, one durable application, Origin/audit/outbox, loser zero side effects\n")

}

/** Real authenticated HTTPS negative proof; test data is disposable PG16 only.
 * Kept outside the long main scenario to avoid TypeScript flow-size limits.
 */
export async function verifyInvisibleStoreNameRejection(
  browser:B06Chrome,org:string,stamp:string,
  q:(sql:string,params?:unknown[])=>Promise<any[]>
):Promise<void>{
  const invalidNames=["\u200B\u200B\u200B","\u00AD\u00AD\u00AD",
    "B22\u200B Store "+stamp,"B22\u2060 Store "+stamp,
    "B22\u200D Store "+stamp]
  for(const [index,name] of invalidNames.entries()){
    const id="daapp_"+randomBytes(16).toString("hex")
    const email="b22-invisible-"+index+"-"+stamp+"@example.invalid"
    const result=await browser.callFunction("async function(json){"+
      "const session=await(await fetch('/personal/session')).json();"+
      "const response=await fetch('/organization/store-applications',{"+
      "method:'POST',headers:{'content-type':'application/json',"+
      "'x-csrf-token':session.csrf_token},body:json});"+
      "return response.status}",JSON.stringify({
        organization_id:org,application_id:id,name,email,currency_code:"try"
      }))
    assert.equal(result,400,"Invisible name must fail before reservation")
    const rows=await q(`select
      (select count(*)::int from da_store_application where id=$1) as applications,
      (select count(*)::int from seller where email=$2) as sellers,
      (select count(*)::int from da_audit_event
        where new_values->>'application_id'=$1) as audits,
      (select count(*)::int from da_audit_outbox x
        join da_audit_event e on e.id=x.source_audit_event_id
        where e.new_values->>'application_id'=$1) as outboxes`,
      [id,email])
    assert.deepEqual(rows,[{applications:0,sellers:0,audits:0,outboxes:0}],
      "Rejected invisible name may not create durable side effects")
  }
  process.stdout.write("PASS B22 PG16/Chrome: invisible Store names HTTP400; zero application, native Seller, audit/outbox effects\n")
}


/** Isolated B22/DA-FIN-001 proof. A Seller-filtered Mercur OrderGroup
 * contains Orders for *other* Sellers. Use each canonical native Order→Seller
 * link; never infer Store financial scope from a group-level seller filter.
 * No production writer, payment provider, balance or finalizer is enabled.
 */
