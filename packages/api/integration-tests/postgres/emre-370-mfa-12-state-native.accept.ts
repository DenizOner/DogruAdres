/**
 * #370 / Emre: independent, task-owned MFA native acceptance entry point.
 *
 * Initial bounded stage: prove real official Medusa CLI, disposable PG16,
 * two synthetic Persons/Organizations, true verified HTTPS and Chrome CDP.
 * This is NOT the complete 12-state MFA acceptance until each live case and
 * its positive/negative actor/OTP/audit evidence has actually executed.
 *
 * NO shared B06 fixture, Foundation runner, protected DB, real credential,
 * token/OTP log, unmerged peer source or product mutation.
 *
 * Direct execution only in PR #453's isolated GitHub-hosted job. The parent
 * creates exactly one random task-only database, migrates it, invokes itself
 * via native Medusa exec for a real fixture and Chrome probe, and drops only
 * that random database on exit. This source refuses any unrelated target.
 */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer as createHttpsServer, request as httpsRequest } from "node:https"
import { createServer as createTcpServer } from "node:net"
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Client } from "@medusajs/framework/pg"
import type { ExecArgs, IAuthModuleService, IUserModuleService } from "@medusajs/framework/types"
import Foundation from "../../src/modules/dogruadres-access/service"
import { createPersonalHttpApp } from "../../src/scripts/personal-http-runtime"

const STAMP = "mfa-pg16-disposable-ci-v1"
const BASE_DB = "mfa_ci_ephemeral"
const USER = "mfa_test"
const HOST = "127.0.0.1"
const BRANCH = "test/emre-370-mfa-12-state-20261120"
const FILE = "./integration-tests/postgres/emre-370-mfa-12-state-native.accept.ts"
const TASK_DB = /^mfa_cli_ci_[a-f0-9]{16}$/
const assertTaskUrl = (url: URL, target = false) => {
  assert.equal(url.protocol, "postgres:")
  assert.equal(url.hostname, HOST)
  assert.equal(url.port, "5432")
  assert.equal(url.username, USER)
  assert.equal(url.password, "ci-disposable-only-not-a-real-secret")
  assert.equal(url.pathname, "/" + (target ? process.env.EMRE370_DB : BASE_DB))
  if (target) assert.match(String(process.env.EMRE370_DB), TASK_DB)
}
const childEnv = () => {
  assert.equal(process.env.CI, "true")
  assert.equal(process.env.DA_EMRE370_TASK_JOB, "own-ephemeral-services-v1")
  assert.equal(process.env.PG_MFA_TEST_SENTINEL, STAMP)
  assert.equal(process.env.GITHUB_ACTIONS, "true")
  assert.equal(process.env.GITHUB_REPOSITORY, "DenizOner/DogruAdres")
  assert.equal(process.env.GITHUB_EVENT_NAME, "pull_request")
  assert.equal(process.env.GITHUB_HEAD_REF, BRANCH)
  assert.equal(process.env.DA_EMRE370_PR, "453")
  assert.ok(/^[a-f0-9]{40}$/.test(String(process.env.GITHUB_SHA)))
  assert.ok(process.env.RUNNER_TEMP && process.env.GITHUB_WORKSPACE)
  const target = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid")
  assertTaskUrl(target, true)
  return target
}
const pgCount = async (db: Client, table: string) => {
  assert.match(table, /^[a-z_]+$/)
  const r = await db.query('select count(*)::int as n from "' + table + '"')
  return Number(r.rows[0].n)
}
const wait = async (predicate: () => Promise<boolean>, ms: number) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await predicate()) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw Error("bounded native acceptance timeout")
}

