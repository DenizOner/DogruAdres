/** B22 #252: Owner-B private notice after real native SellerMember UI link.
 * Reuse existing B22 native Member/Owner browser and disposable PG16.
 * Synthetic protected-Owner fixture is NOT a real Owner promotion API.
 * Exported from a narrow test-only helper to keep the established B22
 * full runner under TypeScript's control-flow source-size limit.
 */
import assert from "node:assert/strict"
import {createServer} from "node:net"
import {runOwnerClosingEmailTick} from "../../src/jobs/dogruadres-platform-closing-email"
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
      "const r=await fetch('/personal/store-owner-closing?'+new URLSearchParams("+
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
    // Last missing native integration edge after #354: this person became
    // a real Mercur SellerMember BEFORE their protected Owner SMTP retry.
    // Exercise the SAME worker on the latest canonical withdrawal event;
    // do not infer SMTP acceptance from the earlier private GET 200.
    await verifyLinkedNativeMemberOwnerMail({
      reviewer,container,q,personA,personB,
      latestEvent:latestEvent[0].source_audit_event_id,
      emailB,privateClosing:()=>privateClosing(reviewer,orgA)
    })
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
  privateClosing:()=>Promise<any>;
}){
  const {reviewer,container,q,personA,personB,latestEvent,emailB,privateClosing}=input
  assert.equal(process.env.CI,"true")
  assert.equal(process.env.GITHUB_ACTIONS,"true")
  assert.equal(process.env.PG_MFA_TEST_SCOPE,"b22-ui")
  assert.equal(process.env.PG_MFA_TEST_SENTINEL,"mfa-pg16-disposable-ci-v1")
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
      await q("update da_store_owner_closing_email set next_attempt_at=$3 "+
        "where audit_event_id=$1 and person_id=$2",
        [latestEvent,personA,new Date(aBefore[0].next_attempt_at).toISOString()])
    }
    for(const sock of sockets)sock.destroy()
    if(server.listening)
      await new Promise<void>((resolve,reject)=>
        server.close(e=>e?reject(e):resolve()))
  }
}
