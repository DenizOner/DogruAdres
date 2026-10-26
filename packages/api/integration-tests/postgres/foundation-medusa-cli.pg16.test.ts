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
      const rows=await target.unsafe("select to_regclass('da_audit_event') as audit,to_regclass('da_audit_outbox') as outbox,to_regclass('da_organization_membership') as membership")
      assert.ok(rows[0].audit,"Medusa CLI did not discover Foundation audit migration")
      assert.ok(rows[0].outbox,"Medusa CLI did not discover canonical outbox migration")
      assert.ok(rows[0].membership,"Medusa CLI did not discover Foundation membership migration")
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
          cwd: process.cwd(), encoding: "utf8", timeout: 120000, maxBuffer: 2 * 1024 * 1024,
          env: { ...nativeEnv, NODE_EXTRA_CA_CERTS: join(smtpTemp, "trusted.crt"),
            SMTP_TEST_CERT: join(smtpTemp, "trusted.crt"), SMTP_TEST_KEY: join(smtpTemp, "trusted.key"),
            SMTP_TEST_UNTRUSTED_CERT: join(smtpTemp, "untrusted.crt"), SMTP_TEST_UNTRUSTED_KEY: join(smtpTemp, "untrusted.key") },
        })
        if (smtp.error || smtp.status !== 0) throw Error("Native SMTP notification integration failed: " +
          sanitized(String(smtp.error ?? "") + String(smtp.stderr ?? "") + String(smtp.stdout ?? "")))
        const smtpOutput = String(smtp.stdout ?? "")
        for (const marker of ["PASS SMTP native boot:", "PASS SMTP native event:", "PASS SMTP native runtime:",
          "PASS SMTP native failures:", "PASS SMTP native TLS:", "PASS SMTP native local-event failure:", "PASS SMTP native logs:", "PASS SMTP verification origin:",
          "PASS verification HTTP GET:", "PASS verification HTTP negatives:", "PASS verification HTTP POST:", "PASS verification HTTP privacy:", "PASS verification scope:"])
          assert.ok(smtpOutput.includes(marker), "Missing native SMTP acceptance marker")
        // Only fixed acceptance markers are published, never transport/message/secret data.
        process.stdout.write(smtpOutput.split("\n").filter(line => /^(PASS|OBSERVED) (SMTP|verification) /.test(line)).join("\n") + "\n")
      } finally {
        for (const file of readdirSync(smtpTemp)) unlinkSync(join(smtpTemp, file))
        rmdirSync(smtpTemp)
      }
    }finally{
      await target.close()
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