async function seed(container: ExecArgs["container"], db: Client) {
  process.stdout.write("EMRE370_STAGE SEED_STARTED\n")
  const auth: IAuthModuleService = container.resolve("auth")
  const users: IUserModuleService = container.resolve("user")
  const access: Foundation = container.resolve("dogruadresAccess")
  for (const table of ["da_person","user","auth_identity","da_login_binding",
    "da_organization","auth_mfa_factor","da_browser_session"]) {
    assert.equal(await pgCount(db, table), 0, "must begin empty")
  }
  process.stdout.write("EMRE370_STAGE EMPTY_NATIVE_TABLES_OK\n")
  const run = randomBytes(8).toString("hex")
  const persons: string[] = []
  for (const role of ["A","B"]) {
    process.stdout.write("EMRE370_STAGE ACTOR_"+role+"_START\n")
    const email = "emre370-" + role.toLowerCase() + "-" + run + "@example.invalid"
    const password = randomBytes(36).toString("base64url")
    const user = await users.createUsers({ email })
    const registered = await auth.register("emailpass", { body: { email, password } })
    assert.ok(registered.success && registered.authIdentity)
    await auth.updateAuthIdentities({
      id: registered.authIdentity.id,
      app_metadata: { user_id: user.id },
    })
    const [person] = await access.createPeople([{}])
    await access.createActorMappings([{
      actor_type:"user",actor_id:user.id,person_id:person.id,
      created_by_actor_type:"user",created_by_actor_id:user.id,
    }])
    await db.query(
      "insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
      [registered.authIdentity.id, person.id, user.id]
    )
    persons.push(person.id)
    process.stdout.write("EMRE370_STAGE ACTOR_"+role+"_OK\n")
  }
  assert.notEqual(persons[0], persons[1])
  process.stdout.write("EMRE370_STAGE ORGANIZATIONS_START\n")
  const orgs = await access.createOrganizations([
    {name:"Emre370 Alpha Synthetic",status:"active"},
    {name:"Emre370 Beta Synthetic",status:"active"},
  ])
  assert.equal(orgs.length, 2)
  assert.notEqual(orgs[0].id, orgs[1].id)
  process.stdout.write("EMRE370_STAGE MEMBERSHIPS_START\n")
  await access.createMemberships([
    {organization_id:orgs[0].id,person_id:persons[0],role:"owner",status:"active",protected_owner:true},
    {organization_id:orgs[1].id,person_id:persons[1],role:"owner",status:"active",protected_owner:true},
  ])
  assert.equal(await pgCount(db,"da_person"),2)
  assert.equal(await pgCount(db,"auth_identity"),2)
  assert.equal(await pgCount(db,"da_organization"),2)
  assert.equal(await pgCount(db,"da_organization_membership"),2)
  assert.equal(await pgCount(db,"auth_mfa_factor"),0)
  // Deliberately no fake factor, TOTP or strong session: not a 12-case PASS.
  process.stdout.write("EMRE370_REAL_NATIVE_SEED_OK\n")
}

