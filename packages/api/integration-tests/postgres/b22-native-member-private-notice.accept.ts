/** B22 #252: Owner-B private notice after real native SellerMember UI link.
 * Reuse existing B22 native Member/Owner browser and disposable PG16.
 * Synthetic protected-Owner fixture is NOT a real Owner promotion API.
 * Exported from a narrow test-only helper to keep the established B22
 * full runner under TypeScript's control-flow source-size limit.
 */
import assert from "node:assert/strict"
import {randomBytes} from "node:crypto"
import {createServer} from "node:net"
import {runOwnerClosingEmailTick} from "../../src/jobs/dogruadres-platform-closing-email"
import {until} from "./b19-browser"
import type {B06Chrome} from "./b06-ui-browser"

export async function verifyB22CoownerNativeMemberReadback(input:{
  browser:B06Chrome;reviewer:B06Chrome;container:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  personA:string;personB:string;memberMembershipId:string;
  orgA:string;orgB:string;orgName:string;ownerStoreId:string;emailA:string;emailB:string;
}):Promise<void>{
  const {browser,reviewer,container,q,personA,personB,memberMembershipId,
    orgA,orgB,orgName,ownerStoreId,emailA,emailB}=input
  // #252 second Owner after REAL native SellerMember association:
  // the approved Owner UI above established B's actual Member/Seller
  // link. At this point B remains an ordinary Organization Member. This
  // task-owned PG16 role fixture is NOT an Owner-promotion product API.
  const privateClosing=async(actor:B06Chrome,orgId:string)=>
    actor.callFunction("async function(org,seller){"+
      "const r=await fetch('/organization/store-owner-closing?'+new URLSearchParams("+
      "{organization_id:org,seller_id:seller}),{cache:'no-store'});"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}}",
      orgId,ownerStoreId)
  const ownerMembership=await q("select id,role,status,protected_owner,revoked_at "+
    "from da_organization_membership where id=$1 and person_id=$2 "+
    "and organization_id=$3 and deleted_at is null",
    [memberMembershipId,personB,orgA])
  assert.equal(ownerMembership.length,1)
  assert.equal(ownerMembership[0].role,"member")
  assert.equal(ownerMembership[0].protected_owner,false)
  assert.equal(ownerMembership[0].status,"active")
  assert.equal(ownerMembership[0].revoked_at,null)
  const firstNotice=await privateClosing(browser,orgA)
  assert.equal(firstNotice.status,200)
  assert.equal(firstNotice.body.state,"withdrawn",
    "Read the latest canonical withdrawal, not the older SMTP-accepted event")
  assert.equal(firstNotice.body.permanent_finalization_enabled,false)
  const latestEvent=await q("select source_audit_event_id from da_store_owner_closing "+
    "where seller_id=$1 and organization_id=$2 and state='withdrawn'",
    [ownerStoreId,orgA])
  assert.equal(latestEvent.length,1)
  const receipts=await q("select person_id from da_notification_receipt "+
    "where audit_event_id=$1 order by person_id",[latestEvent[0].source_audit_event_id])
  assert.deepEqual(receipts.map((r:any)=>r.person_id).sort(),
    [personA,personB].sort())
  // #275: use this already-disposable real Owner A/Owner B fixture for
  // the personal notification-bell security boundary, not an SQL mock.
  const readBell=async(actor:B06Chrome,selectedOrg="")=>
    actor.callFunction("async function(org){"+
      "const suffix=org?'?organization='+encodeURIComponent(org):'';"+
      "const r=await fetch('/organization/notifications'+suffix,{cache:'no-store'});"+
      "return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}}",
      selectedOrg)
  const [ownReceipt]=await q("select id,read_at from da_notification_receipt "+
    "where person_id=$1 and audit_event_id=$2",
    [personA,latestEvent[0].source_audit_event_id])
  assert.ok(ownReceipt,"Task-owned Owner A must have a genuine company receipt")
  const personalBell=await readBell(browser)
  const companyBell=await readBell(browser,orgA)
  assert.equal(personalBell.status,200)
  assert.equal(companyBell.status,200)
  assert.ok(String(personalBell.cache).includes("no-store"))
  const withdrawnTitle="Mağaza kapatma talebi geri çekildi"
  assert.equal(personalBell.body.notifications.some((n:any)=>
    n.title===withdrawnTitle||n.context===orgName),false,
    "Personal bell cannot expose company Store events or company names")
  assert.equal(companyBell.body.notifications.some((n:any)=>
    n.title===withdrawnTitle&&n.context===orgName),true,
    "Verified Owner in selected Company must still read its own company notice")
  assert.equal(companyBell.body.unread_count>=personalBell.body.unread_count+
    (ownReceipt.read_at===null?1:0),true,
    "Personal unread count cannot include selected Company private events")
  const noOrgRead=await browser.callFunction("async function(id){"+
    "const s=await fetch('/personal/session',{cache:'no-store'});"+
    "const session=await s.json();"+
    "const r=await fetch('/organization/notifications',{method:'POST',"+
      "headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},"+
      "body:JSON.stringify({id}),cache:'no-store'});"+
    "return {status:r.status,body:await r.json()}}",ownReceipt.id)
  assert.equal(noOrgRead.status,403,
    "A company receipt cannot be marked read from personal context")
  assert.deepEqual((await q("select read_at from da_notification_receipt "+
    "where id=$1",[ownReceipt.id]))[0],{read_at:ownReceipt.read_at},
    "Denied personal read must not write another workspace receipt")
  process.stdout.write("PASS B19 Chrome/HTTPS/PG16: personal bell excludes company Store receipt and unread count; selected Owner workspace sees its own receipt; unscoped read denied without mutation\n")
  // Native SellerMember alone never grants Owner-private notification access.
  const memberOnly=await privateClosing(reviewer,orgA)
  assert.deepEqual({status:memberOnly.status,body:memberOnly.body},
    {status:403,body:{message:"Access denied"}})
  assert.equal((await privateClosing(reviewer,orgB)).status,403)
  const elevated=await q("update da_organization_membership "+
    "set role='owner',protected_owner=true,updated_at=clock_timestamp() "+
    "where id=$1 and person_id=$2 and role='member' "+
    "and protected_owner=false and status='active' and revoked_at is null "+
    "returning id",[memberMembershipId,personB])
  assert.deepEqual(elevated,[{id:memberMembershipId}])
  try{
    const own=await privateClosing(reviewer,orgA)
    assert.equal(own.status,200,
      "Live protected Owner AND real native SellerMember must authorize own state")
    assert.deepEqual(own.body.email_notice,{
      status:"queued",attempts:0,smtp_accepted:false,
      mailbox_delivery_verified:false
    },"B must see only the latest own queued receipt, not A's older synthetic accepted SMTP result")
    assert.deepEqual(own.body.notification_coverage,{
      protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
    })
    assert.equal(own.body.state,"withdrawn")
    assert.equal(own.body.permanent_finalization_enabled,false)
    assert.equal(own.body.can_withdraw,false)
    assert.ok(String(own.cache).includes("no-store"))
    assert.equal(JSON.stringify(own.body).includes(emailA),false)
    assert.equal(JSON.stringify(own.body).includes("message_id"),false)
    assert.equal(JSON.stringify(own.body).includes("person_id"),false)
    assert.equal((await privateClosing(reviewer,orgB)).status,403,
      "Cross-Organization Store-private result must stay denied after promotion")
    // Real authenticated Chrome UI, not a helper-forged Owner response.
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.select(orgName,"owner")
    await reviewer.wait("!document.getElementById('store-owner-closing-panel').hidden && "+
      "Array.from(document.querySelectorAll("+
      "'#store-owner-pause-form select[name=seller_id] option')).some("+
      "o=>o.value==="+JSON.stringify(ownerStoreId)+")")
    await reviewer.eval("(()=>{const s=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');s.value="+
      JSON.stringify(ownerStoreId)+";s.dispatchEvent(new Event('change',"+
      "{bubbles:true}));return true})()")
    await reviewer.wait("document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Kapatma talebi geri çekildi.') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Korunan Owner bildirim kayıtları: 2/2') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Kişisel bildirim kaydedildi; e-posta denemesi sırada.')")
    const textShown=await reviewer.eval(
      "document.getElementById('store-owner-closing-status').textContent")
    assert.equal(textShown.includes(emailA),false)
    assert.equal(textShown.includes("Message-ID"),false)
    assert.equal(await reviewer.eval(
      "document.getElementById('store-owner-closing-status').getAttribute('role')"),
      "status")
    const firstAfter=await privateClosing(browser,orgA)
    assert.equal(firstAfter.status,200)
    assert.deepEqual(firstAfter.body.email_notice,firstNotice.body.email_notice,
      "A's individual SMTP status/attempts remain unchanged by B's Owner read")
    assert.equal(firstAfter.body.state,firstNotice.body.state)
    assert.equal(firstAfter.body.seller_id,firstNotice.body.seller_id)
    assert.equal(firstAfter.body.permanent_finalization_enabled,false)
    assert.deepEqual(firstAfter.body.notification_coverage,{
      protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false
    },"Aggregate count must reflect newly protected B, never reveal B's private attempts")
    assert.equal(JSON.stringify(firstAfter.body).includes(emailA),false)
    assert.equal(JSON.stringify(firstAfter.body).includes("message_id"),false)
    // Snapshot ALL first-Owner durable SMTP outcomes (including the
    // earlier accepted source), not only B's latest withdrawal receipt.
    // The helper may prepare and remove one task-only attempt row for A.
    const firstMailSnapshot=()=>q("select audit_event_id,attempts,"+
      "last_result,message_id,accepted_at,last_attempt_at,claim_id,lease_until "+
      "from da_store_owner_closing_email where person_id=$1 "+
      "order by audit_event_id",[personA])
    const firstSqlBefore=await firstMailSnapshot()
    // Last missing native integration edge after #354: this person became
    // a real Mercur SellerMember BEFORE their protected Owner SMTP retry.
    // Exercise the SAME worker on the latest canonical withdrawal event;
    // do not infer SMTP acceptance from the earlier private GET 200.
    await verifyLinkedNativeMemberOwnerMail({
      reviewer,container,q,personA,personB,orgName,ownerStoreId,
      latestEvent:latestEvent[0].source_audit_event_id,
      emailB,privateClosing:()=>privateClosing(reviewer,orgA)
    })
    assert.deepEqual(await firstMailSnapshot(),firstSqlBefore,
      "B SMTP DATA and helper cleanup must preserve ALL A audit-event "+
      "SMTP attempts, acceptance status and private Message-IDs")
    const firstAfterB=await privateClosing(browser,orgA)
    assert.equal(firstAfterB.status,200)
    assert.deepEqual(firstAfterB.body.email_notice,firstAfter.body.email_notice,
      "A's private HTTPS email status after B's SMTP must stay unchanged")
    assert.deepEqual(firstAfterB.body.notification_coverage,
      firstAfter.body.notification_coverage)
    assert.equal(firstAfterB.body.state,firstAfter.body.state)
    assert.equal(firstAfterB.body.seller_id,firstAfter.body.seller_id)
    assert.equal(firstAfterB.body.permanent_finalization_enabled,false)
    assert.ok(String(firstAfterB.cache).includes("no-store"))
    assert.equal(JSON.stringify(firstAfterB.body).includes(emailB),false)
    assert.equal(JSON.stringify(firstAfterB.body).includes("message_id"),false)
    assert.equal(JSON.stringify(firstAfterB.body).includes("person_id"),false)
  }finally{
    const restoredRole=await q("update da_organization_membership "+
      "set role=$2,protected_owner=$3,revoked_at=$4,"+
      "updated_at=clock_timestamp() where id=$1 returning id",
      [memberMembershipId,ownerMembership[0].role,
        ownerMembership[0].protected_owner,ownerMembership[0].revoked_at])
    assert.deepEqual(restoredRole,[{id:memberMembershipId}])
    const revokedRead=await privateClosing(reviewer,orgA)
    assert.deepEqual({status:revokedRead.status,body:revokedRead.body},
      {status:403,body:{message:"Access denied"}},
      "Loss of protected Owner membership instantly denies a live SellerMember")
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.select(orgName,"member")
    // Restore the visible ordinary-Member product workspace before the
    // existing downstream UI acceptance clicks its native draft refresh.
    // A role label alone does not establish that the real panel has rendered.
    await reviewer.wait("!document.getElementById('product-draft-panel').hidden && "+
      "(()=>{const b=document.getElementById('product-draft-refresh');"+
      "if(!b)return false;const r=b.getBoundingClientRect();"+
      "return r.width>0&&r.height>0})()")
  }
  process.stdout.write("PASS B22 Chrome/HTTPS/PG16: second Person native SellerMember linked through Owner UI; member GET403, test-only protected Owner GET200 own queued receipt and 2/2 coverage, foreign Org403, reversible role removal GET403 and no mailbox delivery/finalizer\n")
}

