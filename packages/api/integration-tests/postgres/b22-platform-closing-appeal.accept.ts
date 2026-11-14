/** B22 #252: real first-party Chrome/HTTPS/PG16 platform closing and Owner
 * appeal. Task-only actors and database. Timer and dispatch require independent
 * real scheduled-job evidence; finalizer is always disabled.
 */
import assert from "node:assert/strict"
import {createHash,randomBytes} from "node:crypto"
import {Client} from "@medusajs/framework/pg"
import {until} from "./b19-browser"
import {B06Chrome} from "./b06-ui-browser"
import {otp} from "./b19-browser"
import {runPlatformClosingEmailTick} from "../../src/jobs/dogruadres-platform-closing-email"

type Db=(sql:string,params?:unknown[])=>Promise<any[]>
const read=async(browser:B06Chrome,path:string)=>browser.callFunction(
  "async function(path){const r=await fetch(path,{cache:'no-store'});return {status:r.status,body:await r.json()}}",
  path)
const write=async(browser:B06Chrome,path:string,payload:unknown,badCsrf=false)=>
  browser.callFunction("async function(args){const v=JSON.parse(args);"+
  "const s=await(await fetch('/personal/session')).json();"+
  "const r=await fetch(v.path,{method:'POST',headers:{'content-type':'application/json',"+
  "'x-csrf-token':v.bad?'wrong':s.csrf_token},body:JSON.stringify(v.payload)});"+
  "return {status:r.status,body:await r.json()}}",
  JSON.stringify({path,payload,bad:badCsrf}))



/** #311 P1: same Chrome page, two separately authenticated native Persons.
 * The email-result DOM canary is intentionally synthetic; the protected
 * Owner's closing reason is obtained from the real authorized HTTPS GET.
 */
async function verifyCrossSessionClosingReason(input:{
  browser:B06Chrome;staff:B06Chrome;reason:string;ownerOrgName:string;
  foreignOrgName:string;privatePath:string;
  ownerEmail:string;ownerPassword:string;ownerPersonId:string;
  foreignEmail:string;foreignPassword:string;foreignPersonId:string;
}):Promise<void>{
  const {browser,staff,reason,ownerOrgName,foreignOrgName,privatePath,
    ownerEmail,ownerPassword,ownerPersonId,
    foreignEmail,foreignPassword,foreignPersonId}=input
  assert.equal(await browser.eval("document.getElementById('store-platform-appeal-reason').textContent"),
    "Platform karar gerekçesi: "+reason)
  // Simulate only the previous authenticated email-result DOM rendering.
  // No mailbox delivery or appeal timer is triggered by this synthetic canary.
  await browser.eval("(()=>{const panel=document.getElementById('platform-closing-email-link-panel');"+
    "panel.hidden=false;document.getElementById('platform-closing-email-link-status').textContent="+
    JSON.stringify("Mağaza kapatma kararının gerekçesi: "+reason)+
    ";document.getElementById('platform-closing-email-link-open').hidden=true;return true})()")
  const assertCleared=async()=>{
    const state=await browser.eval("({"+
      "ownerReason:document.getElementById('store-platform-appeal-reason').textContent,"+
      "ownerHidden:document.getElementById('store-platform-appeal-panel').hidden,"+
      "mailReason:document.getElementById('platform-closing-email-link-status').textContent,"+
      "mailHidden:document.getElementById('platform-closing-email-link-panel').hidden,"+
      "bodyHasReason:document.body.textContent.includes("+JSON.stringify(reason)+")})")
    assert.deepEqual(state,{ownerReason:"",ownerHidden:true,
      mailReason:"",mailHidden:true,bodyHasReason:false},
      "No old private reason may survive in the page, even in hidden DOM")
  }
  const loginExisting=async(email:string,password:string,personId:string,
    otpSource:B06Chrome)=>{
    await browser.input("#login input[name=email]",email)
    await browser.input("#login input[name=password]",password)
    await browser.click("#login button")
    await browser.wait("!document.getElementById('challenge').hidden")
    await browser.input("#challenge input[name=code]",await otpSource.nextLoginOtp())
    await browser.click("#challenge button")
    await browser.wait("!document.getElementById('workspace').hidden&&"+
      "document.getElementById('person').textContent==="+JSON.stringify("Person: "+personId))
  }
  await browser.click("#logout")
  await browser.wait("!document.getElementById('login').hidden&&"+
    "document.getElementById('workspace').hidden")
  await assertCleared()
  // This private route deliberately uses 403 for missing or unauthorized
  // sessions, not a distinct 401 that could disclose authentication state.
  assert.equal((await read(browser,privatePath)).status,403,
    "Anonymous access must receive the route's existing generic denial")
  await loginExisting(foreignEmail,foreignPassword,foreignPersonId,staff)
  await assertCleared()
  assert.equal((await read(browser,privatePath)).status,403,
    "Other Person must not read the first Owner's private closing")
  await browser.select(foreignOrgName,"owner")
  await assertCleared()
  await browser.click("#logout")
  await browser.wait("!document.getElementById('login').hidden&&"+
    "document.getElementById('workspace').hidden")
  await assertCleared()
  await loginExisting(ownerEmail,ownerPassword,ownerPersonId,browser)
  await browser.select(ownerOrgName,"owner")
  await browser.wait("!document.getElementById('store-platform-appeal-panel').hidden&&"+
    "document.getElementById('store-platform-appeal-reason').textContent==="+
    JSON.stringify("Platform karar gerekçesi: "+reason))
  assert.equal((await read(browser,privatePath)).status,200,
    "Only a new authorized Owner GET restores the private reason")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: Owner A real private closing GET, same-page logout clears old reason and synthetic email-result DOM; Person B real password+MFA login sees no private text and Gamma GET403; Owner A fresh login re-reads authorized reason\n")
}


/**
 * #307 P2: the same native Person is both platform Staff and a protected
 * Store Owner. Force a real Seller advisory wait, then start Staff for that
 * Person. Staff must wait for session/epoch behind Owner rather than hold
 * session while also waiting on Seller. Both real HTTPS mutations are denied
 * for an already-closed Store; no private data or ledger write may change.
 */
async function verifyDualRolePlatformOwnerLockOrder(input:{
  staff:B06Chrome;q:Db;pgUrl:string;personId:string;
  organizationId:string;sellerId:string
}):Promise<void>{
  const {staff,q,pgUrl,organizationId,sellerId,personId}=input
  const ownerRead="/personal/store-owner-pause?"+
    new URLSearchParams({organization_id:organizationId,seller_id:sellerId})
  assert.equal((await read(staff,ownerRead)).status,200,
    "Real dual-role Staff Person independently has protected Owner access")
  assert.equal((await read(staff,"/personal/platform/store-closings")).status,200,
    "Same Person independently has strong platform closing grant")
  const cookie=await staff.token()
  assert.match(cookie??"",/^[A-Za-z0-9_-]{43}$/)
  const digest=createHash("sha256").update(cookie!).digest("hex")
  assert.deepEqual(await q(
    "select person_id,status from da_browser_session where id=$1",[digest]),
    [{person_id:personId,status:"active"}],
    "Both real role requests use the identical current active Person session")
  const csrf=await staff.callFunction(
    "async function(){const r=await fetch('/personal/session');"+
    "if(r.status!==200)throw Error('Missing live B22 Person session');"+
    "return (await r.json()).csrf_token}")
  assert.match(csrf,/^[A-Za-z0-9_-]{43}$/)
  const snapshot="select "+
    "(select count(*)::int from da_audit_event where target_id=$1) audits,"+
    "(select count(*)::int from da_audit_outbox x join da_audit_event e "+
      "on e.id=x.source_audit_event_id where e.target_id=$1) outbox,"+
    "(select count(*)::int from da_store_owner_pause where seller_id=$1) pauses,"+
    "(select count(*)::int from da_store_platform_closing where seller_id=$1) closings"
  const prior=await q(snapshot,[sellerId])
  assert.equal(prior.length,1)
  assert.equal(prior[0].closings,1,"Existing closing is safe negative fixture")
  const barrier=new Client({connectionString:pgUrl})
  let held=false,ownerStarted=false,staffStarted=false
  await barrier.connect()
  try{
    await staff.send("Page.bringToFront")
    await staff.wait("document.visibilityState==='visible'")
    await barrier.query("BEGIN");held=true
    const pid=(await barrier.query("select pg_backend_pid()::int pid")).rows[0].pid
    await barrier.query(
      "select pg_advisory_xact_lock(hashtext('b22-owner-pause'),hashtext($1))",
      [sellerId])
    const owner={organization_id:organizationId,seller_id:sellerId,
      action:"resume",request_id:"dasp_"+randomBytes(16).toString("hex"),
      expected_version:0}
    const staffPayload={organization_id:organizationId,seller_id:sellerId,
      request_id:"dascp_"+randomBytes(16).toString("hex"),
      reason:"B22 already closed: dual-authority concurrency must be denied"}
    const send=(path:string,payload:unknown)=>
      staff.callFunction("function(arg){const x=JSON.parse(arg);"+
        "const p=fetch(x.path,{method:'POST',headers:{'content-type':'application/json',"+
        "'x-csrf-token':x.csrf},body:JSON.stringify(x.payload),"+
        "signal:AbortSignal.timeout(45000)}).then(r=>r.status);"+
        "globalThis[x.result]=p;return true}",
        JSON.stringify({path,payload,csrf,
          result:path==="/personal/store-owner-pause"?
            "__daDualRoleOwner":"__daDualRoleStaff"}))
    await send("/personal/store-owner-pause",owner)
    ownerStarted=true
    const waitingAdvisory=async()=>Number((await q(
      "select count(*)::int n from pg_locks h join pg_locks w "+
      "on w.locktype=h.locktype and w.database=h.database "+
      "and w.classid=h.classid and w.objid=h.objid and "+
      "w.objsubid=h.objsubid and w.pid<>h.pid and w.granted=false "+
      "where h.pid=$1 and h.locktype='advisory' and h.granted=true",
      [pid]))[0].n)
    await until(async()=>await waitingAdvisory()===1,19000,
      "Owner HTTPS waits on Seller advisory with active Person session")
    await send("/personal/platform/store-closings",staffPayload)
    staffStarted=true
    await until(async()=>{
      const [w]=await q("select count(*)::int n from pg_stat_activity "+
        "where datname=current_database() and wait_event_type='Lock' "+
        "and query ilike '%from da_browser_session s%' and pid<>$1",[pid])
      return Number(w.n)>=1&&await waitingAdvisory()===1
    },19000,"Staff waits Person session; only Owner waits Seller lock")
    await barrier.query("COMMIT");held=false
    const statuses=await staff.eval(
      "Promise.all([globalThis.__daDualRoleOwner,globalThis.__daDualRoleStaff])")
    assert.deepEqual(statuses,[403,409],
      "Same Person returns Owner denial and Staff conflict, never 503/deadlock")
    const after=await q(snapshot,[sellerId])
    assert.deepEqual(after,prior,
      "Concurrent denied operations leave closure, audit and outbox unchanged")
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: same strong Person dual Staff/Owner, Owner Seller-lock wait before Staff session wait; HTTP403+409, no deadlock/503, closing/audit/outbox unchanged\n")
  }finally{
    if(held)await barrier.query("ROLLBACK")
    if(ownerStarted||staffStarted){
      await staff.eval("Promise.allSettled([globalThis.__daDualRoleOwner,globalThis.__daDualRoleStaff].filter(Boolean))").catch(()=>{})
      await staff.eval("delete globalThis.__daDualRoleOwner;delete globalThis.__daDualRoleStaff;true").catch(()=>{})
    }
    await barrier.end()
  }
}

/** Existing authorized Staff Chrome/HTTPS screen and accessible status. */
async function assertStaffBlockers(staff:B06Chrome,sellerId:string,
  shown:string,absent:string[]=[]){
  await staff.send("Page.bringToFront")
  await staff.send("Page.reload",{ignoreCache:true})
  await staff.wait("document.readyState==='complete' && "+
    "!document.getElementById('workspace').hidden && "+
    "!document.getElementById('platform-closing-panel').hidden")
  let found=false
  for(let page=0;page<50;page++){
    found=await staff.callFunction(
      "function(seller){const e=document.querySelector("+
      "'#platform-closing-form select[name=seller_id]');"+
      "if(!e||!Array.from(e.options).some(o=>o.value===seller))return false;"+
      "e.value=seller;e.dispatchEvent(new Event('change',{bubbles:true}));"+
      "return e.value===seller}",sellerId)
    if(found)break
    assert.equal(await staff.eval(
      "!document.getElementById('platform-closing-more').hidden"),true)
    await staff.click("#platform-closing-more")
    await staff.wait("document.getElementById('platform-closing-status').textContent!=="+
      JSON.stringify("Yetkili mağazalar doğrulanıyor…"))
  }
  assert.equal(found,true,"Staff picker must contain the approved Seller")
  await staff.wait("document.getElementById('platform-closing-mail-status')."+
    "textContent.includes("+JSON.stringify(shown)+")")
  const result=await staff.eval("(()=>{const e=document.getElementById("+
    "'platform-closing-mail-status');return {text:e.textContent,"+
    "role:e.getAttribute('role'),live:e.getAttribute('aria-live')}})()")
  assert.equal(result.role,"status")
  assert.equal(result.live,"polite")
  assert.match(result.text,/mali ve hukuki yükümlülüklerin temizlendiği doğrulanmadı/)
  assert.match(result.text,/geri dönüşsüz kapatma kapalıdır/)
  for(const text of absent)assert.equal(result.text.includes(text),false,
    "Irrelevant blocker must not be shown")
}