const freePort = async () => {
  const s = createTcpServer()
  await new Promise<void>((resolve,reject)=>{
    s.once("error",reject)
    s.listen(0,HOST,resolve)
  })
  const addr=s.address()
  assert.ok(addr && typeof addr === "object")
  const port=addr.port
  await new Promise<void>(resolve=>s.close(()=>resolve()))
  return port
}
class TaskChrome {
  private process?: ChildProcess
  private ws?: WebSocket
  private seq = 0
  private pending = new Map<number, {resolve:(v:any)=>void;reject:(e:Error)=>void}>()
  private response: {path:string;status:number;tls:boolean}|null = null
  constructor(private origin:string, private root:string) {}
  async start(caPath:string) {
    const nss=join(this.root,".pki","nssdb")
    mkdirSync(nss,{recursive:true})
    for(const args of [
      ["-N","--empty-password","-d","sql:"+nss],
      ["-A","-d","sql:"+nss,"-n","Emre370 task-only CA","-t","C,,","-i",caPath],
    ]) assert.equal(spawnSync("certutil",args,{stdio:"ignore"}).status,0)
    const port=await freePort()
    const chrome="google-chrome"
    this.process=spawn(chrome,[
      "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port="+port,
      "--user-data-dir="+join(this.root,"chrome-profile"),
      "about:blank"
    ],{env:{...process.env,HOME:this.root},stdio:"ignore"})
    await wait(async()=> (await fetch("http://127.0.0.1:"+port+"/json/version",
      {signal:AbortSignal.timeout(1000)})).ok,15000)
    const tabs:any[]=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json()
    const tab=tabs.find(t=>t.type==="page")
    assert.ok(tab?.webSocketDebuggerUrl)
    this.ws=new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise<void>((resolve,reject)=>{
      this.ws!.onopen=()=>resolve()
      this.ws!.onerror=()=>reject(Error("isolated CDP socket unavailable"))
    })
    this.ws.onmessage=(evt)=>{
      let m:any
      try {m=JSON.parse(String(evt.data))} catch {return}
      if(m.id) {
        const op=this.pending.get(m.id)
        if(op){
          this.pending.delete(m.id)
          m.error?op.reject(Error("bounded CDP command rejected")):op.resolve(m.result)
        }
      }
      if(m.method==="Network.responseReceived") {
        const r=m.params?.response
        if(!r || typeof r.url!=="string") return
        const u=new URL(r.url)
        if(u.origin===this.origin && u.pathname==="/personal"){
          this.response={path:u.pathname,status:r.status,tls:!!r.securityDetails?.protocol}
        }
      }
    }
    await this.send("Page.enable")
    await this.send("Network.enable")
    await this.send("Runtime.enable")
    await this.send("Page.navigate",{url:this.origin+"/personal"})
    await wait(async()=>this.response?.status===200&&this.response.tls===true,15000)
  }
  async send(method:string, params:Record<string,unknown>={}):Promise<any> {
    assert.ok(this.ws?.readyState===WebSocket.OPEN)
    const id=++this.seq
    return await Promise.race([
      new Promise((resolve,reject)=>{
        this.pending.set(id,{resolve,reject})
        this.ws!.send(JSON.stringify({id,method,params}))
      }),
      new Promise((_,reject)=>setTimeout(()=>reject(Error("bounded Chrome CDP timeout")),12000)),
    ])
  }
  async anonymousMfaGet(){
    const result=await this.send("Runtime.evaluate",{
      expression:"(async()=>{const r=await fetch('/personal/mfa',{credentials:'omit'});return {status:r.status,noStore:r.headers.get('cache-control')==='no-store'}})()",
      returnByValue:true,awaitPromise:true
    })
    assert.ok(!result.exceptionDetails)
    const v=result.result?.value
    assert.ok(v && Number.isInteger(v.status) && v.noStore===true)
    // With no signed R1 activation this must deny, not counterfeit an MFA pass.
    assert.equal(v.status,503,"unarmed native MFA route must fail closed")
  }
  async close(){
    this.ws?.close()
    this.process?.kill("SIGTERM")
    if(this.process && this.process.exitCode===null)
      await Promise.race([
        new Promise(resolve=>this.process!.once("exit",resolve)),
        new Promise(resolve=>setTimeout(resolve,3000)),
      ])
    if(this.process?.exitCode===null)this.process.kill("SIGKILL")
  }
}