/**
 * Real native Medusa Auth verification + Owner SMTP after actual Mercur
 * SellerMember linking in the existing disposable B22 Chrome/PG16 runtime.
 * A's event attempt is temporarily deferred and restored for isolation;
 * never turn SMTP 250 into mailbox delivery or mutate production data.
 */
async function verifyLinkedNativeMemberOwnerMail(input:{
  reviewer:B06Chrome;container:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  personA:string;personB:string;latestEvent:string;emailB:string;
  orgName:string;ownerStoreId:string;
  privateClosing:()=>Promise<any>;
}){
  const {reviewer,container,q,personA,personB,latestEvent,emailB,
    orgName,ownerStoreId,privateClosing}=input
  assert.equal(process.env.CI,"true")
  assert.equal(process.env.GITHUB_ACTIONS,"true")
  assert.equal(process.env.PG_MFA_TEST_SCOPE,"b22-ui")
  assert.equal(process.env.PG_MFA_TEST_SENTINEL,"mfa-pg16-disposable-ci-v1")
  // Private receipts exist before the scheduler creates SMTP attempt
  // rows. Prove the immutable canonical withdrawal/outbox and each receipt
  // first; seed ONLY these task-owned attempt rows for B's targeted SMTP
  // scenario so the test does not send A's unrelated pending mail.
  const source=await q("select e.id from da_store_owner_closing c "+
    "join da_audit_event e on e.id=c.source_audit_event_id "+
    "join da_audit_outbox x on x.source_audit_event_id=e.id "+
    "and x.source_module='dogruadres-access' and x.deleted_at is null "+
    "where e.id=$1 and c.state='withdrawn' and e.deleted_at is null",
    [latestEvent])
  assert.equal(source.length,1)
  const receipts=await q("select person_id from da_notification_receipt "+
    "where audit_event_id=$1 order by person_id",[latestEvent])
  assert.deepEqual(receipts.map((x:any)=>x.person_id).sort(),
    [personA,personB].sort())
  const insertedA=await q("insert into da_store_owner_closing_email "+
    "(audit_event_id,person_id,next_attempt_at) "+
    "values ($1,$2,clock_timestamp()+interval '24 hours') "+
    "on conflict (audit_event_id,person_id) do nothing returning person_id",
    [latestEvent,personA])
  const insertedB=await q("insert into da_store_owner_closing_email "+
    "(audit_event_id,person_id,next_attempt_at) "+
    "values ($1,$2,clock_timestamp()) "+
    "on conflict (audit_event_id,person_id) do nothing returning person_id",
    [latestEvent,personB])
  assert.ok(insertedA.length<=1&&insertedB.length<=1)
  const [aBefore,bBefore]=await Promise.all([
    q("select * from da_store_owner_closing_email "+
      "where audit_event_id=$1 and person_id=$2",[latestEvent,personA]),
    q("select * from da_store_owner_closing_email "+
      "where audit_event_id=$1 and person_id=$2",[latestEvent,personB])
  ])
  assert.equal(aBefore.length,1)
  assert.equal(bBefore.length,1)
  assert.equal(bBefore[0].attempts,0)
  assert.equal(bBefore[0].last_result,"pending")
  const [actor]=await q("select b.auth_identity_id,b.actor_id,u.email "+
    "from da_login_binding b join public.user u on u.id=b.actor_id "+
    "where b.person_id=$1 and b.actor_type='user' and b.revoked_at is null "+
    "and b.verified_at is not null and u.deleted_at is null",[personB])
  assert.ok(actor)
  assert.equal(actor.email,emailB)
  const nativeAuth=container.resolve("auth")
  const proofs=await nativeAuth.listAuthVerifications({
    auth_identity_id:actor.auth_identity_id,entity_type:"email"
  },{take:null})
  assert.equal(proofs.some((x:any)=>x.verified_at&&!x.deleted_at),false)
  const sockets=new Set<import("node:net").Socket>()
  const seen={recipients:[] as string[],ids:[] as string[],data:0,denied:0}
  const server=createServer(socket=>{
    sockets.add(socket)
    socket.on("close",()=>sockets.delete(socket))
    socket.on("error",()=>{})
    socket.setEncoding("utf8")
    socket.write("220 smtp.b22.local ESMTP\r\n")
    let data=false,pending=""
    socket.on("data",(chunk:string)=>{
      pending+=chunk
      let end=-1
      while((end=pending.indexOf("\r\n"))!==-1){
        const line=pending.slice(0,end)
        pending=pending.slice(end+2)
        if(data){
          if(line==="."){data=false;seen.data++
            socket.write("250 accepted by isolated loopback\r\n")
          }else if(line.startsWith("Message-ID: ")){
            seen.ids.push(line.slice("Message-ID: ".length))
          }
        }else if(line.startsWith("EHLO ")){
          socket.write("250 smtp.b22.local\r\n")
        }else if(line.startsWith("MAIL FROM:")){
          socket.write("250 sender accepted\r\n")
        }else if(line.startsWith("RCPT TO:")){
          if(line!=="RCPT TO:<"+emailB+">"){
            seen.denied++
            socket.write("550 other recipient denied\r\n")
          }else{
            seen.recipients.push(emailB)
            socket.write("250 recipient accepted\r\n")
          }
        }else if(line==="DATA"){data=true
          socket.write("354 send message data\r\n")
        }else if(line==="QUIT"){socket.write("221 goodbye\r\n");socket.end()}
        else socket.destroy()
      }
    })
  })
  let proofId:string|null=null
  const oldEnv=process.env.NODE_ENV
  let aDeferred=false
  try{
    await new Promise<void>((resolve,reject)=>{
      server.once("error",reject)
      server.listen(0,"127.0.0.1",resolve)
    })
    const address=server.address()
    assert.ok(address&&typeof address!=="string")
    const scoped={resolve:(name:string)=>{
      if(name==="dogruadresAccess")return {
        getActiveSmtpConfig:async()=>({
          enabled:true,host:"127.0.0.1",port:address.port,
          security:"none",from_email:"security@example.invalid"
        })
      }
      return container.resolve(name)
    }}
    // Preserve the first Owner's exact row: this step tests B's native
    // SellerMember + User person without altering A's notification history.
    const def=await q("update da_store_owner_closing_email "+
      "set next_attempt_at=clock_timestamp()+interval '24 hours' "+
      "where audit_event_id=$1 and person_id=$2 returning person_id",
      [latestEvent,personA])
    assert.equal(def.length,1)
    aDeferred=true
    process.env.NODE_ENV="test"
    await runOwnerClosingEmailTick(scoped as any)
    let b=await q("select attempts,last_result,message_id,accepted_at "+
      "from da_store_owner_closing_email where audit_event_id=$1 and person_id=$2",
      [latestEvent,personB])
    assert.equal(b[0].attempts,1)
    assert.equal(b[0].last_result,"unverified_identity")
    assert.equal(b[0].message_id,null)
    assert.equal(b[0].accepted_at,null)
    assert.equal(seen.data,0)
    const challenge=await nativeAuth.requestAuthVerification({
      auth_identity_id:actor.auth_identity_id,entity_type:"email",
      entity_id:emailB,code_provider:"token"
    })
    proofId=challenge.id
    const result=await reviewer.callFunction(
      "async function(code){const r=await fetch('/auth/verify-email',{" +
      "method:'POST',headers:{'content-type':'application/json'},"+
      "body:JSON.stringify({token:code}),cache:'no-store'});"+
      "return {http:r.status,body:await r.json()}}",challenge.code)
    assert.equal(result.http,200)
    assert.equal(result.body.status,"confirmed")
    const fresh=await nativeAuth.listAuthVerifications({
      auth_identity_id:actor.auth_identity_id,entity_type:"email"
    },{take:null})
    assert.equal(fresh.some((x:any)=>x.id===proofId&&x.verified_at&&!x.deleted_at),true)
    const due=await q("update da_store_owner_closing_email "+
      "set next_attempt_at=clock_timestamp()-interval '1 second' "+
      "where audit_event_id=$1 and person_id=$2 and attempts=1 "+
      "and last_result='unverified_identity' returning person_id",
      [latestEvent,personB])
    assert.equal(due.length,1)
    await runOwnerClosingEmailTick(scoped as any)
    b=await q("select attempts,last_result,message_id,accepted_at "+
      "from da_store_owner_closing_email where audit_event_id=$1 and person_id=$2",
      [latestEvent,personB])
    assert.equal(b[0].attempts,2)
    assert.equal(b[0].last_result,"accepted")
    assert.ok(b[0].accepted_at)
    assert.deepEqual(seen.recipients,[emailB])
    assert.equal(seen.denied,0,"No unrelated Owner may be addressed")
    assert.equal(seen.data,1)
    assert.equal(seen.ids.length,1)
    assert.equal(b[0].message_id,seen.ids[0])
    const visible=await privateClosing()
    assert.equal(visible.status,200)
    assert.deepEqual(visible.body.email_notice,{
      status:"accepted",attempts:2,smtp_accepted:true,
      mailbox_delivery_verified:false
    })
    assert.equal(JSON.stringify(visible.body).includes("message_id"),false)
    // P2 end-to-end acceptance: JSON is not enough. After SMTP 250,
    // reload B's REAL authenticated Chrome page, restore the same
    // Organization/Store selection and inspect the actual visible text.
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.select(orgName,"owner")
    await reviewer.wait("!document.getElementById('store-owner-closing-panel').hidden && "+
      "Array.from(document.querySelectorAll("+
      "'#store-owner-pause-form select[name=seller_id] option')).some("+
      "o=>o.value==="+JSON.stringify(ownerStoreId)+")")
    await reviewer.eval("(()=>{const s=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');s.value="+
      JSON.stringify(ownerStoreId)+";s.dispatchEvent(new Event('change',"+
      "{bubbles:true}));return true})()")
    await reviewer.click("#store-owner-closing-refresh")
    await reviewer.wait("!document.getElementById('store-owner-closing-status')."+
      "closest('[hidden]') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('SMTP sunucusu e-postayı kabul etti; posta kutusuna teslim doğrulanmadı.') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Deneme sayısı: 2.') && "+
      "document.getElementById('store-owner-closing-status')."+
      "textContent.includes('Korunan Owner bildirim kayıtları: 2/2')")
    const rendered=await reviewer.eval(
      "document.getElementById('store-owner-closing-status').textContent")
    assert.ok(rendered.includes("E-posta teslimi veya okunma bu sayılardan doğrulanmaz."))
    assert.equal(rendered.includes("Kişisel bildirim kaydedildi; e-posta denemesi sırada."),false,
      "Old queued label must disappear after SMTP acceptance")
    assert.equal(rendered.includes(emailB),false)
    assert.equal(rendered.includes("Message-ID"),false)
    assert.equal(rendered.includes("message_id"),false)
    assert.equal(await reviewer.eval(
      "document.getElementById('store-owner-closing-status').getAttribute('role')"),
      "status","Live status must remain accessible")
    await runOwnerClosingEmailTick(scoped as any)
    assert.equal(seen.data,1,"Immediate worker replay must not resend")
    process.stdout.write(
      "PASS B22 Chrome/HTTPS/PG16: real SellerMember link then native "+
      "Owner verification -> own withdrawal SMTP 250, "+
      "unrelated Owner no mail, 2-attempt persistence, replay-safe, "+
      "no mailbox delivery claim\n")
  }finally{
    process.env.NODE_ENV=oldEnv
    if(proofId){
      const removed=await q("update auth_verification "+
        "set deleted_at=clock_timestamp() where id=$1 "+
        "and auth_identity_id=$2 and deleted_at is null returning id",
        [proofId,actor.auth_identity_id])
      assert.equal(removed.length,1)
    }
    if(aDeferred){
      if(insertedA.length){
        const deleted=await q("delete from da_store_owner_closing_email "+
          "where audit_event_id=$1 and person_id=$2 and attempts=0 "+
          "returning person_id",[latestEvent,personA])
        assert.equal(deleted.length,1,
          "Synthetic first-Owner attempt row must be cleaned without sending")
      }else{
        await q("update da_store_owner_closing_email set next_attempt_at=$3 "+
          "where audit_event_id=$1 and person_id=$2",
          [latestEvent,personA,new Date(aBefore[0].next_attempt_at).toISOString()])
      }
    }
    for(const sock of sockets)sock.destroy()
    if(server.listening)
      await new Promise<void>((resolve,reject)=>
        server.close(e=>e?reject(e):resolve()))
  }
}