export async function verifyB22PlatformClosingAppeal(input:{
  browser:B06Chrome;staff:B06Chrome;q:Db;foundation:any;
  ownerPersonId:string;staffPersonId:string;
  ownerOrgId:string;ownerOrgName:string;sellerId:string;
  buyer:B06Chrome;buyerScopePath:string;buyerOrganizationId:string;
  checkoutCartId:string;customerId:string;query:any;auth:any;ownerEmail:string;
  ownerPassword:string;foreignEmail:string;foreignPassword:string;
  foreignPersonId:string;foreignOrgName:string;pgUrl:string;container:any
}):Promise<string>{
  const {browser,staff,q,foundation,ownerPersonId,staffPersonId,
    ownerOrgId,ownerOrgName,sellerId,buyer,buyerScopePath,
    buyerOrganizationId,checkoutCartId,customerId,query,auth,ownerEmail,
    ownerPassword,foreignEmail,foreignPassword,foreignPersonId,foreignOrgName,container}=input
  const path="/personal/platform/store-closings"
  const privatePath="/personal/store-platform-closing"
  const mailPath="/personal/platform/store-closing-email-readiness?"+
    new URLSearchParams({organization_id:ownerOrgId,seller_id:sellerId}).toString()
  const readPath=privatePath+"?"+new URLSearchParams({
    organization_id:ownerOrgId,seller_id:sellerId}).toString()
  const before=(await q("select id,status,name,handle from seller where id=$1",[sellerId]))[0]
  assert.equal(before?.id,sellerId)
  assert.equal(before?.status,"open","Source Store must be trading before Staff closes")
  const initialOwnerPause=await read(browser,"/personal/store-owner-pause?"+
    new URLSearchParams({organization_id:ownerOrgId,seller_id:sellerId}))
  assert.equal(initialOwnerPause.status,200,
    "Protected Owner can check the actual native Store before Staff closes it")
  assert.equal(initialOwnerPause.body.platform_closed,false,
    "A native-open Store without a platform closure must remain available")
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),true)
  assert.equal((await q("select count(*)::int n from da_store_platform_closing where seller_id=$1",
    [sellerId]))[0].n,0)
  // A currently authorized real Beta Buyer can inspect an attributed
  // Alpha/Gamma Cart and has a separate eligible native Gamma-only Cart.
  const availableBuyer=await read(buyer,buyerScopePath)
  assert.equal(availableBuyer.status,200,
    "Authorized Buyer scope must be visible over HTTPS before Staff closes Gamma")
  assert.equal(availableBuyer.body?.seller_count,2)
  // seller_scope=inspect is read-only Cart-to-Seller mapping, never an
  // availability or checkout grant. Prove real Buyer catalogue visibility
  // independently BEFORE closing, on the exact native Seller page.
  const catalogBase="/personal/catalog?organization_id="+
    encodeURIComponent(buyerOrganizationId)
  let sellerPage=-1
  for(let page=0;page<5;page++){
    const candidate=await read(buyer,catalogBase+"&page="+page)
    assert.equal(candidate.status,200)
    assert.ok(Array.isArray(candidate.body?.stores))
    if(candidate.body.stores.some((store:any)=>store.id===sellerId)){
      sellerPage=page
      break
    }
  }
  assert.notEqual(sellerPage,-1,
    "Gamma Store must be visible to the real Buyer before platform closure")
  const catalogPage=catalogBase+"&page="+sellerPage
  assert.equal(await foundation.authorizeBuyerCheckout(
    checkoutCartId,customerId,[sellerId]),true,
    "Exact current Buyer Cart must pass the final L before platform closure")
  assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
    [checkoutCartId]))[0].n,0)
  const orderBefore=Number((await q('select count(*)::int n from "order"'))[0].n)
  // Having store.approve or a native member does NOT authorize platform closure.
  assert.equal((await read(staff,path)).status,403)
  assert.equal((await read(staff,mailPath)).status,403,
    "Foreign Staff cannot enumerate protected Owner email readiness")
  let requestId="dascp_"+randomBytes(16).toString("hex")
  const reason="B22 sentetik mağaza için gerekçeli platform kapatma denetimi"
  assert.equal((await write(browser,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason})).status,403)
  const grantId="da_staff_closing_"+randomBytes(8).toString("hex")
  await q(`insert into da_platform_staff_grant
    (id,person_id,task,resource,granted_by_person_id,reason)
    values ($1,$2,'store.closing.manage','platform',$2,
      'B22 disposable platform closing security fixture')`,[grantId,staffPersonId])
  // Exercise the exact legacy Origin (not an application audit) over real
  // Staff HTTPS before the existing successful browser closure.
  const liveLegacy=await q(`select o.id,e.action,e.resource
    from da_organization_seller_ownership o
    join da_audit_event e on e.id=o.verification_audit_event_id
    where o.organization_id=$1 and o.seller_id=$2
      and o.revoked_at is null`,[ownerOrgId,sellerId])
  assert.equal(liveLegacy.length,1)
  assert.deepEqual([liveLegacy[0].action,liveLegacy[0].resource],
    ["organization.store_association_approved","store-association"])
  const legacyAuditBefore=Number((await q(`select count(*)::int n
    from da_audit_event where action='organization.store_platform_closing_started'
      and target_id=$1`,[sellerId]))[0].n)
  assert.equal((await write(staff,path,{
    organization_id:buyerOrganizationId,seller_id:sellerId,
    request_id:requestId,reason})).status,403,
    "Foreign Organization cannot claim another Store's legacy Origin")
  await q("update da_organization_seller_ownership set revoked_at=clock_timestamp() where id=$1",[liveLegacy[0].id])
  try{
    assert.equal((await write(staff,path,{
      organization_id:ownerOrgId,seller_id:sellerId,
      request_id:requestId,reason})).status,403,
      "Revoked legacy ownership must deny independent strong Staff")
    assert.equal((await read(staff,path)).status,200,
      "Strong Staff can still inspect other authorized Stores")
  }finally{
    const restored=await q("update da_organization_seller_ownership set revoked_at=null where id=$1 and revoked_at is not null returning id",[liveLegacy[0].id])
    assert.equal(restored.length,1)
  }
  assert.equal(Number((await q(`select count(*)::int n
    from da_audit_event where action='organization.store_platform_closing_started'
      and target_id=$1`,[sellerId]))[0].n),legacyAuditBefore,
    "Revoked and foreign Store attempts must add no closing audit")
  // Native Store fixture has >30 earlier applications. Inspect the existing
  // bounded Staff queue across actual server pages, not only the newest 30.
  let found=false,foundPage=-1
  for(let page=0;page<50;page++){
    const list=await read(staff,path+"?page="+page)
    assert.equal(list.status,200,"Strong independently authorized Staff lists Stores")
    assert.ok(Array.isArray(list.body?.candidates))
    if(list.body.candidates.some((x:any)=>
      x.organization_id===ownerOrgId&&x.seller_id===sellerId)){found=true;foundPage=page;break}
    if(list.body.has_more!==true)break
  }
  assert.equal(found,true,"Existing approved source Store must remain accessible in Staff pagination")
  assert.equal((await read(staff,mailPath)).status,403,
    "Staff cannot inspect email readiness before the verified closure exists")
  const count=async()=>Number((await q(`select count(*)::int n from da_audit_event
    where resource='store-platform-closing' and target_id=$1`,[sellerId]))[0].n)
  const auditBefore=await count()
  assert.equal((await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason},true)).status,403,
    "Forged CSRF must not create a closure")
  assert.equal(await count(),auditBefore)
  // Real native Medusa verification precedes the first real Staff Chrome
  // form submit. The UI itself must show the server-derived count of ONE.
  // Only this disposable Medusa 2.22.3 AuthVerification record is created
  // and confirmed. No browser-claimed email and no production verification
  // shortcuts: the native Auth module issues and consumes its own code.
  const ownerBindings=await q("select auth_identity_id from da_login_binding where person_id=$1 and actor_type='user' and revoked_at is null and verified_at is not null",[ownerPersonId])
  assert.equal(ownerBindings.length,1)
  const authId=ownerBindings[0].auth_identity_id
  const challenge=await auth.requestAuthVerification({
    auth_identity_id:authId,entity_id:ownerEmail,entity_type:"email",code_provider:"token"
  })
  assert.ok(typeof challenge.code==="string"&&challenge.code.length>=16)
  const pending=await auth.listAuthVerifications({
    auth_identity_id:authId,entity_type:"email"
  },{take:null})
  assert.equal(pending.some((v:any)=>v.id===challenge.id&&!v.verified_at),true)
  await auth.confirmAuthVerification({auth_identity_id:authId,code:challenge.code,
    code_provider:"token"})
  const nativeProof=await auth.listAuthVerifications({
    auth_identity_id:authId,entity_type:"email"
  },{take:null})
  assert.equal(nativeProof.some((v:any)=>v.id===challenge.id&&v.verified_at),true)
  await staff.send("Page.bringToFront")
  await staff.send("Page.reload",{ignoreCache:true})
  await staff.wait("document.readyState==='complete' && "+
    "!document.getElementById('workspace').hidden && "+
    "!document.getElementById('platform-closing-panel').hidden")
  for(let page=0;page<foundPage;page++){
    assert.equal(await staff.eval("!document.getElementById('platform-closing-more').hidden"),true)
    await staff.click("#platform-closing-more")
    await staff.wait("document.getElementById('platform-closing-status').textContent!=='Yetkili mağazalar doğrulanıyor…'")
  }
  const canSelect=await staff.eval("(()=>{const e=document.querySelector('#platform-closing-form select[name=seller_id]');"+
    "if(!e||!Array.from(e.options).some(o=>o.value==="+JSON.stringify(sellerId)+"))return false;"+
    "e.value="+JSON.stringify(sellerId)+";e.dispatchEvent(new Event('change',{bubbles:true}));return e.value==="+JSON.stringify(sellerId)+"})()")
  assert.equal(canSelect,true,"Real Staff UI must offer the same paginated Seller")
  await staff.input("#platform-closing-form textarea[name=reason]",reason)
  await staff.click("#platform-closing-form input[name=confirmed]")
  await staff.click("#platform-closing-form button[type=submit]")
  // The POST's first mail-read is followed by a live Store-list refresh,
  // which starts a second authorized mail-read. Assert the FINAL refresh,
  // not its transient first result while the second displays "loading".
  await staff.wait("document.getElementById('platform-closing-status').textContent.includes('Gerekçe ile yeni satışları derhal durdurabilirsiniz.')&&"+
    "document.getElementById('platform-closing-mail-status').textContent.includes('doğrulanmış e-posta kimliği 1')")
  const mailUi=await staff.eval("(()=>{const e=document.getElementById('platform-closing-mail-status');return {text:e.textContent,role:e.getAttribute('role'),live:e.getAttribute('aria-live')}})()")
  assert.match(mailUi.text,/Korunan Owner 1, doğrulanmış e-posta kimliği 1/)
  assert.match(mailUi.text,/Owner 1: .*deneme [0-4]\/4/)
  assert.match(mailUi.text,/itiraz saati henüz başlamadı/)
  assert.match(mailUi.text,/Kesin kapatma engelleri:/)
  assert.match(mailUi.text,/mali ve hukuki yükümlülüklerin temizlendiği doğrulanmadı/)
  assert.match(mailUi.text,/bu mağazaya bağlı gerçek geçmiş sipariş kaydı saptandı/,
    "Prior native Seller OrderGroup must be signposted to authorized Staff")
  assert.match(mailUi.text,/geri dönüşsüz kapatma kapalıdır/)
  assert.equal(mailUi.role,"status")
  assert.equal(mailUi.live,"polite")
  const createdRows=await q("select request_id,state,version from da_store_platform_closing where seller_id=$1 and organization_id=$2",[sellerId,ownerOrgId])
  assert.equal(createdRows.length,1)
  assert.equal(createdRows[0].state,"notification_unverified")
  assert.equal(Number(createdRows[0].version),1)
  assert.match(createdRows[0].request_id,/^dascp_[a-f0-9]{32}$/)
  requestId=createdRows[0].request_id
  const mailReadiness=await read(staff,mailPath)
  assert.equal(mailReadiness.status,200)
  assert.equal(mailReadiness.body?.status,"not_ready")
  assert.equal(mailReadiness.body?.protected_owner_count,1)
  assert.equal(mailReadiness.body?.private_receipt_count,1)
  assert.equal(mailReadiness.body?.verified_email_identity_count,1,
    "Native-confirmed Owner email is visible to the real Staff HTTPS route")
  assert.equal(mailReadiness.body?.mailbox_delivery_verified_count,0)
  assert.equal(mailReadiness.body?.deadline_started,false)
  assert.equal(mailReadiness.body?.native_order_history_observed,true,
    "Real prior Mercur OrderGroup is observed, not financially cleared")
  // B22 terminal-finance prerequisite: prove that the actual installed
  // Mercur/Medusa query graph can expose a Seller-linked native Order's
  // payment/refund relations. The checkout fixture uses zero external money;
  // observing no payment here proves NOTHING about Seller-wide debt or legal
  // clearance. Do not wire this probe into a production authorization gate.
  const nativeSeller=container.resolve("seller") as {
    listOrderGroups(filter:{seller_id:string},config:{take:number}):
      Promise<Array<{id:string}>>
  }
  const nativeSellerGroups=await nativeSeller.listOrderGroups(
    {seller_id:sellerId},{take:2})
  assert.ok(Array.isArray(nativeSellerGroups)&&nativeSellerGroups.length>0,
    "The authorized Store has a real native Seller-linked OrderGroup")
  const groupId=nativeSellerGroups[0]?.id
  assert.match(groupId??"",/^og_[A-Za-z0-9_-]{1,123}$/)
  const nativeFinance=await query.graph({
    entity:"order_group",filters:{id:groupId},
    fields:["id","orders.id","orders.payment_collections.id",
      "orders.payment_collections.payments.id",
      "orders.payment_collections.payments.refunds.id"]
  })
  assert.ok(Array.isArray(nativeFinance.data)&&nativeFinance.data.length===1)
  assert.equal(nativeFinance.data[0]?.id,groupId)
  const linkedOrders=nativeFinance.data[0]?.orders
  assert.ok(Array.isArray(linkedOrders)&&linkedOrders.length>0,
    "Native Seller OrderGroup must retain real Seller Order links")
  for(const order of linkedOrders){
    assert.match(order?.id??"",/^order_[A-Za-z0-9_-]+$/)
    assert.ok(Object.prototype.hasOwnProperty.call(order,"payment_collections"),
      "Native Medusa must explicitly project the payment collection relation")
    assert.ok(Array.isArray(order.payment_collections),
      "An empty native payment collection list is not financial clearance")
    for(const collection of order.payment_collections){
      assert.ok(Array.isArray(collection.payments))
      for(const payment of collection.payments)
        assert.ok(Array.isArray(payment.refunds),
          "Native refund relation must be queryable, even when empty")
    }
  }
  assert.equal(mailReadiness.body?.terminal_preflight.financial_legal_clearance_verified,false,
    "A native payment/refund graph can never imply complete legal clearance")
  process.stdout.write("PASS B22 real PG16 native finance graph: Seller-scoped OrderGroup and Order payment/refund relations queried read-only; financial/legal clearance stays false, no payment/return execution\n")
  assert.equal(JSON.stringify(mailReadiness.body).includes("og_"),false,
    "Native OrderGroup IDs are not exposed to Staff")
  assert.deepEqual(mailReadiness.body?.terminal_preflight,{
    appeal_window_elapsed:false,appeal_review_pending:false,
    appeal_accepted:false,notification_exception_review_required:false,
    financial_legal_clearance_verified:false,
    permanent_finalization_enabled:false
  },"No delivery/clock or finance verification can permit terminal closure")
  assert.equal(mailReadiness.body?.permanent_finalization_enabled,false)
  assert.equal(JSON.stringify(mailReadiness.body).includes("@example.invalid"),false)
  assert.equal(JSON.stringify(mailReadiness.body).includes(reason),false)

  const verifiedReadiness=await read(staff,mailPath)
  assert.equal(verifiedReadiness.status,200)
  assert.equal(verifiedReadiness.body?.protected_owner_count,1)
  assert.equal(verifiedReadiness.body?.verified_email_identity_count,1,
    "One genuinely native-confirmed protected Owner email must count as 1")
  assert.equal(verifiedReadiness.body?.mailbox_delivery_verified_count,0)
  assert.equal(verifiedReadiness.body?.mandatory_email_verified,false)
  assert.equal(verifiedReadiness.body?.deadline_started,false)
  assert.equal(JSON.stringify(verifiedReadiness.body).includes(ownerEmail),false)
  assert.equal(JSON.stringify(verifiedReadiness.body).includes(reason),false)
  // A real verified proof without its canonical Person→Actor mapping is
  // ambiguous and must not be counted. The mutation is limited to the task's
  // disposable native mapping row, restored before any Owner operation.
  const ownerMappings=await q("select id from da_actor_mapping where person_id=$1 and actor_type='user' and deleted_at is null",[ownerPersonId])
  assert.equal(ownerMappings.length,1)
  await q("update da_actor_mapping set deleted_at=clock_timestamp() where id=$1",[ownerMappings[0].id])
  try{
    const unresolved=await read(staff,mailPath)
    assert.equal(unresolved.status,200)
    assert.equal(unresolved.body?.verified_email_identity_count,0)
    assert.equal(unresolved.body?.unresolved_identity_count,1)
    assert.equal(unresolved.body?.deadline_started,false)
  }finally{
    await q("update da_actor_mapping set deleted_at=null where id=$1",[ownerMappings[0].id])
  }
  const mappingRestored=await read(staff,mailPath)
  assert.equal(mappingRestored.status,200)
  assert.equal(mappingRestored.body?.verified_email_identity_count,1,
    "Canonical mapping restoration must restore positive native proof counting")
  // Native soft-delete simulates only this test-owned proof's revocation.
  // The Owner's actual login, MFA and Store authorization stay untouched.
  await q("update auth_verification set deleted_at=clock_timestamp() where id=$1 and auth_identity_id=$2",[challenge.id,authId])
  const revokedReadiness=await read(staff,mailPath)
  assert.equal(revokedReadiness.status,200)
  assert.equal(revokedReadiness.body?.verified_email_identity_count,0,
    "Soft-deleted native email proof must not be treated as verified")
  assert.equal(revokedReadiness.body?.mandatory_email_verified,false)
  assert.equal(revokedReadiness.body?.deadline_started,false)
  assert.equal((await read(browser,mailPath)).status,403,
    "Protected Owner cannot use independent platform Staff preflight")
  assert.equal((await read(staff,mailPath+"&unknown=1")).status,400)
  const state=await read(browser,readPath)
  assert.equal(state.status,200)
  assert.equal(state.body?.reason,reason)
  assert.equal(state.body?.state,"notification_unverified")
  assert.equal(state.body?.deadline_started,false)
  assert.equal(state.body?.permanent_finalization_enabled,false)
  assert.equal((await read(staff,readPath)).status,403,
    "Staff task cannot read an unrelated Owner's private reason screen")
  const replay=await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,request_id:requestId,reason})
  assert.equal(replay.status,200)
  assert.equal(replay.body?.replayed,true)
  assert.equal(await count(),auditBefore+1)
  assert.equal((await write(staff,path,{
    organization_id:ownerOrgId,seller_id:sellerId,
    request_id:"dascp_"+randomBytes(16).toString("hex"),reason})).status,409)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),false,
    "Platform closure blocks Store sales even though native Seller is still open")
  assert.deepEqual((await q("select id,status,name,handle from seller where id=$1",
    [sellerId]))[0],before,"Closure must not rewrite native Seller/name/URL")
  // A real HTTPS Buyer catalogue must stop advertising Gamma's existing
  // Offer immediately. The mapped historical Cart stays readable but its
  // read-only seller-scope is NOT permission to buy or start checkout.
  const closedCatalog=await read(buyer,catalogPage)
  assert.equal(closedCatalog.status,200)
  assert.ok(Array.isArray(closedCatalog.body?.stores))
  assert.equal(closedCatalog.body.stores.some((store:any)=>store.id===sellerId),false,
    "Platform-closed Gamma must disappear from the real Buyer HTTPS catalogue")
  assert.equal(closedCatalog.body?.checkout_ready,false)
  const mappedCart=await read(buyer,buyerScopePath)
  assert.equal(mappedCart.status,200,
    "Read-only attribution mapping does not bypass sale/checkout restrictions")
  assert.equal(mappedCart.body?.checkout_ready,false)
  assert.equal(await foundation.authorizeBuyerCheckout(
    checkoutCartId,customerId,[sellerId]),false,
    "Platform closure must independently deny final L for the previously authorized Cart")
  const [attribution]=await q(`select organization_id,customer_id
    from da_buyer_cart_attribution where cart_id=$1`,[checkoutCartId])
  assert.equal(attribution.organization_id,buyerOrganizationId)
  assert.equal(attribution.customer_id,customerId)
  assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
    [checkoutCartId]))[0].n,0,
    "Denied checkout may not create an OrderGroup")
  const {data:orderLinks}=await query.graph({
    entity:"order_cart",fields:["order_id"],filters:{cart_id:checkoutCartId}
  })
  assert.equal(orderLinks.length,0,"Denied Cart may not create any Order link")
  const {data:paymentLinks}=await query.graph({
    entity:"cart_payment_collection",fields:["payment_collection_id"],
    filters:{cart_id:checkoutCartId}
  })
  assert.equal(paymentLinks.length,0,
    "Denied Cart may not attach a native payment collection")
  const notifications=await q(`select count(*)::int n from da_notification_receipt n
    join da_audit_event e on e.id=n.audit_event_id
    where e.target_id=$1 and e.action='organization.store_platform_closing_started'
      and n.person_id=$2`,[sellerId,ownerPersonId])
  assert.equal(notifications[0].n,1,"Every active protected Owner receives durable private receipt")
  const notices=await read(browser,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(notices.status,200)
  const closureNotice=notices.body.notifications?.find((x:any)=>
    x.title==="Platform mağaza kapatma incelemesi başladı")
  assert.ok(closureNotice,
    "The real current protected Owner must read the closure security receipt")
  assert.match(closureNotice.description,/platform kararıyla yeni satışlar durduruldu/)
  assert.match(closureNotice.description,/güvenli şirket alanınızda/)
  assert.match(closureNotice.description,/İtiraz saatini ve gerekçeyi/)
  assert.equal(closureNotice.description.includes("Mevcut faal mağazalar etkilenmez"),false)
  assert.equal(JSON.stringify(notices.body).includes(reason),false,
    "Private closure explanation never enters a generic notification payload")
  const foreignNotices=await read(staff,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.ok(foreignNotices.status===200||foreignNotices.status===403)
  assert.equal(JSON.stringify(foreignNotices.body).includes(
    "Platform mağaza kapatma incelemesi başladı"),false,
    "An unrelated Staff/Organization role must not read Owner-only receipts")
  // Real browser Owner UI: normal HTTPS reload, Organization selection and
  // CDP mouse/keyboard submit. No synthetic .onsubmit() or hidden DOM override.
  await browser.send("Page.bringToFront")
  await browser.send("Page.reload",{ignoreCache:true})
  await browser.wait("document.readyState==='complete'&&!document.getElementById('workspace').hidden")
  await browser.select(ownerOrgName,"owner")
  await browser.wait("!document.getElementById('store-owner-pause-panel').hidden")
  await browser.click("#notification-bell")
  await browser.wait("!document.getElementById('notification-panel').hidden && "+
    "document.getElementById('notification-list').textContent.includes('platform kararıyla yeni satışlar durduruldu')")
  assert.equal(await browser.eval(
    "Array.from(document.querySelectorAll('#notification-list li')).some("+
    "li=>li.querySelector('h3')?.textContent==='Platform mağaza kapatma incelemesi başladı' && "+
    "li.querySelector('p')?.textContent.includes('Mevcut faal mağazalar etkilenmez'))"),false)
  await browser.click("#notification-close")
  const selected=await browser.eval(`(()=>{
    const x=document.querySelector('#store-owner-pause-form select[name=seller_id]');
    if(!x||!Array.from(x.options).some(o=>o.value===${JSON.stringify(sellerId)}))return false;
    x.value=${JSON.stringify(sellerId)};x.dispatchEvent(new Event('change',{bubbles:true}));
    return x.value===${JSON.stringify(sellerId)};
  })()`)
  assert.equal(selected,true)
  await browser.wait("!document.getElementById('store-platform-appeal-panel').hidden")
  // #307 P2: although native Seller remains 'open', the actual protected
  // Owner's personal HTTPS pause state must honor the separate platform
  // closure; all voluntary controls stay disabled after a real page reload.
  const pausePath="/personal/store-owner-pause?"+
    new URLSearchParams({organization_id:ownerOrgId,seller_id:sellerId})
  const ownerPauseRead=await read(browser,pausePath)
  assert.equal(ownerPauseRead.status,200)
  assert.equal(ownerPauseRead.body.store_status,"open",
    "Native Seller remains open; separate platform closure blocks sales")
  assert.equal(ownerPauseRead.body.platform_closed,true)
  assert.equal((await read(staff,pausePath)).status,403,
    "Unrelated Staff cannot obtain protected Owner pause state")
  await browser.wait("document.getElementById('store-owner-pause-status')."+
    "textContent.includes('Mağaza platform kararıyla kapatıldı') && "+
    "document.querySelector('#store-owner-pause-form button[value=pause]').disabled && "+
    "document.querySelector('#store-owner-pause-form button[value=resume]').disabled && "+
    "document.querySelector('#store-owner-closing-form button[value=start]').disabled")
  const closedOwnerUi=await browser.eval("(()=>{const s=document.getElementById("+
    "'store-owner-pause-status');const a=document.querySelector("+
    "'#store-owner-closing-form input[name=consequences_acknowledged]');"+
    "a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));"+
    "return {text:s.textContent,role:s.getAttribute('role'),"+
    "live:s.getAttribute('aria-live'),"+
    "pause:document.querySelector('#store-owner-pause-form button[value=pause]').disabled,"+
    "resume:document.querySelector('#store-owner-pause-form button[value=resume]').disabled,"+
    "start:document.querySelector('#store-owner-closing-form button[value=start]').disabled}})()")
  assert.ok(!closedOwnerUi.text.includes("Mağaza satışa açık"),
    "Platform-closed Store must never be described as open for sales")
  assert.deepEqual([closedOwnerUi.role,closedOwnerUi.live,
    closedOwnerUi.pause,closedOwnerUi.resume,closedOwnerUi.start],
    ["status","polite",true,true,true],
    "Accessible live status and all unavailable controls fail closed")
  const voluntaryWrites=()=>q(`select
    (select count(*)::int from da_audit_event e where e.target_id=$1
      and e.resource in ('store-owner-pause','store-owner-closing')) audits,
    (select count(*)::int from da_audit_outbox x
      join da_audit_event e on e.id=x.source_audit_event_id
      where e.target_id=$1 and e.resource in
        ('store-owner-pause','store-owner-closing')) outbox,
    (select count(*)::int from da_store_owner_pause where seller_id=$1) pauses,
    (select count(*)::int from da_store_owner_closing where seller_id=$1) closings`,
    [sellerId])
  const voluntaryBefore=await voluntaryWrites()
  assert.equal((await write(browser,"/personal/store-owner-pause",{
    action:"resume",organization_id:ownerOrgId,seller_id:sellerId,
    request_id:"dasp_"+randomBytes(16).toString("hex"),
    expected_version:ownerPauseRead.body.version})).status,403,
    "Owner cannot resume platform-closed sales even through direct HTTPS")
  assert.equal((await write(browser,"/personal/store-owner-closing",{
    action:"start",organization_id:ownerOrgId,seller_id:sellerId,
    request_id:"dasc_"+randomBytes(16).toString("hex"),
    expected_version:0,consequences_acknowledged:true})).status,409,
    "Owner cannot start a conflicting separate closing clock")
  assert.deepEqual(await voluntaryWrites(),voluntaryBefore,
    "Denied Owner controls may not create pause/closing/audit/outbox")
  await browser.eval("(()=>{const a=document.querySelector("+
    "'#store-owner-closing-form input[name=consequences_acknowledged]');"+
    "a.checked=false;a.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: platform-closed native-open Seller Owner sale-status accessible and consistent, pause/resume/second closing disabled, direct HTTP403+409, zero voluntary audit/outbox\n")
  const ui=await browser.eval(`({
    reason:document.getElementById('store-platform-appeal-reason').textContent,
    status:document.getElementById('store-platform-appeal-status').getAttribute('role'),
    live:document.getElementById('store-platform-appeal-status').getAttribute('aria-live'),
    enabled:!document.querySelector('#store-platform-appeal-form button').disabled
  })`)
  assert.equal(ui.reason,"Platform karar gerekçesi: "+reason)
  assert.equal(ui.status,"status")
  assert.equal(ui.live,"polite")
  assert.equal(ui.enabled,true)
  await verifyCrossSessionClosingReason({
    browser,staff,reason,ownerOrgName,foreignOrgName,privatePath:readPath,
    ownerEmail,ownerPassword,ownerPersonId,
    foreignEmail,foreignPassword,foreignPersonId
  })
  // Add B as the genuine second protected Gamma Owner only AFTER all foreign
  // Staff/Owner denial checks. This reuses the later fixture's same membership
  // and never relaxes any production Owner-protection or Staff permission.
  const [secondOwnerMembership]=await foundation.createMemberships([{
    organization_id:ownerOrgId,person_id:staffPersonId,
    role:"owner",status:"active",protected_owner:true
  }])
  assert.match(secondOwnerMembership.id,/^[A-Za-z0-9_-]+$/)
  assert.notEqual(staffPersonId,ownerPersonId)
  const newlyProtected=await read(staff,mailPath)
  assert.equal(newlyProtected.status,200)
  assert.equal(newlyProtected.body?.protected_owner_count,2)
  assert.equal(newlyProtected.body?.private_receipt_count,1,
    "Only the initial Owner may hold the original closure audit receipt")
  // The existing Owner A already has the genuine native SellerMember link.
  // B receives its native Member linkage only later in B22; do NOT invent it.
  // Grant A the same real platform task temporarily in this disposable DB,
  // then revoke it even if the forced lock race fails.
  const dualRoleGrantId="da_staff_dual_"+randomBytes(8).toString("hex")
  const dualGrant=await q(`insert into da_platform_staff_grant
    (id,person_id,task,resource,granted_by_person_id,reason)
    values($1,$2,'store.closing.manage','platform',$2,
      'B22 disposable same Person Staff-Owner lock race')
    returning id`,[dualRoleGrantId,ownerPersonId])
  assert.deepEqual(dualGrant,[{id:dualRoleGrantId}])
  try{
    await verifyDualRolePlatformOwnerLockOrder({
      staff:browser,q,pgUrl:input.pgUrl,personId:ownerPersonId,
      organizationId:ownerOrgId,sellerId
    })
  }finally{
    const revoked=await q(`update da_platform_staff_grant
      set revoked_at=clock_timestamp()
      where id=$1 and revoked_at is null returning id`,[dualRoleGrantId])
    assert.deepEqual(revoked,[{id:dualRoleGrantId}],
      "Task-only dual Staff grant must never survive this isolated race")
  }
  await runPlatformClosingEmailTick(container)
  const originalRecipients=await q(`select n.person_id
    from da_notification_receipt n
    join da_store_platform_closing c on c.source_audit_event_id=n.audit_event_id
    where c.seller_id=$1 order by n.person_id`,[sellerId])
  assert.deepEqual(originalRecipients,[{person_id:ownerPersonId}],
    "Late Owner must NEVER be inserted into the original Staff decision recipient history")
  const currentOwnerNotices=await read(staff,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(currentOwnerNotices.status,200)
  const lateNotice=currentOwnerNotices.body.notifications?.find((n:any)=>
    n.title==="Sorumluluğunuza yeni geçen mağazada kapatma süreci var")
  assert.ok(lateNotice,"New protected Owner must receive a separately dated current closure notice")
  assert.equal(lateNotice.read_at,null)
  assert.equal(new Date(lateNotice.created_at).getTime()>=
    new Date((await q("select started_at from da_store_platform_closing where seller_id=$1",
      [sellerId]))[0].started_at).getTime(),true)
  assert.equal((await read(browser,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))).body.notifications.some((n:any)=>
      n.id===lateNotice.id),false,
    "Other Owner must not read a newly promoted person's private notice")
  const readLate=await write(staff,"/personal/notifications",{id:lateNotice.id})
  assert.equal(readLate.status,200)
  const afterRead=await read(staff,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.ok(afterRead.body.notifications.some((n:any)=>
    n.id===lateNotice.id&&n.read_at!==null),
    "Late Owner's new notice has an independent persistent read state")
  assert.equal(newlyProtected.body?.mandatory_email_verified,false)
  assert.equal(newlyProtected.body?.deadline_started,false)
  // Isolated synthetic sent-link record: this proves the real Owner HTTPS
  // callback, NOT SMTP transport or mailbox delivery. Scheduled job and
  // four-send retry require their own actual execution evidence.
  const emailToken=randomBytes(32).toString("hex")
  const tokenDigest=createHash("sha256").update(emailToken).digest("hex")
  const visitPath="/personal/store-platform-closing-email-visit"
  const queue=await q(`select person_id,attempts from da_store_platform_closing_email
    where seller_id=$1 and person_id=$2`,[sellerId,ownerPersonId])
  assert.equal(queue.length,1,"Closing must create exactly one Owner mail queue row")
  await q(`insert into da_store_platform_closing_email_link
    (seller_id,person_id,attempt,token_sha256) values ($1,$2,4,$3)`,
    [sellerId,ownerPersonId,tokenDigest])
  assert.equal((await read(browser,visitPath)).status,401,
    "GET scanner cannot activate or disclose the email link")
  assert.equal((await write(staff,visitPath,{token:emailToken})).status,403,
    "Another protected Owner must not use the first Owner's link")
  assert.equal((await write(browser,visitPath,{token:emailToken},true)).status,403,
    "Forged CSRF cannot confirm notification")
  assert.equal((await write(browser,visitPath,{token:randomBytes(32).toString("hex")})).status,403,
    "Unrecognized random link must reveal no closure")
  const proof=await write(browser,visitPath,{token:emailToken})
  assert.equal(proof.status,200)
  assert.equal(proof.body?.viewed,true)
  assert.equal(proof.body?.reason,reason)
  assert.equal(proof.body?.deadline_started,true)
  const clockRows=await q(`select deadline_started_at,deadline_basis,
    admin_alert_at from da_store_platform_closing where seller_id=$1`,[sellerId])
  assert.equal(clockRows.length,1)
  assert.equal(clockRows[0].deadline_basis,"owner_delivery")
  assert.equal(clockRows[0].admin_alert_at,null)
  assert.ok(clockRows[0].deadline_started_at)
  const originalStart=new Date(clockRows[0].deadline_started_at).toISOString()
  const deadlineAudit=await q(`select e.id,e.new_values
    from da_audit_event e join da_audit_outbox x
      on x.source_audit_event_id=e.id
      and x.source_module='dogruadres-access' and x.deleted_at is null
    where e.organization_id=$1 and e.target_id=$2
      and e.action='organization.store_platform_closing_deadline_started'
      and e.resource='store-platform-closing'
      and e.role_context='owner' and e.deleted_at is null
      and e.new_values->>'basis'='owner_delivery'
      and (e.new_values->>'deadline_started_at')::timestamptz=$3::timestamptz`,
      [ownerOrgId,sellerId,originalStart])
  assert.equal(deadlineAudit.length,1,
    "Owner delivery clock and one canonical Foundation audit/outbox must commit together")
  assert.equal(JSON.stringify(deadlineAudit).includes(emailToken),false,
    "Email link secret must not be copied to Foundation audit")
  assert.equal(JSON.stringify(deadlineAudit).includes(reason),false,
    "Private closing reason must not be copied to Foundation audit")
  const secondVisit=await write(browser,visitPath,{token:emailToken})
  assert.equal(secondVisit.status,200,"Same authorized Owner may reread notice")
  assert.equal((await q(`select deadline_started_at from da_store_platform_closing
    where seller_id=$1`,[sellerId]))[0].deadline_started_at.toISOString(),originalStart,
    "Revisiting must not restart 10+20 appeal time")
  const auditedReplays=await q(`select count(*)::int as n
    from da_audit_event where organization_id=$1 and target_id=$2
      and action='organization.store_platform_closing_deadline_started'
      and deleted_at is null`,[ownerOrgId,sellerId])
  assert.equal(Number(auditedReplays[0].n),1,
    "Replaying the Owner link must not create a duplicate deadline audit")
  const during=await read(browser,readPath)
  assert.equal(during.status,200)
  assert.equal(during.body.deadline_started,true)
  assert.equal(during.body.deadline_basis,"owner_delivery")
  assert.equal(new Date(during.body.first_appeal_until).getTime()-
    new Date(during.body.deadline_started_at).getTime(),10*86400000)
  assert.equal(new Date(during.body.final_review_until).getTime()-
    new Date(during.body.deadline_started_at).getTime(),30*86400000)
  assert.equal(during.body.permanent_finalization_enabled,false)
  const deliveryStatus=await read(staff,mailPath)
  assert.equal(deliveryStatus.status,200)
  assert.equal(deliveryStatus.body.mailbox_delivery_verified_count,1)
  assert.equal(deliveryStatus.body.deadline_started,true)
  assert.equal(deliveryStatus.body.deadline_basis,"owner_delivery")
  assert.equal(deliveryStatus.body.terminal_preflight.appeal_window_elapsed,false)
  assert.equal(deliveryStatus.body.terminal_preflight.financial_legal_clearance_verified,false)
  assert.equal(deliveryStatus.body.terminal_preflight.permanent_finalization_enabled,false)
  assert.equal(deliveryStatus.body.smtp_accepted_count,
    deliveryStatus.body.email_statuses.filter((x:any)=>x.smtp_accepted===true).length,
    "An Owner link visit must not erase an earlier SMTP acceptance or fabricate one")
  assert.equal(deliveryStatus.body.email_statuses.some((x:any)=>x.link_visited_at),true)
  assert.equal(JSON.stringify(deliveryStatus.body).includes(emailToken),false)
  assert.equal(JSON.stringify(deliveryStatus.body).includes(reason),false)
  // A delayed fourth email-slot result must not add an admin alert or
  // restart an already-proved Owner-delivery clock.
  await q(`update da_store_platform_closing_email
    set attempts=4,last_result='delivered',claim_id=null,lease_until=null,
      next_attempt_at=clock_timestamp()-interval '1 hour'
    where seller_id=$1 and person_id=$2 and delivered_at is not null`,
    [sellerId,ownerPersonId])
  assert.equal(await foundation.settlePlatformClosingAdminFallback(),0,
    "Exhaustion must not override a previously started Owner-delivery clock")
  const lateAdminNotices=await q(`select count(*)::int as n
    from da_store_platform_closing_admin_notice where seller_id=$1`,[sellerId])
  assert.equal(Number(lateAdminNotices[0].n),0,
    "No bogus admin failure notification after verified Owner delivery")
  assert.equal((await q(`select deadline_started_at from da_store_platform_closing
    where seller_id=$1`,[sellerId]))[0].deadline_started_at.toISOString(),originalStart,
    "Delayed email worker must never reset the canonical appeal clock")
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),false)
  assert.equal(await foundation.authorizeBuyerCheckout(checkoutCartId,customerId,[sellerId]),false)
  assert.equal(Number((await q('select count(*)::int n from "order"'))[0].n),orderBefore)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: synthetic hashed email link strong Owner POST, foreign/forged CSRF/scanner GET denied, 10+20 server clock starts once, no finalizer or sales reopening\n")
  // An authenticated Owner link started the canonical server clock.
  // The first appeal must stay actionable in the real Chrome interface.
  await browser.click("#store-platform-appeal-refresh")
  await browser.wait("document.getElementById('store-platform-appeal-status').textContent.includes('10+20 günlük itiraz saati başladı')")
  assert.equal(await browser.eval(
    "!document.querySelector('#store-platform-appeal-form button').disabled"),true,
    "A started clock must not disable the protected Owner's first appeal")
  const appealReason="B22 sentetik yetkili Owner kapatma kararına itiraz ediyor"
  await browser.input("#store-platform-appeal-form textarea[name=reason]",appealReason)
  await browser.click("#store-platform-appeal-form button")
  await browser.wait("document.getElementById('store-platform-appeal-status').textContent.includes('İtiraz kaydedildi')")
  const appealed=await read(browser,readPath)
  assert.equal(appealed.status,200)
  assert.equal(appealed.body?.state,"appealed")
  assert.equal(appealed.body?.appeal_reason,appealReason)
  assert.equal(appealed.body?.deadline_started,true,
    "Submitting an appeal must preserve the already-started server clock")
  assert.equal(appealed.body?.permanent_finalization_enabled,false)
  const pendingFirst=await read(staff,mailPath)
  assert.equal(pendingFirst.status,200)
  assert.deepEqual(pendingFirst.body?.terminal_preflight,{
    appeal_window_elapsed:false,appeal_review_pending:true,
    appeal_accepted:false,notification_exception_review_required:false,
    financial_legal_clearance_verified:false,
    permanent_finalization_enabled:false
  },"Real first Owner appeal must remain undecided in Staff preflight")
  assert.equal((await q("select count(*)::int n from da_audit_event "+
    "where organization_id=$1 and target_id=$2 and "+
    "action='organization.store_platform_closing_deadline_started'",
    [ownerOrgId,sellerId]))[0].n,1,
    "Owner appeal must not create a second clock or deadline audit")
  const appealNotices=await read(browser,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(appealNotices.status,200)
  const appealNotice=appealNotices.body.notifications?.find((x:any)=>
    x.title==="Mağaza kapatma itirazı kaydedildi")
  assert.ok(appealNotice,"Owner must receive a real private appeal receipt")
  assert.match(appealNotice.description,/Şirketinizin mağazası için itiraz kaydedildi/)
  assert.equal(appealNotice.description.includes("itirazınız kaydedildi"),false,
    "The actor-neutral message must not tell a co-Owner they made the appeal")
  assert.match(appealNotice.description,/yeni satışlar kapalı kalır/)
  assert.equal(appealNotice.description.includes("Mevcut faal mağazalar etkilenmez"),false)
  assert.equal(JSON.stringify(appealNotices.body).includes(appealReason),false)
  const appealRecipients=await q(`select n.person_id,n.id
    from da_notification_receipt n
    join da_audit_event e on e.id=n.audit_event_id
    where e.organization_id=$1 and e.target_id=$2
      and e.action='organization.store_platform_closing_appealed'
    order by n.person_id`,[ownerOrgId,sellerId])
  assert.equal(appealRecipients.length,2,
    "One genuine appeal must create exactly two private protected-Owner receipts")
  assert.deepEqual(new Set(appealRecipients.map((row:any)=>row.person_id)),
    new Set([ownerPersonId,staffPersonId]))
  assert.equal(appealRecipients.some((row:any)=>
    row.person_id===ownerPersonId&&row.id===appealNotice.id),true)
  const otherOwnerNotices=await read(staff,"/personal/notifications?organization="+
    encodeURIComponent(ownerOrgId))
  assert.equal(otherOwnerNotices.status,200,
    "Second protected Owner must read their own private appeal receipt over HTTPS")
  const otherOwnerAppeal=otherOwnerNotices.body.notifications?.find((x:any)=>
    x.title==="Mağaza kapatma itirazı kaydedildi")
  assert.ok(otherOwnerAppeal,"Non-appealing Owner must receive the same neutral notice")
  assert.equal(otherOwnerAppeal.description,appealNotice.description)
  assert.notEqual(otherOwnerAppeal.id,appealNotice.id,
    "Owners receive separate private receipts for the same canonical event")
  assert.equal(appealRecipients.some((row:any)=>
    row.person_id===staffPersonId&&row.id===otherOwnerAppeal.id),true)
  assert.equal(JSON.stringify(otherOwnerNotices.body).includes(appealReason),false)
  assert.equal(JSON.stringify(otherOwnerNotices.body).includes(reason),false)
  await browser.click("#notification-bell")
  await browser.wait("!document.getElementById('notification-panel').hidden && "+
    "document.getElementById('notification-list').textContent.includes('yeni satışlar kapalı kalır')")
  assert.equal(await browser.eval(
    "Array.from(document.querySelectorAll('#notification-list li')).some("+
    "li=>li.querySelector('h3')?.textContent==='Mağaza kapatma itirazı kaydedildi' && "+
    "li.querySelector('p')?.textContent.includes('Mevcut faal mağazalar etkilenmez'))"),false)
  await browser.click("#notification-close")
  // A's real Chrome UI has just displayed the notice. B did not submit
  // the appeal: their separate authenticated Chrome must display the SAME
  // impersonal description, never a forged action attribution or reason.
  await staff.send("Page.bringToFront")
  await staff.send("Page.reload",{ignoreCache:true})
  await staff.wait("document.readyState==='complete'&&!document.getElementById('workspace').hidden")
  await staff.select(ownerOrgName,"owner")
  await staff.click("#notification-bell")
  await staff.wait("!document.getElementById('notification-panel').hidden && "+
    "document.getElementById('notification-list').textContent.includes('Şirketinizin mağazası için itiraz kaydedildi')")
  const secondOwnerUi=await staff.eval(`(()=>{
    const item=Array.from(document.querySelectorAll('#notification-list li'))
      .find(li=>li.querySelector('h3')?.textContent==='Mağaza kapatma itirazı kaydedildi');
    return item?{text:item.textContent,description:item.querySelector('p')?.textContent}:null;
  })()`)
  assert.ok(secondOwnerUi)
  assert.match(secondOwnerUi.description,/Şirketinizin mağazası için itiraz kaydedildi/)
  assert.equal(secondOwnerUi.description.includes("itirazınız kaydedildi"),false)
  assert.equal(secondOwnerUi.text.includes(appealReason),false)
  assert.equal(secondOwnerUi.text.includes(reason),false)
  await staff.click("#notification-close")
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible'")
  assert.equal(await count(),auditBefore+3)
  const [ledger]=await q(`select version,request_id,appeal_request_id,
    started_at,appealed_at from da_store_platform_closing where seller_id=$1`,[sellerId])
  assert.equal(ledger.version,2)
  assert.equal(ledger.request_id,requestId)
  assert.match(ledger.appeal_request_id,/^dapa_[a-f0-9]{32}$/)
  assert.ok(ledger.appealed_at&&ledger.started_at)
  const appealReplay=await write(browser,privatePath,{
    organization_id:ownerOrgId,seller_id:sellerId,
    request_id:ledger.appeal_request_id,expected_version:1,reason:appealReason})
  assert.equal(appealReplay.status,200)
  assert.equal(appealReplay.body.replayed,true)
  assert.equal((await write(browser,privatePath,{
    organization_id:ownerOrgId,seller_id:sellerId,
    request_id:"dapa_"+randomBytes(16).toString("hex"),
    expected_version:1,reason:appealReason})).status,409)
  assert.equal((await q("select count(*)::int n from da_store_platform_closing where seller_id=$1",
    [sellerId]))[0].n,1)
  assert.equal(await count(),auditBefore+3)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([sellerId]),false,
    "Appeal does not re-enable sales or release the Store name")
  const appealedCatalog=await read(buyer,catalogPage)
  assert.equal(appealedCatalog.status,200)
  assert.equal(appealedCatalog.body?.stores?.some((store:any)=>store.id===sellerId),false,
    "Owner appeal must not restore Gamma to the real Buyer HTTPS catalogue")
  assert.equal(await foundation.authorizeBuyerCheckout(
    checkoutCartId,customerId,[sellerId]),false,
    "Owner appeal must not re-enable the final Buyer L")
  assert.equal(Number((await q('select count(*)::int n from "order"'))[0].n),orderBefore)
  assert.deepEqual((await q("select id,status,name,handle from seller where id=$1",
    [sellerId]))[0],before)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: independent strong platform closing Staff stops sales, protected Owner sees private reason and submits real UI appeal; wrong Staff/Owner/CSRF/replay rejected, audit/outbox and Owner receipt durable, canonical 10+20 clock started on authenticated Owner link before first appeal; external mailbox delivery unverified and no finalization/native Order changes; Beta Buyer HTTPS catalogue Gamma visible-to-hidden, read-only Cart mapping unchanged, final L false, no OrderGroup/Order/payment; closing and appeal notification texts verified; two separate protected Owner Person sessions show actor-neutral appeal receipts in HTTPS/Chrome, no private reason; platform Staff Chrome verified Owner email 1, native ambiguous mapping 0/restored 1/revoked proof 0, 1-to-2 Owners during scheduled receipt reconciliation, no external mailbox delivery claim; one immutable clock, foreign denied\n")
  // Suspended Organization must NOT hide a durable platform-staff alert
  // after the real Foundation fallback commits its canonical clock/audit.
  // Every row below is a synthetic, disposable CI-only fixture.
  const suspendedSeller="sel_b22_suspended_mail_"+randomBytes(10).toString("hex")
  const suspendedRequest="dascp_"+randomBytes(16).toString("hex")
  const suspendedAudit="daaud_"+randomBytes(16).toString("hex")
  const suspendedOutbox="daaob_"+randomBytes(16).toString("hex")
  const suspendedReason="Sentetik askıya alınmış şirket güvenlik bildirim testi"
  const suspendedStart=new Date(Date.now()-73*3600000).toISOString()
  const sourceRows=await q(`select e.actor_person_id,e.actor_type,e.actor_id
    from da_store_platform_closing c
    join da_audit_event e on e.id=c.source_audit_event_id
    where c.seller_id=$1`,[sellerId])
  assert.equal(sourceRows.length,1)
  const source=sourceRows[0]
  assert.equal(source.actor_person_id,staffPersonId)
  await q(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,role_context,organization_id,
     action,module,resource,target_id,new_values,occurred_at)
    values ($1,$2,$3,$4,'platform_staff',$5,
      'organization.store_platform_closing_started','dogruadres-access',
      'store-platform-closing',$6,
      jsonb_build_object('request_id',$7::text,'state','notification_unverified',
        'reason_sha256',$8::text),$9::timestamptz)`,[
    suspendedAudit,source.actor_person_id,source.actor_type,source.actor_id,
    ownerOrgId,suspendedSeller,suspendedRequest,
    createHash("sha256").update(suspendedReason).digest("hex"),suspendedStart
  ])
  const sourceEnvelope={
    version:1,source_module:"dogruadres-access",
    source_audit_event_id:suspendedAudit,organization_id:ownerOrgId,
    actor:{person_id:source.actor_person_id,type:source.actor_type,
      id:source.actor_id,role_context:"platform_staff"},
    action:"organization.store_platform_closing_started",
    resource:"store-platform-closing",target_id:suspendedSeller,
    occurred_at:suspendedStart
  }
  await q(`insert into da_audit_outbox
    (id,source_audit_event_id,source_module,envelope_version,envelope,status)
    values ($1,$2,'dogruadres-access',1,$3::jsonb,'pending')`,
    [suspendedOutbox,suspendedAudit,JSON.stringify(sourceEnvelope)])
  await q(`insert into da_store_platform_closing
    (seller_id,organization_id,state,version,request_id,reason,
     source_audit_event_id,started_at)
    values ($1,$2,'notification_unverified',1,$3,$4,$5,$6::timestamptz)`,
    [suspendedSeller,ownerOrgId,suspendedRequest,suspendedReason,
      suspendedAudit,suspendedStart])
  for(const person of [ownerPersonId,staffPersonId]){
    await q(`insert into da_store_platform_closing_email
      (seller_id,person_id,next_attempt_at,attempts,last_result)
      values ($1,$2,$3::timestamptz,4,'unverified_identity')`,
      [suspendedSeller,person,suspendedStart])
  }
  const oldOrg=await q("select status from da_organization where id=$1",[ownerOrgId])
  assert.deepEqual(oldOrg,[{status:"active"}])
  await q("update da_organization set status='suspended' where id=$1",[ownerOrgId])
  try{
    assert.equal(await foundation.settlePlatformClosingAdminFallback(),1,
      "Real fallback must start the 10+20 clock even for suspended Organization")
    const nowClosed=await q(`select deadline_basis,deadline_started_at,
      admin_alert_at,deadline_audit_event_id from da_store_platform_closing
      where seller_id=$1`,[suspendedSeller])
    assert.equal(nowClosed.length,1)
    assert.equal(nowClosed[0].deadline_basis,"admin_alert")
    assert.ok(nowClosed[0].deadline_started_at&&nowClosed[0].deadline_audit_event_id)
    const fallbackPath="/personal/platform/store-closing-email-readiness?"+
      new URLSearchParams({organization_id:ownerOrgId,seller_id:suspendedSeller})
    const fallback=await read(staff,fallbackPath)
    assert.equal(fallback.status,200)
    assert.equal(fallback.body.deadline_basis,"admin_alert")
    assert.deepEqual(fallback.body.terminal_preflight,{
      appeal_window_elapsed:false,appeal_review_pending:false,
      appeal_accepted:false,notification_exception_review_required:true,
      financial_legal_clearance_verified:false,permanent_finalization_enabled:false
    },"Exhausted Owner email must flag Staff exception, not delivery")
    assert.equal(fallback.body.mailbox_delivery_verified_count,0)
    assert.equal((await read(browser,fallbackPath)).status,403)
    const visible=await q(`select id,read_at from
      da_store_platform_closing_admin_notice where seller_id=$1
      and person_id=$2`,[suspendedSeller,staffPersonId])
    assert.equal(visible.length,1)
    const adminRead=await read(staff,"/personal/notifications")
    assert.equal(adminRead.status,200)
    assert.ok(adminRead.body.notifications.some((n:any)=>
      n.id===visible[0].id &&
      n.title==="Kapatma e-postaları teslim edilemedi — yönetici uyarısı"),
      "Staff's personal bell must show the alert despite suspended Organization")
    const foreignRead=await read(browser,"/personal/notifications")
    assert.equal(foreignRead.status,200)
    assert.equal(foreignRead.body.notifications.some((n:any)=>
      n.id===visible[0].id),false,
      "An Owner without a platform closing grant must never see Staff alert")
    assert.equal((await write(browser,"/personal/notifications",
      {id:visible[0].id})).status,403,
      "Foreign Owner must not mark Staff alert as read")
    assert.equal((await write(staff,"/personal/notifications",
      {id:visible[0].id})).status,200)
    assert.ok((await q(`select read_at from
      da_store_platform_closing_admin_notice where id=$1`,
      [visible[0].id]))[0].read_at)
    process.stdout.write("PASS B22 Chrome/HTTPS/PG16: suspended Organization real Admin fallback starts one audited 10+20 clock and visible private Staff notification; Owner list/read denied\n")
  }finally{
    await q("update da_organization set status='active' where id=$1",[ownerOrgId])
  }
  await assertStaffBlockers(staff,sellerId,
    "sonuçlanmamış itiraz veya üst inceleme mevcut",
    ["itiraz kabul edildi; ayrıca kapatma uygulanamaz"])

  // Isolated source-backed synthetic PostgreSQL boundary. No native Seller,
  // money, name release, or mutable production event; live Staff HTTP reads.
  const ownerActors=await q("select e.actor_person_id,e.actor_type,e.actor_id "+
    "from da_store_platform_closing c join da_audit_event e "+
    "on e.id=c.deadline_audit_event_id where c.seller_id=$1",[sellerId])
  assert.equal(ownerActors.length,1)
  const [clock]=await q("select clock_timestamp() as now_at")
  const boundary=new Date(new Date(clock.now_at).getTime()-720*3600000)
  for(const edge of [
    {tag:"before",date:new Date(boundary.getTime()+600000),elapsed:false},
    {tag:"at",date:boundary,elapsed:true}
  ]){
    const syntheticSeller="sel_b22_preflight_"+edge.tag+"_"+
      randomBytes(10).toString("hex")
    const sourceId="daaud_"+randomBytes(16).toString("hex")
    const deadlineId="daaud_"+randomBytes(16).toString("hex")
    const request="dascp_"+randomBytes(16).toString("hex")
    const reason="B22 sentetik otuz gün sınırında Staff ön kontrolü"
    const deadline=edge.date.toISOString()
    const sourceAt=new Date(edge.date.getTime()-3600000).toISOString()
    const events=[
      {id:sourceId,actor:source,role:"platform_staff",
       action:"organization.store_platform_closing_started",at:sourceAt,
       data:{request_id:request,state:"notification_unverified",
        reason_sha256:createHash("sha256").update(reason).digest("hex")}},
      {id:deadlineId,actor:ownerActors[0],role:"owner",
       action:"organization.store_platform_closing_deadline_started",at:deadline,
       data:{basis:"owner_delivery",deadline_started_at:deadline}}
    ]
    for(const event of events){
      await q("insert into da_audit_event "+
        "(id,actor_person_id,actor_type,actor_id,role_context,organization_id,"+
        "action,module,resource,target_id,new_values,occurred_at) "+
        "values ($1,$2,$3,$4,$5,$6,$7,'dogruadres-access',"+
        "'store-platform-closing',$8,$9::jsonb,$10::timestamptz)",[
        event.id,event.actor.actor_person_id,event.actor.actor_type,
        event.actor.actor_id,event.role,ownerOrgId,event.action,
        syntheticSeller,JSON.stringify(event.data),event.at])
      const envelope={version:1,source_module:"dogruadres-access",
        source_audit_event_id:event.id,organization_id:ownerOrgId,
        actor:{person_id:event.actor.actor_person_id,
          type:event.actor.actor_type,id:event.actor.actor_id,
          role_context:event.role},action:event.action,
        resource:"store-platform-closing",target_id:syntheticSeller,
        occurred_at:event.at}
      await q("insert into da_audit_outbox "+
        "(id,source_audit_event_id,source_module,envelope_version,envelope,status) "+
        "values ($1,$2,'dogruadres-access',1,$3::jsonb,'pending')",[
        "daaob_"+randomBytes(16).toString("hex"),event.id,
        JSON.stringify(envelope)])
    }
    await q("insert into da_store_platform_closing "+
      "(seller_id,organization_id,state,version,request_id,reason,"+
      "source_audit_event_id,started_at,deadline_started_at,deadline_basis,"+
      "deadline_audit_event_id) values "+
      "($1,$2,'notification_unverified',1,$3,$4,$5,"+
      "$6::timestamptz,$7::timestamptz,'owner_delivery',$8)",[
      syntheticSeller,ownerOrgId,request,reason,sourceId,
      sourceAt,deadline,deadlineId])
    const path="/personal/platform/store-closing-email-readiness?"+
      new URLSearchParams({organization_id:ownerOrgId,
        seller_id:syntheticSeller})
    const result=await read(staff,path)
    assert.equal(result.status,200)
    assert.equal(result.body.terminal_preflight.appeal_window_elapsed,
      edge.elapsed,"PostgreSQL source-backed 720-hour boundary: "+edge.tag)
    assert.equal(result.body.terminal_preflight.appeal_review_pending,false)
    assert.equal(result.body.terminal_preflight.appeal_accepted,false)
    assert.equal(result.body.native_order_history_observed,false,
      "Synthetic closing with no native Seller/OrderGroup must stay unknown")
    assert.equal(result.body.terminal_preflight.financial_legal_clearance_verified,false)
    assert.equal(result.body.terminal_preflight.permanent_finalization_enabled,false)
    assert.equal((await read(browser,path)).status,403)
    assert.equal((await q("select count(*)::int n from seller where id=$1",
      [syntheticSeller]))[0].n,0)
  }
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: 720-hour Staff preflight false/true, pending first appeal and SMTP admin exception; permanent finalizer denied\n")
  return secondOwnerMembership.id
}

/** The ordinary first appeal is already accepted above. This second and
 * independent disposable Seller has NOT appealed during the first ten days.
 * Its synthetic, canonical T0+11d source/clock is historical fixture data;
 * actual Owner/Staff authorization and the request run through real HTTPS,
 * Chrome, Medusa service and PostgreSQL 16.
 */
export async function verifyB22PlatformClosingSecondStageRequest(input:{
  browser:B06Chrome;staff:B06Chrome;q:Db;foundation:any;
  sourceSellerId:string;reviewSellerId:string;
  ownerPersonId:string;staffPersonId:string;
  organizationId:string;organizationName:string
}):Promise<void>{
  const {browser,staff,q,foundation,sourceSellerId,reviewSellerId,
    ownerPersonId,staffPersonId,organizationId,organizationName}=input
  const readPath="/personal/store-platform-closing?"+
    new URLSearchParams({organization_id:organizationId,seller_id:reviewSellerId})
  const postPath="/personal/store-platform-closing-final-review"
  const clockStart=new Date(Date.now()-11*86400000).toISOString()
  const sourceStart=new Date(Date.now()-12*86400000).toISOString()
  const reason="B22 sentetik on iki gün önceki gerekçeli platform kapatma kaydı"
  const sourceRequest="dascp_"+randomBytes(16).toString("hex")
  const sourceAudit="daaud_"+randomBytes(16).toString("hex")
  const deadlineAudit="daaud_"+randomBytes(16).toString("hex")
  const sourceActors=await q(`select e.actor_person_id,e.actor_type,e.actor_id
    from da_store_platform_closing c
    join da_audit_event e on e.id=c.source_audit_event_id
    where c.seller_id=$1`,[sourceSellerId])
  const deadlineActors=await q(`select e.actor_person_id,e.actor_type,e.actor_id
    from da_store_platform_closing c
    join da_audit_event e on e.id=c.deadline_audit_event_id
    where c.seller_id=$1`,[sourceSellerId])
  assert.equal(sourceActors.length,1)
  assert.equal(deadlineActors.length,1)
  const issuer=sourceActors[0],owner=deadlineActors[0]
  assert.equal(issuer.actor_person_id,staffPersonId)
  assert.equal(owner.actor_person_id,ownerPersonId)
  assert.equal((await q("select count(*)::int n from da_store_platform_closing "+
    "where seller_id=$1",[reviewSellerId]))[0].n,0,
    "The independent Seller must not already have a closure")
  const persistedSeller=await q("select id,status,approved_at,name,handle from seller "+
    "where id=$1",[reviewSellerId])
  assert.equal(persistedSeller.length,1)
  assert.ok(persistedSeller[0].approved_at)
  const sourceBody={request_id:sourceRequest,state:"notification_unverified",
    reason_sha256:createHash("sha256").update(reason).digest("hex")}
  const historical=[
    {id:sourceAudit,role:"platform_staff",actor:issuer,
      action:"organization.store_platform_closing_started",
      payload:sourceBody,when:sourceStart},
    {id:deadlineAudit,role:"owner",actor:owner,
      action:"organization.store_platform_closing_deadline_started",
      payload:{basis:"owner_delivery",deadline_started_at:clockStart},
      when:clockStart}
  ]
  for(const event of historical){
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,role_context,organization_id,
       action,module,resource,target_id,new_values,occurred_at)
      values ($1,$2,$3,$4,$5,$6,$7,'dogruadres-access',
        'store-platform-closing',$8,$9::jsonb,$10::timestamptz)`,[
      event.id,event.actor.actor_person_id,event.actor.actor_type,
      event.actor.actor_id,event.role,organizationId,event.action,
      reviewSellerId,JSON.stringify(event.payload),event.when])
    const envelope={version:1,source_module:"dogruadres-access",
      source_audit_event_id:event.id,organization_id:organizationId,
      actor:{person_id:event.actor.actor_person_id,type:event.actor.actor_type,
        id:event.actor.actor_id,role_context:event.role},
      action:event.action,resource:"store-platform-closing",
      target_id:reviewSellerId,occurred_at:event.when}
    await q(`insert into da_audit_outbox
      (id,source_audit_event_id,source_module,envelope_version,envelope,status)
      values ($1,$2,'dogruadres-access',1,$3::jsonb,'pending')`,[
      "daaob_"+randomBytes(16).toString("hex"),event.id,JSON.stringify(envelope)])
  }
  await q(`insert into da_store_platform_closing
    (seller_id,organization_id,state,version,request_id,reason,
     source_audit_event_id,started_at,deadline_started_at,
     deadline_basis,deadline_audit_event_id)
    values ($1,$2,'notification_unverified',1,$3,$4,$5,$6::timestamptz,
      $7::timestamptz,'owner_delivery',$8)`,[
    reviewSellerId,organizationId,sourceRequest,reason,sourceAudit,
    sourceStart,clockStart,deadlineAudit])
  // The previous Staff/Owner Chrome journey can conceal this tab's private
  // Organization choices while another Person is foregrounded. Re-enter via
  // a genuine fresh page and current server-owned session, never by changing
  // hidden DOM flags or bypassing authorization.
  await browser.send("Page.bringToFront")
  await browser.send("Page.reload",{ignoreCache:true})
  await browser.wait("document.readyState==='complete' && "+
    "document.visibilityState==='visible' && "+
    "!document.getElementById('workspace').hidden && "+
    "Array.from(document.querySelectorAll('#organizations button')).some(b=>"+
    "b.textContent==="+JSON.stringify(organizationName+" — owner")+")")
  await browser.select(organizationName,"owner")
  const prior=await read(browser,readPath)
  assert.equal(prior.status,200,
    "Current protected Owner must access the independent Store's private closure")
  assert.equal(prior.body?.first_appeal_open,false)
  assert.equal(prior.body?.final_review_open,true)
  assert.equal(prior.body?.final_review_requested,false)
  assert.equal(prior.body?.deadline_started_at,clockStart)
  const deniedStaff=await read(staff,readPath)
  assert.equal(deniedStaff.status,403,
    "A platform Staff grant does not grant private foreign Owner authority")
  const requestId="dasfr_"+randomBytes(16).toString("hex")
  const reviewReason="B22 sentetik bağımsız inceleme talebi için özel gerekçe"
  const payload={organization_id:organizationId,seller_id:reviewSellerId,
    request_id:requestId,expected_version:1,reason:reviewReason}
  assert.equal((await write(browser,postPath,payload,true)).status,403,
    "Forged CSRF cannot file an upper review request")
  assert.equal((await write(staff,postPath,payload)).status,403,
    "Foreign protected Owner status cannot be inferred from platform Staff")
  // The positive journey must be a REAL Owner Chrome form submit, not
  // a direct fetch disguised as browser acceptance. The server still owns
  // eligibility, time and request ID; all requests use native CSRF/session.
  await browser.send("Page.bringToFront")
  await browser.wait("document.visibilityState==='visible' && "+
    "!document.getElementById('store-owner-pause-panel').hidden")
  const choice=await browser.eval("(()=>{"+
    "const e=document.querySelector('#store-owner-pause-form select[name=seller_id]');"+
    "if(!e||!Array.from(e.options).some(o=>o.value==="+
    JSON.stringify(reviewSellerId)+"))return false;"+
    "e.value="+JSON.stringify(reviewSellerId)+";"+
    "e.dispatchEvent(new Event('change',{bubbles:true}));"+
    "return e.value==="+JSON.stringify(reviewSellerId)+"})()")
  assert.equal(choice,true,"Private Owner Store picker must offer the exact Store")
  await browser.wait("!document.getElementById('store-platform-appeal-panel').hidden && "+
    "!document.getElementById('store-platform-final-review-form').hidden && "+
    "!document.querySelector('#store-platform-final-review-form button').disabled")
  assert.equal(await browser.eval(
    "document.querySelector('#store-platform-appeal-form button').disabled"),true,
    "A new first appeal cannot be submitted during second-stage review")
  await browser.input("#store-platform-final-review-form textarea[name=reason]",
    reviewReason)
  await browser.click("#store-platform-final-review-form button")
  await browser.wait(
    "document.getElementById('store-platform-appeal-status').textContent.includes("+
    JSON.stringify("Bağımsız üst inceleme başvurusu kaydedildi")+") && "+
    "document.getElementById('store-platform-final-review-form').hidden")
  const saved=await q("select final_review_request_id from da_store_platform_closing "+
    "where seller_id=$1",[reviewSellerId])
  assert.equal(saved.length,1)
  assert.match(saved[0].final_review_request_id,/^dasfr_[a-f0-9]{32}$/)
  const actualRequestId=saved[0].final_review_request_id as string
  const acceptedPayload={...payload,request_id:actualRequestId}
  const after=await read(browser,readPath)
  assert.equal(after.status,200)
  assert.equal(after.body?.final_review_requested,true)
  assert.equal(after.body?.final_review_open,false)
  assert.equal(after.body?.state,"notification_unverified",
    "Filing review never determines the outcome or reopens sales")
  assert.equal(after.body?.deadline_started_at,clockStart)
  assert.equal(after.body?.final_review_reason,reviewReason)
  const staffPath="/personal/platform/store-closing-email-readiness?"+
    new URLSearchParams({organization_id:organizationId,seller_id:reviewSellerId})
  const secondPending=await read(staff,staffPath)
  assert.equal(secondPending.status,200)
  assert.equal(secondPending.body.terminal_preflight.appeal_review_pending,true)
  assert.equal(secondPending.body.terminal_preflight.appeal_accepted,false)
  assert.equal(secondPending.body.terminal_preflight.appeal_window_elapsed,false)
  assert.equal(secondPending.body.terminal_preflight.permanent_finalization_enabled,false)
  await assertStaffBlockers(staff,reviewSellerId,
    "sonuçlanmamış itiraz veya üst inceleme mevcut",
    ["itiraz kabul edildi; ayrıca kapatma uygulanamaz"])
  const replay=await write(browser,postPath,acceptedPayload)
  assert.equal(replay.status,200)
  assert.equal(replay.body?.replayed,true)
  assert.equal((await write(browser,postPath,{
    ...acceptedPayload,request_id:"dasfr_"+randomBytes(16).toString("hex")
  })).status,409)
  const persisted=await q(`select c.final_review_request_id,c.final_review_audit_event_id,
    c.final_review_requested_at,c.deadline_started_at,c.state,
    e.new_values,x.source_audit_event_id
    from da_store_platform_closing c
    join da_audit_event e on e.id=c.final_review_audit_event_id
    join da_audit_outbox x on x.source_audit_event_id=e.id
    where c.seller_id=$1`,[reviewSellerId])
  assert.equal(persisted.length,1)
  assert.equal(persisted[0].final_review_request_id,actualRequestId)
  assert.equal(persisted[0].deadline_started_at.toISOString(),clockStart)
  assert.equal(persisted[0].state,"notification_unverified")
  assert.equal(persisted[0].new_values.reason_sha256,
    createHash("sha256").update(reviewReason).digest("hex"))
  assert.equal(JSON.stringify(persisted).includes(reviewReason),false,
    "Audit/outbox may contain only the reason digest")
  assert.equal((await q("select count(*)::int n from da_notification_receipt "+
    "where audit_event_id=$1",[persisted[0].final_review_audit_event_id]))[0].n>=1,true)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([reviewSellerId]),false)
  const notifications=await read(browser,"/personal/notifications")
  assert.equal(notifications.status,200)
  assert.ok(notifications.body?.notifications?.some((item:any)=>
    item.title==="Üst inceleme başvurusu kaydedildi"),
    "The Owner must see a private, actor-neutral review receipt")
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: synthetic T0+11d second-stage Owner request, real protected Owner/foreign Staff/CSRF/replay, one durable audit/outbox and private notice; Store stays closed, original 10+20 clock unchanged; stage time fixture is synthetic, real Owner Chrome form submitted and confirmed\n")
}

