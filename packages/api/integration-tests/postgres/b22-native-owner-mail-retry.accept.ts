/**
 * B22 #252: one real Medusa AuthIdentity -> HTTPS Chrome verification -> native
 * Owner security-mail worker -> isolated loopback SMTP 250 journey.
 * Invoked only inside the existing disposable b22-ui GitHub PG16 test. The
 * first Owner already holds an explicitly SYNTHETIC accepted UI fixture; this
 * probe must not resend or overwrite it. No production config/SMTP changes.
 */
import assert from "node:assert/strict"
import {createServer} from "node:net"
import {runOwnerClosingEmailTick} from "../../src/jobs/dogruadres-platform-closing-email"
import type {B06Chrome} from "./b06-ui-browser"

type Query=(sql:string,params?:unknown[])=>Promise<any[]>
const proofMarker="PASS B22 Chrome/HTTPS/PG16: second protected Owner native Medusa verification then own +24h retry, one loopback SMTP 250, first Owner record unchanged, two receipts, replay safe, mailbox delivery unverified"

export async function verifyB22NativeOwnerMailRetry(input:{
  browser:B06Chrome;coOwner:B06Chrome;container:any;q:Query;
  firstPersonId:string;secondPersonId:string;
  eventId:string;firstEmail:string;secondEmail:string;
}):Promise<void>{
  const {coOwner,container,q,firstPersonId,secondPersonId,eventId,
    firstEmail,secondEmail}=input
  assert.notEqual(firstPersonId,secondPersonId)
  assert.match(firstEmail,/^b22-a-[0-9a-f]{16}@example\.invalid$/)
  assert.match(secondEmail,/^b22-b-[0-9a-f]{16}@example\.invalid$/)
  assert.equal(process.env.GITHUB_ACTIONS,"true")
  assert.equal(process.env.CI,"true")
  assert.equal(process.env.PG_MFA_TEST_SCOPE,"b22-ui")
  assert.equal(process.env.PG_MFA_TEST_SENTINEL,"mfa-pg16-disposable-ci-v1")
  assert.notEqual(process.env.B22_ADMIN_SMTP,"true",
    "B22 admin SMTP is a distinct test stage")
  const host=new URL(process.env.DOGRUADRES_PUBLIC_ORIGIN??"http://invalid")
  assert.equal(host.protocol,"https:")
  assert.equal(host.hostname,"127.0.0.1")

  const [firstRow]=await q("select person_id,attempts,last_result,message_id,accepted_at,"+
    "next_attempt_at from da_store_owner_closing_email "+
    "where audit_event_id=$1 and person_id=$2",[eventId,firstPersonId])
  assert.ok(firstRow&&firstRow.attempts===1&&firstRow.last_result==="accepted")
  assert.ok(firstRow.accepted_at)
  // The existing UI fixture has an accepted status but no real SMTP result.
  // Retain that explicit limitation rather than claiming a first delivery.
  const firstSnapshot={...firstRow}
  const [nativeOwner]=await q("select b.auth_identity_id,b.actor_id,u.email "+
    "from da_login_binding b join public.user u on u.id=b.actor_id "+
    "where b.person_id=$1 and b.actor_type='user' and b.revoked_at is null "+
    "and b.verified_at is not null and u.deleted_at is null",[secondPersonId])
  assert.ok(nativeOwner)
  assert.equal(nativeOwner.email,secondEmail)
  const firstAuth=await q("select b.auth_identity_id from da_login_binding b "+
    "where b.person_id=$1 and b.actor_type='user' and b.revoked_at is null "+
    "and b.verified_at is not null",[firstPersonId])
  assert.equal(firstAuth.length,1)
  assert.notEqual(nativeOwner.auth_identity_id,firstAuth[0].auth_identity_id)
  const nativeAuth=container.resolve("auth")
  const existing=await nativeAuth.listAuthVerifications({
    auth_identity_id:nativeOwner.auth_identity_id,entity_type:"email"
  },{take:null})
  assert.equal(existing.some((x:any)=>x.verified_at&&!x.deleted_at),false,
    "Second protected Owner must start without a native verified email")

  const observed={recipients:[] as string[],messageIds:[] as string[],
    dataMessages:0,invalidRecipients:0,safeLink:false}
  const sockets=new Set<import("node:net").Socket>()
  const loopback=createServer(socket=>{
    sockets.add(socket)
    socket.on("close",()=>sockets.delete(socket))
    socket.on("error",()=>{})
    socket.setEncoding("utf8")
    socket.write("220 smtp.b22.local ESMTP\r\n")
    let pending="",data=false
    socket.on("data",(chunk:string)=>{
      pending+=chunk
      let end=-1
      while((end=pending.indexOf("\r\n"))!==-1){
        const line=pending.slice(0,end)
        pending=pending.slice(end+2)
        if(data){
          if(line==="."){
            data=false
            observed.dataMessages++
            socket.write("250 accepted by isolated loopback, not mailbox delivery\r\n")
          }else if(line.startsWith("Message-ID: ")){
            observed.messageIds.push(line.slice("Message-ID: ".length))
          }else if(line.includes("/personal")){
            observed.safeLink=observed.safeLink||line.includes("https://127.0.0.1:")
          }
        }else if(line.startsWith("EHLO ")){
          socket.write("250 smtp.b22.local\r\n")
        }else if(line.startsWith("MAIL FROM:")){
          socket.write("250 sender accepted\r\n")
        }else if(line.startsWith("RCPT TO:")){
          const address=line.slice("RCPT TO:<".length,-1)
          if(line!=="RCPT TO:<"+secondEmail+">"){
            observed.invalidRecipients++
            socket.write("550 denied non-target recipient\r\n")
          }else{
            observed.recipients.push(address)
            socket.write("250 recipient accepted\r\n")
          }
        }else if(line==="DATA"){
          data=true
          socket.write("354 send message data\r\n")
        }else if(line==="QUIT"){
          socket.write("221 goodbye\r\n")
          socket.end()
        }else socket.destroy()
      }
    })
  })
  const oldNodeEnv=process.env.NODE_ENV
  let challengeId:string|null=null
  try{
    await new Promise<void>((resolve,reject)=>{
      loopback.once("error",reject)
      loopback.listen(0,"127.0.0.1",resolve)
    })
    const addr=loopback.address()
    assert.ok(addr&&typeof addr!=="string")
    // Only the SMTP CONFIG is substituted, never native Auth/Query, Owner
    // authorization, DB transaction, worker algorithm or SMTP transport.
    // The native sendSmtpEmail client disallows non-loopback plaintext.
    const scopedContainer={resolve:(name:string)=>{
      if(name==="dogruadresAccess")return {
        getActiveSmtpConfig:async()=>({
          enabled:true,host:"127.0.0.1",port:addr.port,security:"none",
          from_email:"security@example.invalid"
        })
      }
      return container.resolve(name)
    }}
    process.env.NODE_ENV="test"
    await runOwnerClosingEmailTick(scopedContainer as any)
    const before=await q("select person_id,attempts,last_result,accepted_at,"+
      "message_id,next_attempt_at from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])
    assert.equal(before.length,2,
      "Canonical Owner closing event must retain separate recipient outcomes")
    const byPerson=new Map(before.map((r:any)=>[r.person_id,r]))
    const initialSecond=byPerson.get(secondPersonId) as any
    assert.ok(initialSecond)
    assert.equal(initialSecond.attempts,1)
    assert.equal(initialSecond.last_result,"unverified_identity")
    assert.equal(initialSecond.accepted_at,null)
    assert.equal(initialSecond.message_id,null)
    assert.equal(observed.dataMessages,0,
      "No verified second Owner: no SMTP DATA, first Owner cannot be resent")
    assert.equal(observed.invalidRecipients,0)
    assert.deepEqual(byPerson.get(firstPersonId),firstSnapshot)
    const [source]=await q("select occurred_at from da_audit_event where id=$1",[eventId])
    assert.ok(source)
    assert.equal(new Date(initialSecond.next_attempt_at).getTime()-
      new Date(source.occurred_at).getTime(),86400000,
      "Second Owner retry must follow the original immutable +24h schedule")

    const challenge=await nativeAuth.requestAuthVerification({
      auth_identity_id:nativeOwner.auth_identity_id,
      entity_type:"email",entity_id:secondEmail,code_provider:"token"
    })
    challengeId=challenge.id
    assert.ok(typeof challenge.code==="string"&&challenge.code.length>=16)
    // Actual SECOND Owner's own signed-in Chrome context, not a Staff browser.
    const result=await coOwner.callFunction(
      "async function(code){const call=async(method)=>{"+
      "const r=await fetch('/auth/verify-email'+(method==='GET'?"+
      "'?token='+encodeURIComponent(code):''),{method,"+
      "headers:method==='POST'?{'content-type':'application/json'}:{},"+
      "body:method==='POST'?JSON.stringify({token:code}):undefined,"+
      "cache:'no-store'});const b=await r.json();"+
      "return {http:r.status,ok:b.ok,status:b.status}};"+
      "return {pending:await call('GET'),confirmed:await call('POST'),"+
      "consumed:await call('GET'),replay:await call('POST')}}",
      challenge.code)
    assert.deepEqual(result.pending,{http:200,ok:true,status:"pending"})
    assert.deepEqual(result.confirmed,{http:200,ok:true,status:"confirmed"})
    assert.deepEqual(result.consumed,{http:200,ok:true,status:"consumed"})
    assert.equal(result.replay.ok,false)
    assert.ok([400,409].includes(result.replay.http))
    const confirmed=await nativeAuth.listAuthVerifications({
      auth_identity_id:nativeOwner.auth_identity_id,entity_type:"email"
    },{take:null})
    assert.equal(confirmed.some((x:any)=>
      x.id===challengeId&&x.verified_at&&!x.deleted_at),true,
      "Actual Medusa proof must persist BEFORE the next mail job")

    // Important 24h negative acceptance: even though B now has a REAL
    // native Medusa proof, verification itself must not pull the security
    // notification forward. The immutable audit clock controls eligibility.
    // No wall-clock fast-forward, no test-specific worker override.
    const clockRows=await q("select clock_timestamp() as now")
    assert.equal(clockRows.length,1)
    assert.ok(new Date(initialSecond.next_attempt_at).getTime()>
      new Date(clockRows[0].now).getTime(),
      "The +24h retry must still be in the future during the early probe")
    const beforeEarly=await q("select person_id,attempts,last_result,"+
      "message_id,accepted_at,last_attempt_at,next_attempt_at,claim_id,"+
      "lease_until from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])
    assert.equal(beforeEarly.length,2)
    assert.equal(observed.dataMessages,0)
    await runOwnerClosingEmailTick(scopedContainer as any)
    const afterEarly=await q("select person_id,attempts,last_result,"+
      "message_id,accepted_at,last_attempt_at,next_attempt_at,claim_id,"+
      "lease_until from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])
    assert.deepEqual(afterEarly,beforeEarly,
      "Verified B must NOT be retried before the canonical +24h boundary; "+
      "both Owners' durable attempts and leases must remain unchanged")
    assert.deepEqual(observed.recipients,[],
      "Early verified proof must not trigger even an SMTP RCPT")
    assert.equal(observed.dataMessages,0,
      "Early verified proof must not trigger SMTP DATA")
    assert.equal(observed.messageIds.length,0)
    assert.equal(observed.invalidRecipients,0)
    assert.equal((await q("select count(*)::int n from da_notification_receipt "+
      "where audit_event_id=$1",[eventId]))[0].n,2,
      "Premature tick must not mutate canonical Owner receipts")

    // No global clock alteration, just the SECOND task-owned recipient slot.
    const due=await q("update da_store_owner_closing_email "+
      "set next_attempt_at=clock_timestamp()-interval '1 second' "+
      "where audit_event_id=$1 and person_id=$2 and attempts=1 "+
      "and last_result='unverified_identity' returning person_id",
      [eventId,secondPersonId])
    assert.deepEqual(due,[{person_id:secondPersonId}])
    await runOwnerClosingEmailTick(scopedContainer as any)
    assert.deepEqual(observed.recipients,[secondEmail])
    assert.equal(observed.invalidRecipients,0)
    assert.equal(observed.dataMessages,1,
      "Exactly one real SMTP DATA must be accepted by loopback for Owner B")
    assert.equal(observed.messageIds.length,1)
    assert.match(observed.messageIds[0],/^<\d+\.[a-f0-9]{16}@127\.0\.0\.1>$/)
    assert.equal(observed.safeLink,true)
    const after=await q("select person_id,attempts,last_result,accepted_at,"+
      "message_id,next_attempt_at from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])
    assert.equal(after.length,2)
    const recovered=new Map(after.map((r:any)=>[r.person_id,r]))
    assert.deepEqual(recovered.get(firstPersonId),firstSnapshot,
      "First Owner's accepted UI fixture must never be resent or overwritten")
    const second=recovered.get(secondPersonId) as any
    assert.ok(second)
    assert.equal(second.attempts,2)
    assert.equal(second.last_result,"accepted")
    assert.ok(second.accepted_at)
    assert.equal(second.message_id,observed.messageIds[0])
    assert.equal(new Date(second.next_attempt_at).getTime()-
      new Date(source.occurred_at).getTime(),172800000,
      "Next retry anchored to original event at +48h")
    assert.equal((await q("select count(*)::int n from da_notification_receipt "+
      "where audit_event_id=$1",[eventId]))[0].n,2)
    await runOwnerClosingEmailTick(scopedContainer as any)
    assert.equal(observed.dataMessages,1,"Immediate job replay cannot send again")
    assert.deepEqual((await q("select person_id,attempts,last_result,"+
      "message_id from da_store_owner_closing_email "+
      "where audit_event_id=$1 order by person_id",[eventId])).map(
      (x:any)=>[x.person_id,x.attempts,x.last_result,x.message_id]),
      after.map((x:any)=>[x.person_id,x.attempts,x.last_result,x.message_id]))
    process.stdout.write(proofMarker+"\n")
  }finally{
    process.env.NODE_ENV=oldNodeEnv
    if(challengeId){
      const rows=await q("update auth_verification "+
        "set deleted_at=clock_timestamp() "+
        "where id=$1 and auth_identity_id=$2 and deleted_at is null returning id",
        [challengeId,nativeOwner.auth_identity_id])
      assert.deepEqual(rows,[{id:challengeId}],
        "Native proof restoration must only affect this Owner's task challenge")
    }
    for(const socket of sockets)socket.destroy()
    if(loopback.listening)
      await new Promise<void>((resolve,reject)=>
        loopback.close(error=>error?reject(error):resolve()))
  }
}