/**
 * Approved #252 late protected-Owner notice: the Owner was an ordinary
 * Member when the real closing START event committed. Promotion is task-only
 * PG16 fixture state, NOT a product promotion API or production data update.
 * The existing worker must now attach B to the authenticated source, without
 * changing A's original schedule or claiming external mailbox delivery.
 */
export async function verifyB22LateProtectedOwnerClosingNotice(input:{
  browser:B06Chrome;reviewer:B06Chrome;container:any;
  q:(sql:string,params?:any[])=>Promise<any[]>;
  personA:string;personB:string;memberMembershipId:string;
  organizationId:string;sellerId:string
}):Promise<void>{
  const {browser,reviewer,container,q,personA,personB,
    memberMembershipId,organizationId,sellerId}=input
  assert.equal(process.env.CI,"true")
  assert.equal(process.env.PG_MFA_TEST_SENTINEL,"mfa-pg16-disposable-ci-v1")
  assert.notEqual(personA,personB)
  const path="/organization/store-owner-closing?"+
    new URLSearchParams({organization_id:organizationId,seller_id:sellerId})
  const get=(b:B06Chrome)=>b.callFunction(
    "async function(path){const r=await fetch(path,{cache:'no-store'});"+
    "return {status:r.status,body:await r.json()}}",path)
  const write=async(action:"start"|"withdraw",version:number)=>
    browser.callFunction(
      "async function(args){const x=JSON.parse(args);"+
      "const s=await(await fetch('/personal/session')).json();"+
      "const r=await fetch('/organization/store-owner-closing',"+
      "{method:'POST',headers:{'content-type':'application/json',"+
      "'x-csrf-token':s.csrf_token},body:JSON.stringify(x)});"+
      "return {status:r.status,body:await r.json()}}",
      JSON.stringify({organization_id:organizationId,seller_id:sellerId,
        action,request_id:"dasc_"+randomBytes(16).toString("hex"),
        expected_version:version,
        ...(action==="start"?{consequences_acknowledged:true}:{})}))
  const member=await q("select role,protected_owner,status,revoked_at "+
    "from da_organization_membership where id=$1 and person_id=$2",[
      memberMembershipId,personB])
  assert.equal(member.length,1)
  assert.equal(member[0].role,"member")
  assert.equal(member[0].protected_owner,false)
  assert.equal(member[0].status,"active")
  const original=await get(browser)
  assert.equal(original.status,200)
  assert.equal(original.body.state,"withdrawn")
  assert.equal((await get(reviewer)).status,403,
    "Ordinary Member cannot inspect a protected Owner notice")
  const start=await write("start",original.body.version)
  assert.equal(start.status,200)
  assert.equal(start.body.status,"closing")
  assert.equal(start.body.version,original.body.version+1)
  const source=await q("select source_audit_event_id from da_store_owner_closing "+
    "where seller_id=$1 and state='closing' and version=$2",[
      sellerId,start.body.version])
  assert.equal(source.length,1)
  const eventId=source[0].source_audit_event_id
  const beforeRecipients=await q("select person_id from da_notification_receipt "+
    "where audit_event_id=$1 order by person_id",[eventId])
  assert.deepEqual(beforeRecipients.map((r:any)=>r.person_id),[personA],
    "The later Owner must not already have a historical creation-time receipt")
  const beforeAudit=await q("select e.id,e.occurred_at,x.id as outbox_id "+
    "from da_audit_event e join da_audit_outbox x "+
    "on x.source_audit_event_id=e.id where e.id=$1",[eventId])
  assert.equal(beforeAudit.length,1)
  // The B07 protected Owner promotion route and real Owner membership UI
  // already exist. A task-only SQL role UPDATE would skip the exact B22
  // business transition this late-recipient test must now cover.
  const beforePromotion=await q("select e.id,e.actor_person_id,"+
    "(select count(*)::int from da_audit_outbox x "+
    "where x.source_audit_event_id=e.id) as outboxes "+
    "from da_audit_event e where e.action='organization.membership_changed' "+
    "and e.organization_id=$1 and e.target_id=$2 order by e.id",
    [organizationId,memberMembershipId])
  const [org]=await q("select name from da_organization "+
    "where id=$1 and status='active' and deleted_at is null",[organizationId])
  assert.ok(typeof org?.name==="string"&&org.name.length>0)
  let withdrawn=false
  try{
    await browser.send("Page.bringToFront")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(org.name,"owner")
    await browser.ready()
    const postBefore=browser.http.filter((item:any)=>
      item.method==="POST"&&item.path==="/organization/memberships"&&
      item.status===200).length
    await browser.button("Korumalı Owner yap "+memberMembershipId)
    await until(async()=>{
      const rows=await q("select role,protected_owner,status from "+
        "da_organization_membership where id=$1 and person_id=$2",
        [memberMembershipId,personB])
      return rows.length===1&&rows[0].role==="owner"&&
        rows[0].protected_owner===true&&rows[0].status==="active"
    },20000,"real Owner HTTPS promotion before late closing notice")
    await until(async()=>browser.http.filter((item:any)=>
      item.method==="POST"&&item.path==="/organization/memberships"&&
      item.status===200).length>=postBefore+1,
    20000,"real protected Owner promotion POST 200")
    const promotion=await q("select e.id,e.actor_person_id,"+
      "(select count(*)::int from da_audit_outbox x "+
      "where x.source_audit_event_id=e.id) as outboxes "+
      "from da_audit_event e where e.action='organization.membership_changed' "+
      "and e.organization_id=$1 and e.target_id=$2 order by e.id",
      [organizationId,memberMembershipId])
    assert.equal(promotion.length,beforePromotion.length+1,
      "Real Owner promotion must commit one NEW canonical audit")
    for(const historical of beforePromotion)
      assert.deepEqual(promotion.find((x:any)=>x.id===historical.id),historical,
        "Existing membership audit/outbox must remain unchanged")
    const added=promotion.filter((x:any)=>
      !beforePromotion.some((prev:any)=>prev.id===x.id))
    assert.equal(added.length,1)
    assert.equal(added[0].actor_person_id,personA)
    assert.equal(added[0].outboxes,1)
    // B's real active browser must refresh its changed Organization role.
    await reviewer.send("Page.bringToFront")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    const missing=await get(reviewer)
    assert.equal(missing.status,200,
      "Already-linked native SellerMember with new protected Owner grant can read")
    assert.deepEqual(missing.body.notification_coverage,{
      protected_owners:2,personal_receipts:1,mailbox_delivery_verified:false})
    assert.equal(missing.body.email_notice.status,"not_applicable")
    // No outside SMTP: the already installed worker is invoked with an
    // explicitly unavailable transport. This proves recipient enrollment,
    // claim failure and canonical retry time, NOT SMTP 250 or delivery.
    const scoped={resolve:(key:string)=>key==="dogruadresAccess"?
      {getActiveSmtpConfig:async()=>null}:container.resolve(key)}
    await runOwnerClosingEmailTick(scoped as any)
    const receipts=await q("select person_id from da_notification_receipt "+
      "where audit_event_id=$1 order by person_id",[eventId])
    assert.deepEqual(receipts.map((r:any)=>r.person_id).sort(),
      [personA,personB].sort())
    const rows=await q("select person_id,attempts,last_result,next_attempt_at,"+
      "late_schedule_at,message_id,accepted_at from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])
    assert.equal(rows.length,2)
    const byPerson=new Map(rows.map((r:any)=>[r.person_id,r]))
    const a=byPerson.get(personA) as any
    const b=byPerson.get(personB) as any
    assert.ok(a&&b)
    assert.equal(a.late_schedule_at,null)
    assert.equal(new Date(a.next_attempt_at).getTime()-
      new Date(beforeAudit[0].occurred_at).getTime(),86400000,
      "Original Owner keeps exact original +24h slot")
    assert.ok(b.late_schedule_at,"Only the later Owner gets a new schedule")
    assert.equal(new Date(b.next_attempt_at).getTime()-
      new Date(b.late_schedule_at).getTime(),86400000,
      "Later Owner's next retry is +24h after enrollment, not the old event")
    for(const x of [a,b]){
      assert.equal(x.attempts,1)
      assert.equal(x.last_result,"failed")
      assert.equal(x.message_id,null)
      assert.equal(x.accepted_at,null)
    }
    const current=await get(reviewer)
    assert.equal(current.status,200)
    assert.deepEqual(current.body.notification_coverage,{
      protected_owners:2,personal_receipts:2,mailbox_delivery_verified:false})
    assert.equal(current.body.email_notice.status,"failed")
    assert.equal(current.body.permanent_finalization_enabled,false)
    assert.equal(JSON.stringify(current.body).includes("person_id"),false)
    assert.equal(JSON.stringify(current.body).includes("message_id"),false)
    const beforeReplay=await q("select person_id,attempts,last_result,"+
      "next_attempt_at,late_schedule_at from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])
    await runOwnerClosingEmailTick(scoped as any)
    assert.deepEqual(await q("select person_id,attempts,last_result,"+
      "next_attempt_at,late_schedule_at from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId]),beforeReplay,
      "Immediate scheduler replay must not duplicate notices or claims")
    assert.deepEqual(await q("select e.id,e.occurred_at,x.id as outbox_id "+
      "from da_audit_event e join da_audit_outbox x "+
      "on x.source_audit_event_id=e.id where e.id=$1",[eventId]),beforeAudit,
      "New recipient never rewrites source audit/outbox")
    // The same authenticated private HTTP route must also fail closed if
    // the Organization's audited Store association is revoked AFTER closing.
    // This is disposable PG16 only; always restore before real Owner withdraw.
    const origin=await q("select id from da_organization_seller_ownership "+
      "where organization_id=$1 and seller_id=$2 and revoked_at is null",
      [organizationId,sellerId])
    assert.equal(origin.length,1)
    const revokedOrigin=await q("update da_organization_seller_ownership "+
      "set revoked_at=clock_timestamp() where id=$1 and revoked_at is null "+
      "returning id",[origin[0].id])
    assert.equal(revokedOrigin.length,1)
    try{
      assert.equal((await get(browser)).status,403,
        "Original Owner cannot read Store notice after legal Origin revocation")
      assert.equal((await get(reviewer)).status,403,
        "Late Owner cannot read Store notice after legal Origin revocation")
    }finally{
      const restoredOrigin=await q("update da_organization_seller_ownership "+
        "set revoked_at=null where id=$1 and revoked_at is not null "+
        "returning id",[origin[0].id])
      assert.equal(restoredOrigin.length,1)
    }
    assert.equal((await get(browser)).status,200,
      "Restored current audited Store Origin reauthorizes the Owner read")

    const stop=await write("withdraw",start.body.version)
    assert.equal(stop.status,200)
    assert.equal(stop.body.status,"withdrawn")
    withdrawn=true
    const ended=await get(browser)
    assert.equal(ended.status,200)
    assert.equal(ended.body.permanent_finalization_enabled,false)
  }finally{
    if(!withdrawn){
      // Never silently discard an active closure if the test failed.
      // Its disposable DB remains isolated and CI must report FAIL.
    }
    // B22 fixture teardown only: never use the forbidden Owner->Admin
    // product path. Restore the old Member in the disposable task DB, even
    // when a post-commit UI/assertion failed; audit history stays append-only.
    const roleNow=await q("select role,protected_owner,status,revoked_at "+
      "from da_organization_membership where id=$1 and person_id=$2",
      [memberMembershipId,personB])
    assert.equal(roleNow.length,1)
    if(roleNow[0].role==="owner"&&roleNow[0].protected_owner===true){
      const restored=await q("update da_organization_membership "+
        "set role=$2,protected_owner=$3,revoked_at=$4,"+
        "updated_at=clock_timestamp() where id=$1 returning id",[
          memberMembershipId,member[0].role,member[0].protected_owner,
          member[0].revoked_at])
      assert.deepEqual(restored,[{id:memberMembershipId}])
    }else assert.deepEqual(roleNow,[{
      role:member[0].role,protected_owner:member[0].protected_owner,
      status:member[0].status,revoked_at:member[0].revoked_at
    }],"Failed role-change request cannot mutate the Member")
    assert.equal((await get(reviewer)).status,403,
      "Lost protected Owner grant revokes access to their former private notice")
  }
  process.stdout.write(
    "PASS B22 Chrome/HTTPS/PG16: new protected Owner after actual closing "+
    "gets source-bound private receipt and independent +24h mail retry; "+
    "first Owner original clock unchanged, replay safe, revoked access 403, "+
    "source audit/outbox intact, no SMTP/delivery/finalizer\n")
}