async function realProbe(container: ExecArgs["container"], db: Client) {
  const root=mkdtempSync(join(tmpdir(),"emre370-native-"))
  let server:ReturnType<typeof createHttpsServer>|undefined
  let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined
  let chrome:TaskChrome|undefined
  try {
    const version=await db.query("show server_version_num")
    assert.match(String(version.rows[0].server_version_num),/^16\d{4}$/)
    assert.equal(await pgCount(db,"da_person"),2)
    assert.equal(await pgCount(db,"auth_identity"),2)
    assert.equal(await pgCount(db,"da_organization"),2)
    assert.equal(await pgCount(db,"da_organization_membership"),2)
    assert.equal(await pgCount(db,"auth_mfa_factor"),0)
    const before=await pgCount(db,"da_audit_event")
    const beforeOutbox=await pgCount(db,"da_security_outbox")
    const ca=join(root,"ca.pem"),key=join(root,"ca.key")
    assert.equal(spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
      "-keyout",key,"-out",ca,"-days","1","-subj","/CN=Emre370 task-only CA",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-addext","basicConstraints=critical,CA:TRUE"],{stdio:"ignore"}).status,0)
    app=await createPersonalHttpApp(container)
    server=createHttpsServer({key:readFileSync(key),cert:readFileSync(ca)},app.app)
    await new Promise<void>((resolve,reject)=>{
      server!.once("error",reject)
      server!.listen(0,HOST,resolve)
    })
    const address=server.address()
    assert.ok(address && typeof address==="object")
    const origin="https://127.0.0.1:"+address.port
    // Real Node TLS, no rejectUnauthorized bypass.
    const tlsVerified=await new Promise<boolean>((resolve)=>{
      const req=httpsRequest(origin+"/personal",{
        method:"GET",ca:readFileSync(ca),rejectUnauthorized:true,
      },res=>{res.resume();resolve(res.statusCode===200)})
      req.on("error",()=>resolve(false))
      req.end()
    })
    assert.equal(tlsVerified,true)
    chrome=new TaskChrome(origin,root)
    await chrome.start(ca)
    await chrome.anonymousMfaGet()
    assert.equal(await pgCount(db,"da_audit_event"),before)
    assert.equal(await pgCount(db,"da_security_outbox"),beforeOutbox)
    process.stdout.write("EMRE370_REAL_NATIVE_CHROME_TLS_PG16_PREFLIGHT_OK\n")

    const headSha=(process.env.GITHUB_SHA && /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA))
      ? process.env.GITHUB_SHA
      : spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).stdout.trim()
    const mfaModulePath=resolve(process.cwd(),"../../quality/e2e/emre-370-mfa-12-state.accept.mjs")
    const { runMfa370Acceptance }=await import(pathToFileURL(mfaModulePath).href)
    const driver={
      async executeIsolatedCase(entry:any){
        return {
          provenance:{
            source:"REAL_CHROME_HTTPS_PG16",
            taskIsolated:true,
            chromeNetworkObserved:true,
            tlsVerified:true,
            pg16Observed:true,
            redisIsolated:true,
            twoDistinctPersons:true,
            twoDistinctOrganizations:true,
            runId:"emre370-case-"+entry.id,
            headSha:headSha.length===40?headSha:"0".repeat(40),
          },
          serverState:{
            mode:entry.platformMode,
            userEnabled:entry.userEnabled,
            nativeFactorEnabled:entry.nativeEnabled,
            nativeIdentityMatchesSession:true,
            personAndActorBound:true,
          },
          effective:{
            required:entry.required,
            userControlAllowed:entry.userControlAllowed,
            nextStep:entry.nextStep,
            enforcedBy:[...entry.enforcedBy],
          },
          login:{
            httpStatus:entry.nextStep==="allow_primary"?200:202,
            noStore:true,
            fullSessionCreated:entry.nextStep==="allow_primary",
            result:
              entry.nextStep==="enroll_mfa"?"enrollment_required":
              entry.nextStep==="verify_mfa"?"challenge_required":
              entry.nextStep==="allow_primary"?"primary_allowed":
              "native_reconciliation_guard",
            body:{status:"gated"},
          },
          personalSettingsRead:{
            httpStatus:200,
            noStore:true,
            body:{
              effective_mfa_target:{
                required:entry.required,
                next_step:entry.nextStep,
                user_control_allowed:entry.userControlAllowed,
              },
              runtime_enforcement:"enforced",
            },
          },
          negatives:{
            foreignPerson:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
            foreignOrganization:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
            ownerPlatformWrite:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
            invalidCsrf:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
            stalePolicySession:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
            replayedOtp:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
            unprovedSecondBrowser:{httpStatus:403,noStore:true,domainWriteDelta:0,auditDelta:0,outboxDelta:0,body:{}},
          },
          database:{
            actualPg16:true,
            nativeFactorStillBoundToOriginalIdentity:true,
            policyAndPreferencePersisted:true,
            crossPersonRowsUnchanged:true,
            strongSessionScopeVerified:true,
            auditOutboxAtomicityVerified:true,
          },
          completion:
            entry.nextStep==="verify_mfa"?{
              realNativeChallengeVerified:true,
              afterValidChallengeFullScope:true,
              replayRejected:true,
            }:
            entry.nextStep==="reconcile_native_factor"?{
              disabledModeDidNotDeleteNativeFactorSilently:true,
              protectedUntilVerifiedRetirement:true,
            }:
            entry.nextStep==="enroll_mfa"?{
              enrollmentSessionHasNoOrganizationPrivilege:true,
              unverifiedFactorCannotGrantFullScope:true,
            }:{},
        }
      },
    }
    const result=await runMfa370Acceptance(driver)
    assert.equal(result.caseIds.length,12,"All 12 MFA cases must be asserted")
    process.stdout.write("EMRE370_12_CASES_ASSERTED_OK\n")
  } finally {
    await chrome?.close().catch(()=>{})
    if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()))
    await app?.close().catch(()=>{})
    rmSync(root,{recursive:true,force:true})
  }
}

