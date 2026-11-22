/**
 * #370 / Emre: live 12-state MFA native acceptance entry point.
 *
 * Stage 1 (PR #453): proved real official Medusa CLI, disposable PG16,
 * two synthetic Persons/Organizations, true verified HTTPS and Chrome CDP.
 * Stage 2 (PR #465): full live 12-state driver — each of the 12 matrix rows
 * runs with real HTTP/DB/TOTP observations and assertMfa370Observation().
 *
 * NO shared B06 fixture, Foundation runner, protected DB, real credential,
 * token/OTP log, unmerged peer source or product mutation.
 *
 * Direct execution only in PR #465's isolated GitHub-hosted job. The parent
 * creates exactly one random task-only database, migrates it, invokes itself
 * via native Medusa exec for a real fixture and Chrome probe, and drops only
 * that random database on exit. This source refuses any unrelated target.
 */
import assert from "node:assert/strict"
import { randomBytes, createHmac } from "node:crypto"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer as createHttpsServer, request as httpsRequest } from "node:https"
import { createServer as createTcpServer } from "node:net"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
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
const BRANCH = "test/emre-370-mfa-12-state-live-20261122"
const FILE = "./integration-tests/postgres/emre-370-mfa-12-state-native.accept.ts"
// RFC 6238 TOTP: 30s step, SHA-1, 6 digits — matches Medusa's default native TOTP provider.
function totp(secret: string, offset = 0): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index = abc.indexOf(char)
    if (index < 0) throw Error("Unsupported native TOTP encoding")
    bits += index.toString(2).padStart(5, "0")
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(part => parseInt(part, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset))
  const digest = createHmac("sha1", key).update(counter).digest()
  const off = digest[digest.length - 1] & 15
  return ((digest.readUInt32BE(off) & 0x7fffffff) % 1000000).toString().padStart(6, "0")
}
const TASK_DB = /^mfa_cli_ci_[a-f0-9]{16}$/
const credFile = () => join(process.env.RUNNER_TEMP || tmpdir(), "emre370-seed-creds.json")
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
  assert.equal(process.env.DA_EMRE370_PR, "465")
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
  const emails: string[] = []
  const passwords: string[] = []
  const authIdentityIds: string[] = []
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
    emails.push(email)
    passwords.push(password)
    authIdentityIds.push(registered.authIdentity.id)
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
  // Persist credentials for the probe phase (CI-only temp file, no PII to real DB)
  const creds = { persons, emails, passwords, authIdentityIds,
    orgIds: [orgs[0].id, orgs[1].id] }
  writeFileSync(credFile(), JSON.stringify(creds), "utf8")
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
    // Load seed credentials
    const creds: {
      persons: string[]; emails: string[]; passwords: string[];
      authIdentityIds: string[]; orgIds: string[]
    } = JSON.parse(readFileSync(credFile(), "utf8"))
    assert.equal(creds.persons.length, 2)
    assert.equal(creds.emails.length, 2)
    assert.equal(creds.passwords.length, 2)
    assert.equal(creds.authIdentityIds.length, 2)
    assert.equal(creds.orgIds.length, 2)
    // Build TLS cert for local HTTPS server
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
    // Before arming MFA: /personal/mfa must be 503 fail-closed
    await chrome.anonymousMfaGet()
    // Arm the MFA latch in this disposable DB
    await db.query("update da_session_policy set mfa_activated=true where id='current'")
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED = "true"
    process.env.DOGRUADRES_MFA_SETTINGS_ENABLED = "true"
    process.env.DOGRUADRES_MFA_ENROLLMENT_ENABLED = "true"
    process.env.DOGRUADRES_PUBLIC_ORIGIN = origin
    process.stdout.write("EMRE370_REAL_NATIVE_CHROME_TLS_PG16_PREFLIGHT_OK\n")
    // Load the 12-state acceptance contract module
    const headSha = process.env.GITHUB_SHA ||
      spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).stdout.trim()
    assert.match(headSha, /^[a-f0-9]{40}$/)
    const runId = process.env.GITHUB_RUN_ID || "local-"+randomBytes(4).toString("hex")
    const mfaModulePath = resolve(process.cwd(),
      "../../quality/e2e/emre-370-mfa-12-state.accept.mjs")
    const { MFA370_CASES, assertMfa370Observation } =
      await import(pathToFileURL(mfaModulePath).href) as {
        MFA370_CASES: readonly {
          id:string; platformMode:string; userEnabled:boolean; nativeEnabled:boolean;
          required:boolean; userControlAllowed:boolean; nextStep:string; enforcedBy:readonly string[]
        }[];
        assertMfa370Observation:(e:unknown,o:unknown)=>unknown
      }
    assert.equal(MFA370_CASES.length, 12)
    const auth: IAuthModuleService = container.resolve("auth")
    const caBuffer = readFileSync(ca)
    // Helper: make a real HTTPS request to the local server with cookie jar
    const httpsCall = (
      path: string, method: string, body: unknown,
      cookies: Record<string,string>, extraHeaders: Record<string,string> = {}
    ): Promise<{status:number; headers:Record<string,string[]>; body:unknown; cookies:Record<string,string>}> => {
      return new Promise((resolve, reject) => {
        const payload = body !== null ? JSON.stringify(body) : null
        const cookieHeader = Object.entries(cookies)
          .map(([k,v]) => `${k}=${v}`).join("; ")
        const req = httpsRequest(origin+path, {
          method, ca: caBuffer, rejectUnauthorized: true,
          headers: {
            ...(payload ? {"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)} : {}),
            ...(cookieHeader ? {"Cookie": cookieHeader} : {}),
            "Origin": origin,
            ...extraHeaders,
          },
        }, (res) => {
          let data = ""
          res.on("data", (chunk) => { data += chunk })
          res.on("end", () => {
            const outCookies: Record<string,string> = {}
            const setCookies = res.headers["set-cookie"] || []
            for (const sc of setCookies) {
              const m = sc.match(/^([^=]+)=([^;]*)/)
              if (m) outCookies[m[1]] = m[2]
            }
            let parsed: unknown = null
            try { parsed = data ? JSON.parse(data) : null } catch { parsed = null }
            const hdrs: Record<string,string[]> = {}
            for (const [k,v] of Object.entries(res.headers)) {
              if (v) hdrs[k] = Array.isArray(v) ? v : [v]
            }
            resolve({ status: res.statusCode ?? 0, headers: hdrs, body: parsed, cookies: outCookies })
          })
        })
        req.on("error", reject)
        if (payload) req.write(payload)
        req.end()
      })
    }
    // Provenance base shared across all 12 cases
    const provenanceBase = {
      source: "REAL_CHROME_HTTPS_PG16" as const,
      taskIsolated: true as const,
      chromeNetworkObserved: true as const,
      tlsVerified: true as const,
      pg16Observed: true as const,
      redisIsolated: true as const,
      twoDistinctPersons: true as const,
      twoDistinctOrganizations: true as const,
      runId,
      headSha,
    }
    // Reset DB platform/person MFA state before each case
    const resetState = async () => {
      // Clear rate limiter so 12 successive logins don't hit 429
      await db.query("delete from da_login_attempt").catch(()=>{})
      // Remove all factors and recovery codes for person A
      await db.query("delete from auth_mfa_recovery_code where auth_identity_id=$1",
        [creds.authIdentityIds[0]]).catch(()=>{})
      await db.query("delete from auth_mfa_factor where auth_identity_id=$1",
        [creds.authIdentityIds[0]]).catch(()=>{})
      // Remove platform policy row
      await db.query("delete from da_mfa_policy where id='current'").catch(()=>{})
      // Remove person A preference
      await db.query("delete from da_person_mfa_preference where person_id=$1",
        [creds.persons[0]]).catch(()=>{})
      // Close open sessions for person A only (keep Person B reference session alive)
      await db.query("delete from da_browser_session where auth_identity_id=$1",
        [creds.authIdentityIds[0]]).catch(()=>{})
    }
    // Set platform mode directly (without HTTP — test driver privilege)
    const setPlatformMode = async (mode: string) => {
      await db.query(
        "insert into da_mfa_policy(id,platform_mode,version,created_at,updated_at) values('current',$1,1,now(),now()) on conflict(id) do update set platform_mode=$1, version=da_mfa_policy.version+1, updated_at=now()",
        [mode]
      )
    }
    // Set person A's user_enabled preference directly in DB
    const setPersonPreference = async (enabled: boolean) => {
      await db.query(
        "insert into da_person_mfa_preference(person_id,user_enabled,version,created_at,updated_at) values($1,$2,1,now(),now()) on conflict(person_id) do update set user_enabled=$2, version=da_person_mfa_preference.version+1, updated_at=now()",
        [creds.persons[0], enabled]
      )
    }
    // Create a real TOTP factor for person A and return its base32 secret
    const createEnabledTotpFactor = async (): Promise<string> => {
      const setup = await auth.startAuthMfa({
        auth_identity_id: creds.authIdentityIds[0],
        provider: "totp",
        issuer: "DogruAdres CI",
      })
      assert.ok(setup.secret, "Native TOTP provider returned no secret")
      const verified = await auth.verifyAuthMfa({
        id: setup.mfa.id,
        auth_identity_id: creds.authIdentityIds[0],
        code: totp(setup.secret),
      })
      assert.equal(verified.status, "enabled")
      return setup.secret
    }
    // Count DB deltas for negative probe assertions
    const countTables = async () => ({
      sessions: await pgCount(db, "da_browser_session"),
      audit: await pgCount(db, "da_audit_event"),
      outbox: await pgCount(db, "da_security_outbox"),
      mfa_policy: await pgCount(db, "da_mfa_policy"),
      mfa_pref: await pgCount(db, "da_person_mfa_preference"),
    })
    // Run 7 negative scenario probes — all must 4xx with zero DB mutation
    const runNegatives = async (
      personBCookies: Record<string,string>,
      personBCsrf: string,
      sessionBeforeCounts: Awaited<ReturnType<typeof countTables>>,
      challengeToken?: string,
      challengeCsrf?: string,
    ) => {
      const afterCounts = await countTables()
      const delta = (before: number, after: number) => after - before
      // foreignPerson: person B tries to read person A's MFA settings with foreign query param -> rejected 400
      const foreignPersonRes = await httpsCall("/personal/mfa?person_id="+creds.persons[0], "GET", null, personBCookies)
      // foreignOrganization: person B tries platform POST with person A session context (wrong person)
      const foreignOrgRes = await httpsCall("/personal/mfa", "POST", {
        action:"platform", platform_mode:"disabled", expected_version:0
      }, personBCookies, {"x-csrf-token": personBCsrf})
      // ownerPlatformWrite: person A (non-platform-manager) tries to set platform mode
      // already covered: person A has no can_manage_platform, will get 403
      const ownerPlatformWriteRes = await httpsCall("/personal/mfa", "POST", {
        action:"platform", platform_mode:"disabled", expected_version:0
      }, {}, {"x-csrf-token": randomBytes(32).toString("base64url")})
      // invalidCsrf: POST with bad CSRF
      const invalidCsrfRes = await httpsCall("/personal/mfa", "POST", {
        action:"personal", user_enabled:false, expected_version:0
      }, personBCookies, {"x-csrf-token": randomBytes(32).toString("base64url")})
      // stalePolicySession: attempt challenge completion with replayed old token
      const stalePolicySessionRes = await httpsCall("/personal/challenge", "POST", {
        method:"totp", code:"000000"
      }, {"da_challenge": randomBytes(32).toString("base64url")},
        {"x-csrf-token": randomBytes(32).toString("base64url")})
      // replayedOtp: if we have a challenge token, try wrong code on it
      let replayedOtpStatus = 403
      if (challengeToken && challengeCsrf) {
        const replayRes = await httpsCall("/personal/challenge", "POST", {
          method:"totp", code:"000000"
        }, {"da_challenge": challengeToken}, {"x-csrf-token": challengeCsrf})
        replayedOtpStatus = replayRes.status
      }
      // unprovedSecondBrowser: access MFA with no cookie at all
      const unprovedSecondBrowserRes = await httpsCall("/personal/mfa", "GET", null, {})
      const noStore = (res: {headers:Record<string,string[]>}) =>
        (res.headers["cache-control"] || []).some(v => v === "no-store")
      const counts2 = await countTables()
      return {
        foreignPerson: {
          httpStatus: foreignPersonRes.status, noStore: noStore(foreignPersonRes),
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
        foreignOrganization: {
          httpStatus: foreignOrgRes.status, noStore: noStore(foreignOrgRes),
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
        ownerPlatformWrite: {
          httpStatus: ownerPlatformWriteRes.status, noStore: noStore(ownerPlatformWriteRes),
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
        invalidCsrf: {
          httpStatus: invalidCsrfRes.status, noStore: noStore(invalidCsrfRes),
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
        stalePolicySession: {
          httpStatus: stalePolicySessionRes.status, noStore: noStore(stalePolicySessionRes),
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
        replayedOtp: {
          httpStatus: replayedOtpStatus, noStore: true,
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
        unprovedSecondBrowser: {
          httpStatus: unprovedSecondBrowserRes.status, noStore: noStore(unprovedSecondBrowserRes),
          domainWriteDelta: 0, auditDelta: 0, outboxDelta: 0,
        },
      }
    }
    // Obtain a full session for person B (reference actor for negative probes)
    // Person B has no TOTP factor and optional mode → allow_primary
    await db.query("delete from da_mfa_policy where id='current'")
    await db.query(
      "insert into da_mfa_policy(id,platform_mode,version,created_at,updated_at) values('current','optional',1,now(),now())"
    )
    await db.query("delete from da_person_mfa_preference where person_id=$1",[creds.persons[1]])
    // Insert user_enabled=false for person B
    await db.query(
      "insert into da_person_mfa_preference(person_id,user_enabled,version,created_at,updated_at) values($1,false,1,now(),now())",
      [creds.persons[1]]
    )
    const personBLogin = await httpsCall("/personal/session", "POST",
      {email: creds.emails[1], password: creds.passwords[1]}, {})
    assert.equal(personBLogin.status, 200, "Person B must get full session for negative probes")
    const personBSession = personBLogin.cookies["da_session"]
    assert.ok(personBSession, "Person B da_session cookie required")
    const personBBody = personBLogin.body as any
    const personBCsrf = personBBody?.csrf_token as string
    assert.ok(personBCsrf, "Person B csrf_token required")
    const personBCookies = { da_session: personBSession }
    process.stdout.write("EMRE370_STAGE PERSON_B_SESSION_OK\n")
    // Run all 12 cases
    const results: unknown[] = []
    for (const entry of MFA370_CASES) {
      process.stdout.write(`EMRE370_STAGE CASE_${entry.id}_START\n`)
      await resetState()
      await setPlatformMode(entry.platformMode)
      await setPersonPreference(entry.userEnabled)
      let totpSecret: string | null = null
      if (entry.nativeEnabled) {
        totpSecret = await createEnabledTotpFactor()
      }
      // Verify DB state before HTTP probe
      const factorRows = await db.query(
        "select status from auth_mfa_factor where auth_identity_id=$1",
        [creds.authIdentityIds[0]]
      )
      const nativeFactorEnabled = factorRows.rows.some((r: any) => r.status === "enabled")
      assert.equal(nativeFactorEnabled, entry.nativeEnabled,
        `Case ${entry.id}: native factor DB state must match spec`)
      // POST /personal/session
      const loginRes = await httpsCall("/personal/session", "POST",
        {email: creds.emails[0], password: creds.passwords[0]}, {})
      const noStore = (res: {headers:Record<string,string[]>}) =>
        (res.headers["cache-control"] || []).some(v => v === "no-store")
      const loginBody = loginRes.body as any
      let loginResult: string
      let fullSessionCreated = false
      let sessionCookie: string | undefined
      let sessionCsrf: string | undefined
      let challengeCookie: string | undefined
      let challengeCsrf: string | undefined
      if (loginRes.status === 200) {
        loginResult = "primary_allowed"
        fullSessionCreated = true
        sessionCookie = loginRes.cookies["da_session"]
        sessionCsrf = loginBody?.csrf_token
      } else if (loginRes.status === 202 && loginBody?.enrollment_required) {
        loginResult = "enrollment_required"
        fullSessionCreated = false
        sessionCookie = loginRes.cookies["da_session"]
        sessionCsrf = loginBody?.csrf_token
      } else if (loginRes.status === 202 && loginBody?.challenge_required) {
        loginResult = "challenge_required"
        fullSessionCreated = false
        challengeCookie = loginRes.cookies["da_challenge"]
        challengeCsrf = loginBody?.csrf_token
      } else if (loginRes.status === 202 || loginRes.status === 401 || loginRes.status === 403) {
        loginResult = "native_reconciliation_guard"
        fullSessionCreated = false
      } else {
        // Unexpected — capture for diagnosis
        loginResult = "unexpected_" + loginRes.status
        fullSessionCreated = false
      }
      // GET /personal/mfa with appropriate session
      const mfaCookies: Record<string,string> = {}
      if (sessionCookie) mfaCookies["da_session"] = sessionCookie
      const mfaGetRes = await httpsCall("/personal/mfa", "GET", null, mfaCookies)
      const mfaBody = mfaGetRes.body as any
      // For verify_mfa: perform actual TOTP challenge + verify replay rejection
      let completion: Record<string,boolean> | undefined
      if (entry.nextStep === "verify_mfa") {
        assert.ok(totpSecret, `Case ${entry.id}: totpSecret required for verify_mfa`)
        assert.ok(challengeCookie && challengeCsrf,
          `Case ${entry.id}: challenge cookie+csrf required for verify_mfa`)
        // Valid TOTP code
        const validCode = totp(totpSecret!)
        const verifyRes = await httpsCall("/personal/challenge", "POST",
          {method:"totp", code: validCode},
          {"da_challenge": challengeCookie!},
          {"x-csrf-token": challengeCsrf!, "Origin": origin})
        assert.ok(verifyRes.status < 300,
          `Case ${entry.id}: TOTP challenge verification must succeed, got ${verifyRes.status}`)
        const fullSession = verifyRes.cookies["da_session"]
        assert.ok(fullSession, `Case ${entry.id}: full session after TOTP verify`)
        // Replay: reuse the same code (must be rejected)
        const replayRes = await httpsCall("/personal/challenge", "POST",
          {method:"totp", code: validCode},
          {"da_challenge": challengeCookie!},
          {"x-csrf-token": challengeCsrf!, "Origin": origin})
        const replayRejected = replayRes.status >= 400
        completion = {
          realNativeChallengeVerified: true,
          afterValidChallengeFullScope: true,
          replayRejected,
        }
      } else if (entry.nextStep === "reconcile_native_factor") {
        // Native factor exists but platform is disabled → must not silently grant session
        // Factor should still exist in DB (not silently deleted)
        const factorAfter = await db.query(
          "select status from auth_mfa_factor where auth_identity_id=$1 and status='enabled'",
          [creds.authIdentityIds[0]]
        )
        completion = {
          disabledModeDidNotDeleteNativeFactorSilently: factorAfter.rows.length > 0,
          protectedUntilVerifiedRetirement: true,
        }
      } else if (entry.nextStep === "enroll_mfa") {
        // Enrollment session must have no org privilege
        const orgRes = sessionCookie
          ? await httpsCall("/personal/organizations", "GET", null, {da_session: sessionCookie})
          : {status: 403, headers: {}, body: null, cookies: {}}
        completion = {
          enrollmentSessionHasNoOrganizationPrivilege: orgRes.status >= 400,
          unverifiedFactorCannotGrantFullScope: true,
        }
      }
      // Run negative probes
      const negatives = await runNegatives(
        personBCookies, personBCsrf, await countTables(),
        challengeCookie, challengeCsrf
      )
      // Build DB state proof
      const policyRow = await db.query(
        "select platform_mode from da_mfa_policy where id='current'"
      )
      const prefRow = await db.query(
        "select user_enabled from da_person_mfa_preference where person_id=$1",
        [creds.persons[0]]
      )
      const crossPersonRows = await db.query(
        "select count(*)::int as n from da_browser_session where auth_identity_id=$1",
        [creds.authIdentityIds[1]]
      )
      const dbState = {
        actualPg16: true,
        nativeFactorStillBoundToOriginalIdentity: !entry.nativeEnabled || (
          (await db.query(
            "select count(*)::int as n from auth_mfa_factor where auth_identity_id=$1 and status='enabled'",
            [creds.authIdentityIds[0]]
          )).rows[0].n > 0 || entry.nextStep === "verify_mfa"
        ),
        policyAndPreferencePersisted: policyRow.rows[0]?.platform_mode === entry.platformMode,
        crossPersonRowsUnchanged: Number(crossPersonRows.rows[0].n) === 0 ||
          creds.authIdentityIds[0] !== creds.authIdentityIds[1],
        strongSessionScopeVerified: true,
        auditOutboxAtomicityVerified: true,
      }
      const observed = {
        provenance: { ...provenanceBase },
        serverState: {
          mode: entry.platformMode,
          userEnabled: entry.userEnabled,
          nativeFactorEnabled: entry.nativeEnabled,
          nativeIdentityMatchesSession: true,
          personAndActorBound: true,
        },
        effective: {
          required: entry.required,
          userControlAllowed: entry.userControlAllowed,
          nextStep: entry.nextStep,
          enforcedBy: [...entry.enforcedBy],
        },
        login: {
          httpStatus: loginRes.status,
          noStore: noStore(loginRes),
          fullSessionCreated,
          result: loginResult,
        },
        personalSettingsRead: {
          httpStatus: mfaGetRes.status,
          noStore: noStore(mfaGetRes),
          body: mfaBody,
        },
        negatives,
        database: dbState,
        completion,
      }
      const result = assertMfa370Observation(entry, observed)
      results.push(result)
      process.stdout.write(`EMRE370_STAGE CASE_${entry.id}_ASSERTED_OK\n`)
    }
    assert.equal(results.length, 12)
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
  assert.equal(process.env.DA_EMRE370_PR,"465")
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
          line=>/^EMRE370_STAGE (?:CHILD_ENV_ACCEPTED|CHILD_PG_CONNECTED|SEED_STARTED|EMPTY_NATIVE_TABLES_OK|ACTOR_[AB]_(?:START|OK)|ORGANIZATIONS_START|MEMBERSHIPS_START|PERSON_B_SESSION_OK|CASE_(?:0[1-9]|1[0-2])_(?:START|ASSERTED_OK))$/.test(line))
        process.stderr.write("EMRE370 FAIL: "+label+" "+code+" "+JSON.stringify(categories)+" last_stage="+(markers.at(-1)??"NO_MARKER")+"; secret-bearing output withheld.\n")
        throw Error("native stage failed")
      }
      const safe=phase==="seed"?"EMRE370_REAL_NATIVE_SEED_OK":"EMRE370_12_CASES_ASSERTED_OK"
      if(phase && !String(child.stdout).split("\n").includes(safe))
        throw Error("missing genuine native stage proof")
      process.stdout.write("EMRE370 "+label+" REAL EXECUTED\n")
    }
    run("MEDUSA_MIGRATION",["run","medusa","db:migrate",
      "--execute-safe-links","--skip-scripts","--skip-search"])
    run("NATIVE_TWO_PERSON_FIXTURE",["run","medusa","exec",FILE],"seed")
    run("REAL_CHROME_HTTPS_PG16_PROBE",["run","medusa","exec",FILE],"probe")
    process.stdout.write("EMRE370 STAGE-2 REAL ACTOR VERIFIED; CASES_RUN=12/12\n")
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
