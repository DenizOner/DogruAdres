/**
 * Issue #230 — supported Medusa 2.21.2 Auth Module API, REAL native MFA
 * on a random CI-only database created by foundation-medusa-cli.pg16.test.ts.
 * Creates only synthetic Person/session rows in the random test DB; no protected DB.
 * Secrets, TOTP seeds and recovery codes must never be logged or persisted.
 */
import type { ExecArgs, IAuthModuleService } from "@medusajs/framework/types"
import { randomBytes, createHmac } from "node:crypto"
import assert from "node:assert/strict"
import { Client } from "@medusajs/framework/pg"
import type AccessService from "../../src/modules/dogruadres-access/service"

function verifyDisposableEnvironment(){
  const target=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  if(process.env.CI!=="true" ||
    process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1" ||
    target.protocol!=="postgres:" || target.hostname!=="127.0.0.1" ||
    target.port!=="5432" || target.username!=="mfa_test" ||
    target.password!=="ci-disposable-only-not-a-real-secret" ||
    !/^\/mfa_cli_ci_[a-f0-9]{16}$/.test(target.pathname) ||
    process.env.PG_MFA_NATIVE_TEST_DATABASE!==target.pathname.slice(1) ||
    process.env.DOGRUADRES_IDENTITY_ENABLED!=="true")
    throw Error("REFUSED: native Medusa MFA smoke requires its exact task-owned disposable DB")
}
function totp(secret:string){
  // RFC 6238 test-only code generator. Production OTP check stays in Medusa.
  const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits=""
  for(const char of secret.toUpperCase().replace(/=+$/,"")){
    const index=abc.indexOf(char)
    if(index<0)throw Error("Unsupported native TOTP encoding")
    bits+=index.toString(2).padStart(5,"0")
  }
  const key=Buffer.from((bits.match(/.{8}/g)??[]).map(part=>parseInt(part,2)))
  const counter=Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const digest=createHmac("sha1",key).update(counter).digest()
  const off=digest[digest.length-1]&15
  return ((digest.readUInt32BE(off)&0x7fffffff)%1000000).toString().padStart(6,"0")
}
export default async function({container}:ExecArgs){
  verifyDisposableEnvironment()
  const auth:IAuthModuleService=container.resolve("auth")
  const email="native-mfa-"+randomBytes(8).toString("hex")+"@example.invalid"
  const password=randomBytes(32).toString("base64url")
  const registered=await auth.register("emailpass",{body:{email,password}})
  assert.ok(registered.success&&registered.authIdentity?.id,"Native emailpass identity registration failed")
  const id=registered.authIdentity!.id
  const loggedIn=await auth.authenticate("emailpass",{body:{email,password}})
  assert.ok(loggedIn.success&&loggedIn.authIdentity?.id===id,"Native emailpass password proof failed")

  const setup=await auth.startAuthMfa({auth_identity_id:id,provider:"totp",issuer:"DogruAdres isolated CI"})
  assert.equal(setup.mfa.auth_identity_id,id)
  assert.equal(setup.mfa.status,"pending")
  assert.ok(setup.secret,"Native TOTP provider returned no secret")
  const verified=await auth.verifyAuthMfa({id:setup.mfa.id,auth_identity_id:id,code:totp(setup.secret!)})
  assert.equal(verified.id,setup.mfa.id)
  assert.equal(verified.auth_identity_id,id)
  assert.equal(verified.status,"enabled")
  process.stdout.write("PASS Medusa native MFA: synthetic password proof, TOTP start and verify\n")

  const issued=await auth.generateAuthMfaRecoveryCodes({auth_identity_id:id,count:2})
  assert.equal(issued.codes.length,2)
  assert.ok(issued.codes.every(code=>typeof code==="string"&&code.length>=8))
  await auth.useAuthMfaRecoveryCode({auth_identity_id:id,code:issued.codes[0]})
  await assert.rejects(
    auth.useAuthMfaRecoveryCode({auth_identity_id:id,code:issued.codes[0]}),
    /invalid|used|not allowed/i,
  )
  process.stdout.write("PASS Medusa native MFA: recovery code consumed exactly once\n")

  await assert.rejects(
    auth.disableAuthMfa({id:setup.mfa.id}),
    /verification code|required|challenge/i,
  )
  const stillEnabled=await auth.retrieveAuthMfa({id:setup.mfa.id,auth_identity_id:id})
  assert.equal(stillEnabled.status,"enabled")
  process.stdout.write("PASS Medusa native MFA: enabled factor cannot be disabled without fresh challenge\n")
  // Medusa's native Cache module must persist a challenge; do not replace
  // it with DoğruAdres-local OTP state or accept a synthetic success.
  const challenge=await auth.createAuthMfaChallenge({auth_identity_id:id})
  assert.equal(challenge.auth_identity_id,id)
  assert.ok(challenge.methods.includes("totp"),"Native TOTP method unavailable")
  assert.ok(challenge.methods.includes("recovery_code"),"Native recovery challenge method unavailable")
  assert.equal(challenge.completed_at,null)
  assert.equal(challenge.attempts,0)
  assert.equal(challenge.max_attempts,5)
  await assert.rejects(auth.verifyAuthMfaChallenge({
    id:challenge.id,auth_identity_id:"other_auth_identity",method:"totp",
    code:totp(setup.secret!),
  }))
  const completed=await auth.verifyAuthMfaChallenge({
    id:challenge.id,auth_identity_id:id,method:"totp",
    code:totp(setup.secret!),
  })
  assert.equal(completed.auth_identity_id,id)
  assert.ok(completed.completed_at,"Verified TOTP challenge missing completion time")
  await assert.rejects(auth.verifyAuthMfaChallenge({
    id:challenge.id,auth_identity_id:id,method:"totp",
    code:totp(setup.secret!),
  }))
  process.stdout.write("PASS Medusa native MFA challenge: TOTP, owner separation and completed-challenge replay rejection\n")

  const recoveryChallenge=await auth.createAuthMfaChallenge({auth_identity_id:id})
  const recoveryDone=await auth.verifyAuthMfaChallenge({
    id:recoveryChallenge.id,auth_identity_id:id,
    method:"recovery_code",code:issued.codes[1],
  })
  assert.ok(recoveryDone.completed_at)
  const recoveryReplay=await auth.createAuthMfaChallenge({auth_identity_id:id})
  await assert.rejects(auth.verifyAuthMfaChallenge({
    id:recoveryReplay.id,auth_identity_id:id,
    method:"recovery_code",code:issued.codes[1],
  }))
  process.stdout.write("PASS Medusa native MFA challenge: recovery code consumed and denied on a fresh challenge\n")

  const throttled=await auth.createAuthMfaChallenge({auth_identity_id:id})
  const current=totp(setup.secret!)
  const invalid=((Number(current)+500000)%1000000).toString().padStart(6,"0")
  for(let attempt=0;attempt<throttled.max_attempts;attempt++){
    await assert.rejects(auth.verifyAuthMfaChallenge({
      id:throttled.id,auth_identity_id:id,method:"totp",code:invalid,
    }))
  }
  await assert.rejects(auth.verifyAuthMfaChallenge({
    id:throttled.id,auth_identity_id:id,method:"totp",
    code:totp(setup.secret!),
  }))
  process.stdout.write("PASS Medusa native MFA challenge: five failed attempts lock the challenge\n")

  // A separate, synthetic AuthIdentity with an actual Medusa user and real
  // Foundation service. This test never uses any protected Person or actor.
  const foundation:AccessService=container.resolve("dogruadresAccess")
  const users:any=container.resolve("user")
  const email2="mfa-bound-"+randomBytes(8).toString("hex")+"@example.invalid"
  const pass2=randomBytes(32).toString("base64url")
  const r2=await auth.register("emailpass",{body:{email:email2,password:pass2}})
  assert.ok(r2.success&&r2.authIdentity?.id)
  const identity2=r2.authIdentity!.id
  const nativeUser=await users.createUsers({email:email2,first_name:"Isolated"})
  await auth.updateAuthIdentities({id:identity2,app_metadata:{user_id:nativeUser.id}})
  const proof=await auth.authenticate("emailpass",{body:{email:email2,password:pass2}})
  assert.ok(proof.success&&proof.authIdentity?.id===identity2)
  const [person]=await foundation.createPeople([{}])
  await foundation.createActorMappings({
    person_id:person.id,actor_type:"user",actor_id:nativeUser.id,
    created_by_actor_type:"user",created_by_actor_id:nativeUser.id,
  })
  const db=new Client({connectionString:process.env.DATABASE_URL})
  await db.connect()
  try{
    await db.query("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
      [identity2,person.id,nativeUser.id])
    // This irreversible latch is written ONLY inside the exact random CI DB.
    const armed=await db.query("update da_session_policy set mfa_activated=true where id='current' and mfa_activated=false returning id")
    assert.equal(armed.rowCount,1)
    const decision=await foundation.personalLoginMfaDecision(identity2,"not_enrolled")
    assert.equal(decision.purpose,"mfa_enroll")
    const oldA=await foundation.openPersonalSession(identity2,decision.purpose,decision.expectedRevision)
    const oldB=await foundation.openPersonalSession(identity2,decision.purpose,decision.expectedRevision)
    assert.ok(await foundation.personalEnrollmentSession(oldA.token))
    assert.ok(await foundation.personalEnrollmentSession(oldB.token))
    assert.equal(await foundation.personalSession(oldA.token),null)

    const pending=await auth.startAuthMfa({auth_identity_id:identity2,provider:"totp",issuer:"DogruAdres isolated CI"})
    assert.equal(pending.mfa.status,"pending")
    assert.ok(pending.secret)
    const started=await foundation.personalBeginMfaEnrollment(oldA.token,identity2,pending.mfa.id)
    assert.ok(started?.ticket)
    const ticket=started!.ticket
    assert.equal((await foundation.personalClaimMfaVerification(oldA.token,ticket))?.factor_id,pending.mfa.id)
    const activated=await auth.verifyAuthMfa({
      id:pending.mfa.id,auth_identity_id:identity2,code:totp(pending.secret!),
    })
    assert.equal(activated.status,"enabled")
    const before=await db.query("select count(*)::int as n from da_browser_session where person_id=$1 and status='active'",[person.id])
    assert.equal(before.rows[0].n,2)

    // The native MFA factor is enabled BEFORE Foundation completion; fail
    // the latter and require its DB transaction to roll back in full.
    await db.query("create function da_ci_reject_enroll_outbox() returns trigger language plpgsql as $ begin raise exception 'CI_ENROLLMENT_ROLLBACK'; end; $")
    await db.query("create trigger da_ci_reject_enroll_outbox before insert on da_security_outbox for each row execute function da_ci_reject_enroll_outbox()")
    try{
      await assert.rejects(
        foundation.personalCompleteMfaEnrollment(oldA.token,ticket,pending.mfa.id),
        /CI_ENROLLMENT_ROLLBACK/,
      )
    }finally{
      await db.query("drop trigger if exists da_ci_reject_enroll_outbox on da_security_outbox")
      await db.query("drop function if exists da_ci_reject_enroll_outbox()")
    }
    const after=await db.query("select count(*)::int as n from da_browser_session where person_id=$1 and status='active'",[person.id])
    assert.equal(after.rows[0].n,2,"Failed completion changed session count")
    assert.equal((await foundation.personalClaimMfaVerification(oldA.token,ticket))?.factor_id,pending.mfa.id)
    const fresh=await foundation.personalCompleteMfaEnrollment(oldA.token,ticket,pending.mfa.id)
    assert.ok(fresh?.token)
    assert.ok(await foundation.personalSession(fresh!.token))
    assert.equal(await foundation.personalEnrollmentSession(oldA.token),null)
    assert.equal(await foundation.personalEnrollmentSession(oldB.token),null)
    assert.equal(await foundation.personalCompleteMfaEnrollment(oldA.token,ticket,pending.mfa.id),null)
    process.stdout.write("PASS DoğruAdres native enrollment: ticket, native TOTP, injected Foundation rollback, retry, fresh full session and old-session denial\n")
  }finally{
    await db.end()
  }
}