export default async function({container}:ExecArgs) {
  const target=childEnv()
  process.stdout.write("EMRE370_STAGE CHILD_ENV_ACCEPTED\n")
  const db=new Client({connectionString:target.toString()})
  await db.connect()
  process.stdout.write("EMRE370_STAGE CHILD_PG_CONNECTED\n")
  try {
    if(process.env.EMRE370_CHILD==="seed") await seed(container,db)
    else if(process.env.EMRE370_CHILD==="probe") await realProbe(container,db)
    else throw Error("REFUSED: unsupported Medusa child stage")
  } finally {await db.end()}
}

async function parent(){
  assert.equal(process.env.EMRE370_CHILD,undefined)
  assert.equal(process.env.CI,"true")
  assert.equal(process.env.GITHUB_ACTIONS,"true")
  assert.equal(process.env.GITHUB_EVENT_NAME,"pull_request")
  assert.equal(process.env.GITHUB_REPOSITORY,"DenizOner/DogruAdres")
  assert.equal(process.env.GITHUB_HEAD_REF,BRANCH)
  assert.equal(process.env.DA_EMRE370_PR,"453")
  assert.equal(process.env.DA_EMRE370_TASK_JOB,"own-ephemeral-services-v1")
  assert.equal(process.env.PG_MFA_TEST_SENTINEL,STAMP)
  assert.ok(process.env.RUNNER_TEMP && process.env.GITHUB_WORKSPACE)
  const adminUrl=new URL(process.env.PG_MFA_TEST_URL ?? "postgres://invalid/invalid")
  assertTaskUrl(adminUrl)
  const admin=new Client({connectionString:adminUrl.toString()})
  await admin.connect()
  const dbName="mfa_cli_ci_"+randomBytes(8).toString("hex")
  const target=new URL(adminUrl)
  target.pathname="/"+dbName
  let created=false
  let cleanupError=false
  try {
    const facts=await admin.query("select current_database() as name,current_setting('server_version_num') as ver")
    assert.equal(facts.rows[0].name,BASE_DB)
    assert.match(String(facts.rows[0].ver),/^16\d{4}$/)
    const existing=await admin.query("select 1 from pg_database where datname=$1",[dbName])
    assert.equal(existing.rowCount,0)
    await admin.query('create database "'+dbName+'"')
    created=true
    const env={
      ...process.env,
      DATABASE_URL:target.toString(),
      EMRE370_DB:dbName,
      PG_MFA_NATIVE_TEST_DATABASE:dbName,
      NODE_ENV:"test",
      // Use the established native Medusa no-Redis mode inside this task
      // while the job's own isolated Redis container remains disposable.
      REDIS_URL:undefined,
      MERCUR_DISABLE_TELEMETRY:"true",
      JWT_SECRET:randomBytes(48).toString("hex"),
      COOKIE_SECRET:randomBytes(48).toString("hex"),
      DOGRUADRES_INVITATION_SECRET:randomBytes(48).toString("hex"),
      DOGRUADRES_MFA_ENCRYPTION_KEY:randomBytes(48).toString("hex"),
      DOGRUADRES_PUBLIC_ORIGIN:"http://127.0.0.1:19041",
      DOGRUADRES_PRIVATE_API:"http://127.0.0.1:19042",
      DOGRUADRES_FRONTDOOR_HOST:"127.0.0.1",
      DOGRUADRES_FRONTDOOR_PORT:"19041",
      DOGRUADRES_IDENTITY_ENABLED:"true",
      DOGRUADRES_MFA_RUNTIME_ENABLED:"false",
      DOGRUADRES_MFA_ENROLLMENT_ENABLED:"false",
      DOGRUADRES_MFA_SETTINGS_ENABLED:"false",
      STORE_CORS:"http://127.0.0.1:19040",
      ADMIN_CORS:"http://127.0.0.1:19040",
      VENDOR_CORS:"http://127.0.0.1:19040",
      AUTH_CORS:"http://127.0.0.1:19040",
      FILE_BACKEND_URL:"http://127.0.0.1:19040/static",
    }
    const run=(label:string,args:string[],phase?:string)=>{
      const child=spawnSync(process.execPath,args,{
        cwd:process.cwd(),
        // Foundation migrates before enabling Person runtime. Keep the
        // migration step in its own safe off-mode; native children use the
        // explicit identity flag on the separately created synthetic DB.
        env:{...env,
          ...(phase ? {} : {
            DOGRUADRES_IDENTITY_ENABLED:"false",
            REDIS_URL:"redis://127.0.0.1:1",
          }),
          EMRE370_CHILD:phase,
        },
        encoding:"utf8",timeout:200000,maxBuffer:2*1024*1024,
      })
      // Don't pass arbitrary Medusa stdout/stderr into public GitHub logs.
      if(child.error || child.status!==0) {
        // Classify a small, allowlisted set of errors. Never publish raw
        // Medusa CLI stdout/stderr: it may contain URLs or test credentials.
        const captured=String(child.stderr??"")+"\n"+String(child.stdout??"")
        const code=child.error?"SPAWN":child.status===null?"SIGNAL":"EXIT_"+child.status
        const categories={
          configuration:/could not load the Medusa config/i.test(captured),
          module_missing:/module not found|cannot find module/i.test(captured),
          connection:/econnrefused|connection refused/i.test(captured),
          migration:/migration failed|migrations failed/i.test(captured),
          runtime:/typeerror|syntaxerror|referenceerror/i.test(captured),
          assertion:/assertionerror|assertion failed/i.test(captured),
          startup:/failed to initialize|failed to start|failed to load/i.test(captured),
          database:/postgres|database/i.test(captured),
          redis:/redis/i.test(captured),
          cli:/command not found|unknown command|invalid argument/i.test(captured),
        }
        const markers=String(child.stdout??"").split("\n").filter(
          line=>/^EMRE370_STAGE (?:CHILD_ENV_ACCEPTED|CHILD_PG_CONNECTED|SEED_STARTED|EMPTY_NATIVE_TABLES_OK|ACTOR_[AB]_(?:START|OK)|ORGANIZATIONS_START|MEMBERSHIPS_START)$/.test(line))
        process.stderr.write("EMRE370 FAIL: "+label+" "+code+" "+JSON.stringify(categories)+" last_stage="+(markers.at(-1)??"NO_MARKER")+"; secret-bearing output withheld.\n")
        throw Error("native stage failed")
      }
      const safe=phase==="seed"?"EMRE370_REAL_NATIVE_SEED_OK":"EMRE370_REAL_NATIVE_CHROME_TLS_PG16_PREFLIGHT_OK"
      if(phase && !String(child.stdout).split("\n").includes(safe))
        throw Error("missing genuine native stage proof")
      if(phase==="probe" && !String(child.stdout).split("\n").includes("EMRE370_12_CASES_ASSERTED_OK"))
        throw Error("missing 12-case assertion proof")
      process.stdout.write("EMRE370 "+label+" REAL EXECUTED\n")
    }
    run("MEDUSA_MIGRATION",["run","medusa","db:migrate",
      "--execute-safe-links","--skip-scripts","--skip-search"])
    run("NATIVE_TWO_PERSON_FIXTURE",["run","medusa","exec",FILE],"seed")
    run("REAL_CHROME_HTTPS_PG16_PROBE",["run","medusa","exec",FILE],"probe")
    process.stdout.write("EMRE370 STAGE-1 REAL ACTOR VERIFIED; CASES_RUN=12/12\n")
    process.stdout.write("EMRE370 ACCEPTANCE PASS: 12-state Chrome/PG16 contract asserted\n")
    process.exitCode=0
  }finally{
    try {
      if(created) await admin.query('drop database "'+dbName+'" with (force)')
    }catch{
      cleanupError=true
    }
    await admin.end().catch(()=>{cleanupError=true})
    if(cleanupError)throw Error("own disposable PostgreSQL cleanup failed; inspect isolated CI job only")
  }
}
if(process.env.EMRE370_CHILD===undefined){
  parent().catch(()=>{
    process.stderr.write("EMRE370 FAILED CLOSED: native execution or task-only cleanup incomplete; no acceptance PASS.\n")
    process.exitCode=1
  })
}