/** Real third Person and distinct Staff review task. Runs only in isolated
 * B22 native Chrome/HTTPS/PG16 acceptance after the Owner's second-stage
 * form has already created an unreviewed request.
 */
export async function verifyB22IndependentStaffClosingDecision(input:{
  host:string;crt:string;browsers:B06Chrome[];
  ownerBrowser:B06Chrome;initialStaff:B06Chrome;
  q:Db;foundation:any;organizationId:string;
  reviewSellerId:string;initialSellerId:string;
  ownerPersonId:string;originalStaffPersonId:string
}):Promise<void>{
  const {host,crt,browsers,ownerBrowser,initialStaff,q,foundation,
    organizationId,reviewSellerId,initialSellerId,
    ownerPersonId,originalStaffPersonId}=input
  const path="/personal/platform/store-closing-reviews"
  const ownerPath="/personal/store-platform-closing?"+
    new URLSearchParams({organization_id:organizationId,seller_id:reviewSellerId})
  const before=await q("select c.final_review_request_id,c.final_review_requested_at,"+
    "c.deadline_started_at,c.state from da_store_platform_closing c "+
    "where c.seller_id=$1",[reviewSellerId])
  assert.equal(before.length,1)
  assert.equal(before[0].state,"notification_unverified")
  assert.match(before[0].final_review_request_id,/^dasfr_[a-f0-9]{32}$/)
  assert.equal((await read(initialStaff,path)).status,403,
    "Original closing Staff without the separate task cannot read private reviews")

  const independent=new B06Chrome(host,"B");browsers.push(independent)
  await independent.start(crt)
  const email="b22-closing-review-"+randomBytes(10).toString("hex")+"@example.invalid"
  const password="Task-Strong-"+randomBytes(18).toString("hex")
  await independent.click("#register-details summary")
  await independent.input("#register input[name=first_name]","Synthetic")
  await independent.input("#register input[name=last_name]","ClosureReviewer")
  await independent.input("#register input[name=email]",email)
  await independent.input("#register input[name=mobile_phone]","+905551234581")
  await independent.input("#register input[name=password]",password)
  await independent.click("#register button")
  await independent.wait("document.getElementById('status').textContent.includes('Kişi hesabı kaydedildi')")
  await independent.input("#login input[name=email]",email)
  await independent.input("#login input[name=password]",password)
  await independent.click("#login button")
  await independent.wait("!document.getElementById('workspace').hidden || !document.getElementById('mfa-enrollment').hidden")
  if(await independent.eval("!document.getElementById('mfa-enrollment').hidden")){
    await independent.input("#mfa-enroll-start input[name=email]",email)
    await independent.input("#mfa-enroll-start input[name=password]",password)
    await independent.click("#mfa-enroll-start button")
    await independent.wait("!document.getElementById('mfa-enroll-verify').hidden && document.getElementById('mfa-seed').value.length>0")
    const url=await independent.eval("document.getElementById('mfa-seed').value")
    const seed=url.startsWith("otpauth:")?new URL(url).searchParams.get("secret"):url
    assert.ok(seed)
    await independent.input("#mfa-enroll-verify input[name=code]",otp(seed!))
    await independent.click("#mfa-enroll-verify button")
  }
  await independent.wait("!document.getElementById('workspace').hidden")
  const beforeStrong=await independent.token()
  assert.match(beforeStrong??"",/^[A-Za-z0-9_-]{43}$/)
  const strongRows=await q("select last_strong_auth_at from da_browser_session "+
    "where id=$1",[createHash("sha256").update(beforeStrong!).digest("hex")])
  assert.equal(strongRows.length,1)
  if(!strongRows[0].last_strong_auth_at){
    // Optional MFA enrollment also must be completed through the actual UI:
    // a synthetic Staff grant never upgrades a non-strong Person session.
    await independent.wait("!document.getElementById('mfa-person').hidden")
    assert.equal(await independent.eval(
      "!document.getElementById('mfa-enroll-launch').hidden"),true)
    await independent.click("#mfa-enroll-launch")
    await independent.input("#mfa-enroll-start input[name=email]",email)
    await independent.input("#mfa-enroll-start input[name=password]",password)
    await independent.click("#mfa-enroll-start button")
    await independent.wait("!document.getElementById('mfa-enroll-verify').hidden&&"+
      "document.getElementById('mfa-seed').value.length>0")
    const enrolled=await independent.eval("document.getElementById('mfa-seed').value")
    const seed=enrolled.startsWith("otpauth:")?
      new URL(enrolled).searchParams.get("secret"):enrolled
    assert.ok(seed)
    await independent.input("#mfa-enroll-verify input[name=code]",otp(seed!))
    await independent.click("#mfa-enroll-verify button")
    await independent.wait("!document.getElementById('workspace').hidden")
  }
  const active=await independent.token()
  assert.match(active??"",/^[A-Za-z0-9_-]{43}$/)
  const proof=await q("select last_strong_auth_at from da_browser_session "+
    "where id=$1",[createHash("sha256").update(active!).digest("hex")])
  assert.equal(proof.length,1)
  assert.ok(proof[0].last_strong_auth_at,
    "Independent Staff review must use real current native strong MFA")
  const ids=await q("select b.person_id from da_login_binding b "+
    "join public.customer c on c.id=b.actor_id where b.actor_type='customer' "+
    "and c.email=$1 and b.revoked_at is null and b.verified_at is not null",[email])
  assert.equal(ids.length,1)
  const reviewerId=ids[0].person_id as string
  assert.notEqual(reviewerId,ownerPersonId)
  assert.notEqual(reviewerId,originalStaffPersonId)
  assert.equal((await read(independent,path)).status,403,
    "Strong but ungranted Staff cannot read private decisions")
  let grantId="da_staff_b22_review_"+randomBytes(8).toString("hex")
  await q("insert into da_platform_staff_grant "+
    "(id,person_id,task,resource,granted_by_person_id,reason) "+
    "values ($1,$2,'store.closing.review','platform',$2,"+
    "'B22 task-only independent reviewer grant')",[grantId,reviewerId])
  // The original Staff may be granted the same task, but cannot decide a
  // closure that they personally initiated. This test-only grant is revoked.
  const originalGrant="da_staff_b22_original_"+randomBytes(8).toString("hex")
  await q("insert into da_platform_staff_grant "+
    "(id,person_id,task,resource,granted_by_person_id,reason) "+
    "values ($1,$2,'store.closing.review','platform',$2,"+
    "'B22 task-only original Staff negative')",[originalGrant,originalStaffPersonId])

  const opened=await read(independent,path)
  assert.equal(opened.status,200)
  assert.ok(Array.isArray(opened.body?.candidates))
  const caseItem=opened.body.candidates.find((c:any)=>c.seller_id===reviewSellerId)
  assert.ok(caseItem,"Reviewer must see the exact, independently filed request")
  assert.equal(caseItem.stage,"second_review")
  assert.equal(caseItem.source_request_id,before[0].final_review_request_id)
  assert.equal(opened.body.candidates.some((c:any)=>c.seller_id===initialSellerId),true,
    "Independent reviewer may see another pending first appeal")
  assert.ok(typeof caseItem.request_reason==="string"&&caseItem.request_reason.length>10)
  // Force a real in-flight GET to pass its initial Staff check while the
  // revocation has not committed. The final same-grant FOR SHARE must wait
  // for that concurrent PostgreSQL transaction, then reject the private
  // reason after the revoke commits. No sleeps or mocks on the HTTP route.
  await q("begin")
  let revokedCommitted=false
  let inFlight:Promise<{status:number;body:any}>|undefined
  try{
    const changed=await q("update da_platform_staff_grant "+
      "set revoked_at=clock_timestamp() "+
      "where id=$1 and revoked_at is null returning id",[grantId])
    assert.equal(changed.length,1)
    // Match the PostgreSQL *blocking relationship*, not SQL text as seen
    // in pg_stat_activity: the Medusa driver may use a prepared statement
    // name instead of the literal FOR SHARE query in that diagnostic field.
    const [{pid:revokerPid}]=await q("select pg_backend_pid()::int as pid")
    let requestSettled=false
    inFlight=read(independent,path).catch(()=>({status:0,body:null}))
      .then(response=>{requestSettled=true;return response})
    let waitingForGrant=false
    for(let attempt=0;attempt<200;attempt++){
      const blocked=await q("select count(*)::int n from pg_stat_activity "+
        "where pid<>$1 and $1=any(pg_blocking_pids(pid))",[revokerPid])
      if(Number(blocked[0]?.n)>0){waitingForGrant=true;break}
      if(requestSettled)break
      await new Promise(resolve=>setTimeout(resolve,50))
    }
    assert.equal(waitingForGrant,true,
      "Real private GET must be blocked by the task-only grant revocation transaction; "+
      "request_finished_early="+requestSettled)
    await q("commit")
    revokedCommitted=true
    const denied=await inFlight
    assert.equal(denied.status,403,
      "GET overlapping committed Staff revocation must deny private appeals")
    assert.equal(JSON.stringify(denied.body).includes(caseItem.request_reason),false,
      "Private Owner appeal reason cannot escape during task revocation")
    assert.equal((await read(independent,path)).status,403,
      "A fresh GET after committed revocation is also denied")
  }finally{
    if(!revokedCommitted)await q("rollback")
    if(inFlight)await inFlight
  }
  // This synthetic reviewer may be re-authorized only by a NEW task grant,
  // never by clearing the revoked grant. All test rows are disposable.
  grantId="da_staff_b22_review_regrant_"+randomBytes(8).toString("hex")
  await q("insert into da_platform_staff_grant "+
    "(id,person_id,task,resource,granted_by_person_id,reason) "+
    "values ($1,$2,'store.closing.review','platform',$2,"+
    "'B22 fresh grant after in-flight revocation negative')",[grantId,reviewerId])
  assert.equal((await read(independent,path)).status,200)
  const payload={organization_id:organizationId,seller_id:reviewSellerId,
    source_request_id:caseItem.source_request_id,
    request_id:"dasdr_"+randomBytes(16).toString("hex"),
    decision:"accepted",reason:"Başvurudaki gerekçeler incelendi; itiraz yerinde bulundu"}
  assert.equal((await write(independent,path,payload,true)).status,403)
  assert.equal((await write(initialStaff,path,payload)).status,403,
    "Even a separately granted original decision maker cannot judge their own case")
  const noDecision=await q("select review_decision_request_id from da_store_platform_closing "+
    "where seller_id=$1",[reviewSellerId])
  assert.equal(noDecision[0].review_decision_request_id,null)
  // Trigger the already-bound refresh from an authorized real Chrome session.
  await independent.eval("document.getElementById('platform-closing-review-refresh').onclick()")
  await independent.wait("!document.getElementById('platform-closing-review-panel').hidden && "+
    "document.querySelectorAll('#platform-closing-review-list form').length>0")
  // Untrusted Store IDs cross CDP only as typed call arguments, never
  // interpolated into a JavaScript expression or CSS selector in click().
  const selected=await independent.callFunction(
    "function(seller){const f=Array.from(document.querySelectorAll("+
    "'#platform-closing-review-list form')).find(x=>x.dataset.sellerId===seller);"+
    "if(!f)return false;f.dataset.b22Selected='true';"+
    "f.querySelector('select[name=decision]').value='accepted';return true}",
    reviewSellerId)
  assert.equal(selected,true)
  const selector="#platform-closing-review-list form[data-b22-selected=true]"
  await independent.input(selector+" textarea[name=reason]",payload.reason)
  await independent.click(selector+" button[type=submit]")
  await independent.wait("!document.querySelector("+
    JSON.stringify(selector)+")")
  const stored=await q("select c.review_decision_request_id,c.review_decision,"+
    "c.review_decision_reason,c.review_decision_audit_event_id,c.review_decided_by_person_id,"+
    "c.deadline_started_at,c.state from da_store_platform_closing c where c.seller_id=$1",
    [reviewSellerId])
  assert.equal(stored.length,1)
  assert.match(stored[0].review_decision_request_id,/^dasdr_[a-f0-9]{32}$/)
  assert.equal(stored[0].review_decision,"accepted")
  const acceptedPath="/personal/platform/store-closing-email-readiness?"+
    new URLSearchParams({organization_id:organizationId,seller_id:reviewSellerId})
  const acceptedPreflight=await read(initialStaff,acceptedPath)
  assert.equal(acceptedPreflight.status,200)
  assert.equal(acceptedPreflight.body.terminal_preflight.appeal_review_pending,false)
  assert.equal(acceptedPreflight.body.terminal_preflight.appeal_accepted,true)
  assert.equal(acceptedPreflight.body.terminal_preflight.appeal_window_elapsed,false)
  assert.equal(acceptedPreflight.body.terminal_preflight.financial_legal_clearance_verified,false)
  assert.equal(acceptedPreflight.body.terminal_preflight.permanent_finalization_enabled,false)
  assert.equal(stored[0].review_decision_reason,payload.reason)
  assert.equal(stored[0].review_decided_by_person_id,reviewerId)
  assert.equal(stored[0].deadline_started_at.toISOString(),
    before[0].deadline_started_at.toISOString())
  assert.equal(stored[0].state,before[0].state)
  const eventRows=await q("select e.action,e.role_context,e.new_values,"+
    "o.envelope from da_audit_event e join da_audit_outbox o "+
    "on o.source_audit_event_id=e.id where e.id=$1",
    [stored[0].review_decision_audit_event_id])
  assert.equal(eventRows.length,1)
  assert.equal(eventRows[0].action,"organization.store_platform_closing_review_decided")
  assert.equal(eventRows[0].role_context,"platform_staff")
  assert.equal(eventRows[0].new_values.reason_sha256,
    createHash("sha256").update(payload.reason).digest("hex"))
  assert.equal(JSON.stringify(eventRows).includes(payload.reason),false)
  assert.equal((await q("select count(*)::int n from da_notification_receipt "+
    "where audit_event_id=$1",[stored[0].review_decision_audit_event_id]))[0].n>=1,true)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([reviewSellerId]),false,
    "Review accepted does not reopen Seller or enable checkout")
  const same=await write(independent,path,{...payload,
    request_id:stored[0].review_decision_request_id})
  assert.equal(same.status,200)
  assert.equal(same.body?.replayed,true)
  assert.equal((await write(independent,path,payload)).status,409,
    "A different request id cannot overwrite the reasoned decision")
  const privateOwner=await read(ownerBrowser,ownerPath)
  assert.equal(privateOwner.status,200)
  assert.equal(privateOwner.body?.review_decision,"accepted")
  assert.equal(privateOwner.body?.review_decision_reason,payload.reason)
  await ownerBrowser.click("#store-platform-appeal-refresh")
  await ownerBrowser.wait("document.getElementById('store-platform-review-decision').textContent.includes("+
    JSON.stringify(payload.reason)+")")
  const privateNotice=await read(ownerBrowser,"/personal/notifications")
  assert.equal(privateNotice.status,200)
  assert.ok(privateNotice.body?.notifications?.some((x:any)=>
    x.title==="Mağaza itirazı hakkında gerekçeli karar verildi"))
  // A different pending FIRST appeal is also decided, under two real
  // concurrent HTTPS writes from this same independently authorized reviewer.
  // It must allow one decision only, with rejected status and no sale reopening.
  const firstPending=opened.body.candidates.find((c:any)=>
    c.seller_id===initialSellerId&&c.stage==="first_appeal")
  assert.ok(firstPending)
  const reason="İlk itiraz incelendi; platform kararı korunuyor ve satışlar kapalı"
  const two=[
    {organization_id:firstPending.organization_id,seller_id:initialSellerId,
     source_request_id:firstPending.source_request_id,
     request_id:"dasdr_"+randomBytes(16).toString("hex"),
     decision:"rejected",reason},
    {organization_id:firstPending.organization_id,seller_id:initialSellerId,
     source_request_id:firstPending.source_request_id,
     request_id:"dasdr_"+randomBytes(16).toString("hex"),
     decision:"rejected",reason}
  ]
  const pair=await independent.callFunction(
    "async function(raw){const items=JSON.parse(raw);"+
    "const s=await(await fetch('/personal/session')).json();"+
    "return await Promise.all(items.map(async p=>{"+
    "const r=await fetch('/personal/platform/store-closing-reviews',"+
    "{method:'POST',headers:{'content-type':'application/json',"+
    "'x-csrf-token':s.csrf_token},body:JSON.stringify(p)});"+
    "return {status:r.status,body:await r.json()}}))}",
    JSON.stringify(two))
  assert.deepEqual(pair.map((p:any)=>p.status).sort(),[200,409])
  const firstStored=(await q("select state,review_decision,review_decision_request_id,"+
    "review_decision_audit_event_id from da_store_platform_closing "+
    "where seller_id=$1",[initialSellerId]))[0]
  assert.equal(firstStored.state,"appealed")
  assert.equal(firstStored.review_decision,"rejected")
  const rejectedPath="/personal/platform/store-closing-email-readiness?"+
    new URLSearchParams({organization_id:firstPending.organization_id,
      seller_id:initialSellerId})
  const rejectedPreflight=await read(initialStaff,rejectedPath)
  assert.equal(rejectedPreflight.status,200)
  assert.equal(rejectedPreflight.body.terminal_preflight.appeal_review_pending,false)
  assert.equal(rejectedPreflight.body.terminal_preflight.appeal_accepted,false)
  assert.equal(rejectedPreflight.body.terminal_preflight.appeal_window_elapsed,false)
  assert.equal(rejectedPreflight.body.terminal_preflight.financial_legal_clearance_verified,false)
  assert.equal(rejectedPreflight.body.terminal_preflight.permanent_finalization_enabled,false)
  assert.ok(two.some(x=>x.request_id===firstStored.review_decision_request_id))
  assert.equal((await q("select count(*)::int n from da_audit_event "+
    "where id=$1 and action='organization.store_platform_closing_review_decided'",
    [firstStored.review_decision_audit_event_id]))[0].n,1)
  assert.equal((await q("select count(*)::int n from da_audit_outbox "+
    "where source_audit_event_id=$1",[firstStored.review_decision_audit_event_id]))[0].n,1)
  assert.equal(await foundation.storeOwnerPauseAcceptingOrders([initialSellerId]),false)
  await assertStaffBlockers(initialStaff,reviewSellerId,
    "itiraz kabul edildi; ayrıca kapatma uygulanamaz",
    ["sonuçlanmamış itiraz veya üst inceleme mevcut"])
  await assertStaffBlockers(initialStaff,initialSellerId,
    "mali ve hukuki yükümlülüklerin temizlendiği doğrulanmadı",
    ["sonuçlanmamış itiraz veya üst inceleme mevcut",
     "itiraz kabul edildi; ayrıca kapatma uygulanamaz"])
  // Current protected Organization Owner cannot self-judge by acquiring a
  // Staff task grant; the source and decision authority remain separate.
  const ownerGrant="da_staff_b22_owner_"+randomBytes(8).toString("hex")
  await q("insert into da_platform_staff_grant "+
    "(id,person_id,task,resource,granted_by_person_id,reason) "+
    "values ($1,$2,'store.closing.review','platform',$2,"+
    "'B22 task-only Owner self-review negative')",[ownerGrant,ownerPersonId])
  assert.equal((await write(ownerBrowser,path,{
    ...two[0],request_id:firstStored.review_decision_request_id})).status,403,
    "Protected Owner cannot judge their own Organization even with a Staff task")
  await q("update da_platform_staff_grant set revoked_at=clock_timestamp() "+
    "where id=$1",[ownerGrant])

  // Revocation denies even a historically accepted idempotent replay.
  await q("update da_platform_staff_grant set revoked_at=clock_timestamp() "+
    "where id in ($1,$2)",[grantId,originalGrant])
  assert.equal((await read(independent,path)).status,403)
  assert.equal((await write(independent,path,{
    ...payload,request_id:stored[0].review_decision_request_id})).status,403)
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: independent third Person strong Staff review decision, original Staff self-review denied, private Owner reason/notice, immutable clock and sales block; repeat idempotent, first-stage parallel single decision, revoked grant denied\n")
}
