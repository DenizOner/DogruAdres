/**
 * Issue #220 — Medusa 2.21.2 CLI db:migrate discovery against a newly created
 * CI-only database. No migrations or schema changes touch protected M0 data.
 * Runs once; existing MikroORM ledger tests cover late-add and replay.
 */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const adminUrl=new URL(process.env.PG_MFA_TEST_URL??"postgres://invalid/invalid")
if(process.env.CI!=="true" ||
  process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1" ||
  adminUrl.protocol!=="postgres:" || adminUrl.hostname!=="127.0.0.1" ||
  adminUrl.port!=="5432" || adminUrl.username!=="mfa_test" ||
  adminUrl.pathname!=="/mfa_ci_ephemeral" ||
  adminUrl.password!=="ci-disposable-only-not-a-real-secret")
  throw Error("REFUSED: Medusa CLI test requires its exact disposable PG16 CI server")
const SQL=(globalThis as any).Bun?.SQL
if(typeof SQL!=="function")throw Error("Bun PostgreSQL driver unavailable")

const scope = (process.env.PG_MFA_TEST_SCOPE ||
  process.argv.slice(2).find(arg => arg.startsWith("--scope="))?.split("=")[1] ||
  "all").toLowerCase()
if (!["all", "mfa", "verification", "b02", "b04", "b04-ui", "b05-ui", "b06-ui", "b07-ui", "b08-ui"].includes(scope))
  throw Error(`REFUSED: invalid PG_MFA_TEST_SCOPE: "${scope}". Allowed: all, mfa, verification, b02, b04, b04-ui, b05-ui, b06-ui, b07-ui, b08-ui`)
