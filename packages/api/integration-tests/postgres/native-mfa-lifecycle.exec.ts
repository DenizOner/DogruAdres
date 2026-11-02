/**
 * Issue #230 — supported Medusa 2.21.2 Auth Module API, REAL native MFA
 * on a random CI-only database created by foundation-medusa-cli.pg16.test.ts.
 * No project Person, Organization, session or protected task DB is created.
 * Secrets, TOTP seeds and recovery codes must never be logged or persisted.
 */
import type { ExecArgs, IAuthModuleService } from "@medusajs/framework/types"
import { randomBytes, createHmac } from "node:crypto"
import assert from "node:assert/strict"

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

}