if (scope === "b04-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B04_UI_DISPATCH_SCOPE !== "b04-ui"))
  throw Error("REFUSED: B04-UI requires explicit workflow_dispatch scope=b04-ui")
if (scope === "b05-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B05_UI_DISPATCH_SCOPE !== "b05-ui"))
  throw Error("REFUSED: B05-UI requires explicit workflow_dispatch scope=b05-ui")
if (scope === "b06-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B06_UI_DISPATCH_SCOPE !== "b06-ui"))
  throw Error("REFUSED: B06-UI requires explicit workflow_dispatch scope=b06-ui")
if (scope === "b07-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B07_UI_DISPATCH_SCOPE !== "b07-ui"))
  throw Error("REFUSED: B07-UI requires explicit workflow_dispatch scope=b07-ui")
if (scope === "b08-ui" && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.B08_UI_DISPATCH_SCOPE !== "b08-ui"))
  throw Error("REFUSED: B08-UI requires explicit workflow_dispatch scope=b08-ui")

const admin=new SQL(adminUrl.toString())
const dbName="mfa_cli_ci_"+randomBytes(8).toString("hex")
const dbUrl=new URL(adminUrl)
dbUrl.pathname="/"+dbName
const secrets=[0,1,2].map(()=>randomBytes(48).toString("hex"))
// Native medusa exec initializes core defaults requiring its built-in link tables.
// Execute only non-destructive link sync in this fresh, random task DB.
const flags=["db:migrate","--execute-safe-links","--skip-scripts","--skip-search"]
const sanitized=(value:string)=>value
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,"postgres://[redacted]")
  .replaceAll(adminUrl.password,"[redacted]")
  .slice(-2500)
let created=false
async function run(){
  try{
    const server=(await admin.unsafe("select current_database() as db, current_setting('server_version_num') as ver"))[0]
    assert.equal(server.db,"mfa_ci_ephemeral")
    assert.match(server.ver,/^16\d{4}$/)
    assert.equal((await admin.unsafe("select count(*)::int as n from pg_database where datname=$1",[dbName]))[0].n,0)
    // A random name is used once, and we refuse any pre-existing collision.
    await admin.unsafe('create database "'+dbName+'"')
    created=true
    const env:NodeJS.ProcessEnv={
      ...process.env,
      DATABASE_URL:dbUrl.toString(),
      NODE_ENV:"test",
      REDIS_URL:"redis://127.0.0.1:1",
      STORE_CORS:"http://127.0.0.1:19040",
      ADMIN_CORS:"http://127.0.0.1:19040",
      VENDOR_CORS:"http://127.0.0.1:19040",
      AUTH_CORS:"http://127.0.0.1:19040",
      FILE_BACKEND_URL:"http://127.0.0.1:19040/static",
      JWT_SECRET:secrets[0],
      COOKIE_SECRET:secrets[1],
      DOGRUADRES_INVITATION_SECRET:secrets[2],
      DOGRUADRES_IDENTITY_ENABLED:"false",
      DOGRUADRES_MFA_RUNTIME_ENABLED:"false",
      DOGRUADRES_MFA_ENROLLMENT_ENABLED:"false",
      DOGRUADRES_MFA_SETTINGS_ENABLED:"false",
    }
    const result=spawnSync(process.execPath,["run","medusa",...flags],{
      cwd:process.cwd(),env,encoding:"utf8",timeout:180000,maxBuffer:2*1024*1024,
    })
    if(result.error || result.status!==0){
      const cause=String(result.error??("exit "+result.status))
      throw Error("Medusa CLI migration not accepted: "+cause+"; "+sanitized(String(result.stderr??"")+"\n"+String(result.stdout??"")))
    }
    // Independent DB observation, not CLI output matching.
    const target=new SQL(dbUrl.toString())
    try{
      const rows=await target.unsafe("select to_regclass('da_audit_event') as audit,to_regclass('da_audit_outbox') as outbox,to_regclass('da_organization_membership') as membership,to_regclass('da_organization_seller_ownership') as legal_ownership")
      assert.ok(rows[0].audit,"Medusa CLI did not discover Foundation audit migration")
      assert.ok(rows[0].outbox,"Medusa CLI did not discover canonical outbox migration")
      assert.ok(rows[0].membership,"Medusa CLI did not discover Foundation membership migration")
      assert.ok(rows[0].legal_ownership,"Medusa CLI did not discover B22 legal ownership migration")
      const ledger=await target.unsafe("select count(*)::int as n from mikro_orm_migrations where name like 'Migration2026102%'")
      assert.ok(Number(ledger[0].n)>=1,"No Foundation migration history from Medusa CLI")
      process.stdout.write("PASS Medusa 2.21.2 CLI db:migrate: Foundation discovered and ledger recorded on disposable PG16\n")
      // Execute native AuthIdentity TOTP/recovery with this exact disposable
      // database. Only this child enables the local Auth module MFA options;
      // it cannot enable Foundation's persistent rollout latch.
      const nativeEnv:NodeJS.ProcessEnv={
        ...env,
        PG_MFA_NATIVE_TEST_DATABASE:dbName,
        DOGRUADRES_IDENTITY_ENABLED:"true",
        DOGRUADRES_MFA_ENCRYPTION_KEY:randomBytes(48).toString("hex"),
        DOGRUADRES_PUBLIC_ORIGIN:"http://127.0.0.1:19041",
        DOGRUADRES_PRIVATE_API:"http://127.0.0.1:19042",
        DOGRUADRES_FRONTDOOR_HOST:"127.0.0.1",
        DOGRUADRES_FRONTDOOR_PORT:"19041",
      }
      // The harness readback session is a genuine foreign consumer to the child.
      await target.close()

      if (scope === "b02") {
        const b02=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/b02-negatives.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        // Only explicit sanitized evidence is published; never native debug output.
        const output=String(b02.stdout??"").split("\n").filter(line=>/^(B02_EVIDENCE |PASS B02 |BLOCKED B02 )/.test(line)).join("\n")
        process.stdout.write(output+"\n")
        if(b02.error||b02.status!==0)throw Error("B02 native execution failed; inspect sanitized evidence")
        assert.ok(output.includes("PASS B02 bounded HTTP/SQL execution"),"Missing B02 execution evidence")
      }

      if (scope === "b04") {
        const b04=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/b04-roles-and-access.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        const output=String(b04.stdout??"").split("\n").filter(line=>/^(B04_EVIDENCE |PASS B04 |BLOCKED B04 )/.test(line)).join("\n")
        process.stdout.write(output+"\n")
        if(b04.error||b04.status!==0)throw Error("B04 native execution failed; inspect sanitized evidence")
        assert.ok(output.includes("PASS B04 bounded HTTP/SQL execution"),"Missing B04 execution evidence")
      }

      if (scope === "b04-ui") {
        const browser = spawnSync(process.execPath, ["run", "medusa", "exec",
          "./integration-tests/postgres/b04-roles-and-access.exec.ts"], {
          cwd: process.cwd(), env: nativeEnv, encoding: "utf8", timeout: 240000, maxBuffer: 2*1024*1024,
        })
        const output = String(browser.stdout ?? "").split("\n").filter(line => /^(B04_UI_EVIDENCE |PASS B04-UI )/.test(line)).join("\n")
        process.stdout.write(output + "\n")
        if (browser.error || browser.status !== 0) throw Error("B04-UI execution failed; sanitized evidence only; no retry")
        assert.ok(output.includes("PASS B04-UI real Chrome UI/HTTP/SQL"), "Missing B04-UI evidence")
      }

      if (scope === "b05-ui") {
        const browser = spawnSync(process.execPath, ["run", "medusa", "exec",
          "./integration-tests/postgres/b05-memberships.exec.ts"], {
          cwd: process.cwd(), env: nativeEnv, encoding: "utf8", timeout: 300000, maxBuffer: 2*1024*1024,
        })
        const output = String(browser.stdout ?? "").split("\n").filter(line => /^(B05_UI_EVIDENCE |PASS B05-UI )/.test(line)).join("\n")
        process.stdout.write(output + "\n")
        if (browser.error || browser.status !== 0) throw Error("B05-UI failed; sanitized evidence only; no retry")
        assert.ok(output.includes("PASS B05-UI real Chrome membership listing/refresh"), "Missing B05-UI evidence")
      }

      if (scope === "b06-ui") {
        const suffix=randomBytes(8).toString('hex')
        // B06 MFA/challenge stays within one native Medusa process; no Redis service is provisioned in this CI job.
        // Unlike non-interactive migration checks, live personal HTTP must not target the deliberate port-1 Redis sentinel.
        const b06Env={...nativeEnv,REDIS_URL:undefined,B06_EMAIL_A:`b06-a-${suffix}@example.invalid`,B06_EMAIL_B:`b06-b-${suffix}@example.invalid`,B06_PASSWORD_A:randomBytes(32).toString('base64url'),B06_PASSWORD_B:randomBytes(32).toString('base64url')}
        const invoke=(script:string,env:NodeJS.ProcessEnv,activation=false)=>{
          const child=spawnSync(process.execPath,activation?[script]:['run','medusa','exec',script],{cwd:process.cwd(),env,encoding:'utf8',timeout:360000,maxBuffer:4*1024*1024})
          const output=String(child.stdout??'').split('\n').filter(line=>/^(B06_UI_EVIDENCE |PASS B06)/.test(line)).join('\n')
          process.stdout.write(output+'\n')
          if(child.error||child.status!==0){
            const cause=sanitized(String(child.error??'')+String(child.stderr??'')+String(child.stdout??''))
            throw Error('B06 stage failed: '+(activation?'activation':env.B06_PREPARE==='true'?'synthetic setup':'Chrome acceptance')+'; '+cause+'; no retry')
          }
          return output
        }
        invoke('./integration-tests/postgres/b06-roles.exec.ts',{...b06Env,B06_PREPARE:'true'})
        // Same database, no consumer during the existing signed activation CAS.
        invoke('./integration-tests/postgres/b06-activation.pg16.ts',b06Env,true)
        const output=invoke('./integration-tests/postgres/b06-roles.exec.ts',{...b06Env,DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true'})
        assert.ok(output.includes('PASS B06-UI real Chrome/native MFA/HTTP/SQL'))
      }

      if (scope === "b07-ui") {
        const suffix=randomBytes(8).toString('hex')
        // B07 MFA/challenge stays within one native Medusa process; no Redis service is provisioned in this CI job.
        // Unlike non-interactive migration checks, live personal HTTP must not target the deliberate port-1 Redis sentinel.
        const b06Env={...nativeEnv,REDIS_URL:undefined,B07_EMAIL_A:`b07-a-${suffix}@example.invalid`,B07_EMAIL_B:`b07-b-${suffix}@example.invalid`,B07_PASSWORD_A:randomBytes(32).toString('base64url'),B07_PASSWORD_B:randomBytes(32).toString('base64url')}
        const invoke=(script:string,env:NodeJS.ProcessEnv,activation=false)=>{
          const child=spawnSync(process.execPath,activation?[script]:['run','medusa','exec',script],{cwd:process.cwd(),env,encoding:'utf8',timeout:360000,maxBuffer:4*1024*1024})
          const output=String(child.stdout??'').split('\n').filter(line=>/^(B07_UI_EVIDENCE |PASS B07)/.test(line)).join('\n')
          process.stdout.write(output+'\n')
          if(child.error||child.status!==0){
            const cause=sanitized(String(child.error??'')+String(child.stderr??'')+String(child.stdout??''))
            throw Error('B07 stage failed: '+(activation?'activation':env.B07_PREPARE==='true'?'synthetic setup':'Chrome acceptance')+'; '+cause+'; no retry')
          }
          return output
        }
        invoke('./integration-tests/postgres/b07-roles.exec.ts',{...b06Env,B07_PREPARE:'true'})
        // Same database, no consumer during the existing signed activation CAS.
        invoke('./integration-tests/postgres/b07-activation.pg16.ts',b06Env,true)
        const output=invoke('./integration-tests/postgres/b07-roles.exec.ts',{...b06Env,DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true'})
        assert.ok(output.includes('PASS B07-UI real Chrome/native MFA/HTTP/SQL'))
      }

      if (scope === "b08-ui") {
        const suffix=randomBytes(8).toString('hex')
        // B08 MFA/challenge stays within one native Medusa process; no Redis service is provisioned in this CI job.
        // Unlike non-interactive migration checks, live personal HTTP must not target the deliberate port-1 Redis sentinel.
        const b06Env={...nativeEnv,REDIS_URL:undefined,B08_EMAIL_A:`b08-a-${suffix}@example.invalid`,B08_EMAIL_B:`b08-b-${suffix}@example.invalid`,B08_PASSWORD_A:randomBytes(32).toString('base64url'),B08_PASSWORD_B:randomBytes(32).toString('base64url')}
        const invoke=(script:string,env:NodeJS.ProcessEnv,activation=false)=>{
          const child=spawnSync(process.execPath,activation?[script]:['run','medusa','exec',script],{cwd:process.cwd(),env,encoding:'utf8',timeout:360000,maxBuffer:4*1024*1024})
          const output=String(child.stdout??'').split('\n').filter(line=>/^(B08_UI_EVIDENCE |PASS B08)/.test(line)).join('\n')
          process.stdout.write(output+'\n')
          if(child.error||child.status!==0){
            const cause=sanitized(String(child.error??'')+String(child.stderr??'')+String(child.stdout??''))
            throw Error('B08 stage failed: '+(activation?'activation':env.B08_PREPARE==='true'?'synthetic setup':'Chrome acceptance')+'; '+cause+'; no retry')
          }
          return output
        }
        invoke('./integration-tests/postgres/b08-revoke-session.exec.ts',{...b06Env,B08_PREPARE:'true'})
        // Same database, no consumer during the existing signed activation CAS.
        invoke('./integration-tests/postgres/b08-activation.pg16.ts',b06Env,true)
        const output=invoke('./integration-tests/postgres/b08-revoke-session.exec.ts',{...b06Env,DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true'})
        assert.ok(output.includes('PASS B08-UI real Chrome/native MFA/HTTP/SQL'))
      }

      if (scope === "all" || scope === "mfa") {
        // Reuse this already migrated disposable CI database; no additional DB/resource.
        const fixture=spawnSync("node",["-r","ts-node/register","./integration-tests/postgres/native-fixture-entry.pg16.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        if(fixture.error||fixture.status!==0)throw Error("R0-D native entry CI failed: "+
          sanitized(String(fixture.error??"")+String(fixture.stderr??"")+String(fixture.stdout??"")))
        assert.ok(String(fixture.stdout).includes("PASS R0-D native entry"))
        process.stdout.write(String(fixture.stdout))
        // TEST_FIXTURE / NOT_AUTHORITY: same existing disposable DB, no operator custody.
        const r1=spawnSync("node",["-r","ts-node/register","./integration-tests/postgres/r1-activation.pg16.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        if(r1.error||r1.status!==0)throw Error("R1 TEST_FIXTURE failed: "+sanitized(String(r1.error??"")+String(r1.stderr??"")+String(r1.stdout??"")))
        assert.ok(String(r1.stdout).includes('PASS R1 TEST_FIXTURE / NOT_AUTHORITY'))
        process.stdout.write(String(r1.stdout))
        const native=spawnSync(process.execPath,["run","medusa","exec",
          "./integration-tests/postgres/native-mfa-lifecycle.exec.ts"],{
          cwd:process.cwd(),env:nativeEnv,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
        })
        if(native.error||native.status!==0)
          throw Error("Native Medusa MFA integration not accepted: "+
            String(native.error??("exit "+native.status))+"; "+
            sanitized(String(native.stderr??"")+"\n"+String(native.stdout??"")))
        const passed=String(native.stdout??"")
        for(const evidence of [
          "PASS Medusa native MFA: synthetic password proof, TOTP start and verify",
          "PASS Medusa native MFA: recovery code consumed exactly once",
          "PASS Medusa native MFA: enabled factor cannot be disabled without fresh challenge",
          "PASS Medusa native MFA challenge: TOTP, owner separation and completed-challenge replay rejection",
          "PASS Medusa native MFA challenge: recovery code consumed and denied on a fresh challenge",
          "PASS Medusa native MFA challenge: five failed attempts lock the challenge",
        ])assert.ok(passed.includes(evidence),"Missing real native MFA acceptance evidence")
        process.stdout.write("PASS exact-DB Medusa native MFA: TOTP, recovery, native challenges and attempt cap\n")
      }

      if (scope === "all" || scope === "verification") {
        // Reuse this same disposable DB and real Medusa CLI boot for #241.
        // The certificate is a temporary test CA; production TLS verification stays on.
        const smtpTemp = mkdtempSync(join(tmpdir(), "dogruadres-smtp-ci-"))
        try {
          for (const name of ["trusted", "untrusted"]) {
            const certificate = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
              "-keyout", join(smtpTemp, name + ".key"), "-out", join(smtpTemp, name + ".crt"),
              "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1"],
              { encoding: "utf8", timeout: 15000 })
            assert.ok(!certificate.error && certificate.status === 0, "Synthetic TLS certificate generation failed")
          }
          const smtp = spawnSync(process.execPath, ["run", "medusa", "exec",
            "./integration-tests/postgres/native-smtp-notification.exec.ts"], {
            cwd: process.cwd(), encoding: "utf8", timeout: 180000, maxBuffer: 2 * 1024 * 1024,
            env: { ...nativeEnv, NODE_EXTRA_CA_CERTS: join(smtpTemp, "trusted.crt"),
              SMTP_TEST_CERT: join(smtpTemp, "trusted.crt"), SMTP_TEST_KEY: join(smtpTemp, "trusted.key"),
              SMTP_TEST_UNTRUSTED_CERT: join(smtpTemp, "untrusted.crt"), SMTP_TEST_UNTRUSTED_KEY: join(smtpTemp, "untrusted.key") },
          })
          if (smtp.error || smtp.status !== 0) throw Error("Native SMTP notification integration failed: " +
            sanitized(String(smtp.error ?? "") + String(smtp.stderr ?? "") + String(smtp.stdout ?? "")))
          const smtpOutput = String(smtp.stdout ?? "")
          for (const marker of ["PASS SMTP native boot:", "PASS SMTP native event:", "PASS SMTP native runtime:",
            "PASS SMTP native failures:", "PASS SMTP native TLS:", "PASS SMTP native local-event failure:", "PASS SMTP native logs:", "PASS SMTP verification origin:",
            "PASS verification CORS:",
            "PASS verification HTTP GET:", "PASS verification HTTP negatives:",
            "PASS browser Next middleware:", "PASS browser token preservation:", "PASS browser native GET inspection:", "PASS browser explicit confirmation:", "PASS browser replay denial:", "PASS browser privacy:",
            "PASS verification HTTP POST:", "PASS verification HTTP privacy:", "PASS verification scope:"])
            assert.ok(smtpOutput.includes(marker), "Missing native SMTP acceptance marker: " + marker)
          // Only fixed acceptance markers are published, never transport/message/secret data.
          process.stdout.write(smtpOutput.split("\n").filter(line => /^(PASS|OBSERVED) (SMTP|verification|browser) /.test(line)).join("\n") + "\n")
        } finally {
          for (const file of readdirSync(smtpTemp)) unlinkSync(join(smtpTemp, file))
          rmdirSync(smtpTemp)
        }
      }

      if (scope === "verification") {
        const audit = new SQL(dbUrl.toString())
        try {
          const authIdentities = Number((await audit.unsafe("select count(*)::int as n from auth_identity"))[0].n)
          assert.equal(authIdentities, 1, `Scope violation: verification run expected 1 AuthIdentity in database, found ${authIdentities}`)
          const persons = Number((await audit.unsafe("select count(*)::int as n from da_person"))[0].n)
          assert.equal(persons, 0, `Scope violation: verification run expected 0 da_person rows, found ${persons}`)
          const orgs = Number((await audit.unsafe("select count(*)::int as n from da_organization"))[0].n)
          assert.equal(orgs, 0, `Scope violation: verification run expected 0 da_organization rows, found ${orgs}`)
          process.stdout.write("PASS exact-DB scope: exactly 1 AuthIdentity and 0 domain fixture records across disposable database\n")
        } finally {
          await audit.close()
        }
      }
    }finally{
      try { await target.close() } catch {}
    }
  }finally{
    try{
      if(created){
        const exists=await admin.unsafe("select count(*)::int as n from pg_database where datname=$1",[dbName])
        if(Number(exists[0].n)!==1)throw Error("Disposable database identity mismatch; refusal to clean")
        await admin.unsafe('drop database "'+dbName+'" with (force)')
        process.stdout.write("CLEANUP: task-owned random Medusa CLI CI database dropped\n")
      }
    }catch(error){
      process.stderr.write("CLEANUP ERROR: "+String(error)+"\n")
      process.exitCode=1
    }finally{
      await admin.close()
    }
  }
}
run().catch(error=>{
  process.stderr.write("Foundation real Medusa CLI PG16 FAILED: "+String(error)+"\n")
  process.exitCode=1
})
