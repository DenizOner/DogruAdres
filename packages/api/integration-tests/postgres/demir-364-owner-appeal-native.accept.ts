/**
 * #364 r9 - task-owned standalone B22-06 real native Chrome/HTTPS/PG16 acceptance.
 * No B22 shared wrapper, Cart, OrderGroup, Order, payment or external SMTP.
 * FAIL closed on a missing native actor, deadline, permission or database.
 * Test-only synthetic accounts and ephemeral GH-hosted PostgreSQL 16.
 */
import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join,dirname} from "node:path"
import {createRequire} from "node:module"
import {createServer as tlsServer} from "node:https"
import {createServer as plainServer} from "node:http"
import {Client} from "@medusajs/framework/pg"
import {approveSellerWorkflow} from "@mercurjs/core/workflows"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {B06Chrome} from "./b06-ui-browser"
import {otp} from "./b19-browser"

const testPath="./integration-tests/postgres/demir-364-owner-appeal-native.accept.ts"
const adminUrl=new URL(process.env.PG_MFA_TEST_URL??"postgres://invalid/invalid")
const sentinel=process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1"
const ci=process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true"&&
  process.env.GITHUB_EVENT_NAME==="pull_request"&&
  process.env.GITHUB_REPOSITORY==="DenizOner/DogruAdres"&&
  process.env.DEMIR_364_PR==="450"
function guardAdmin(){
  assert.ok(ci&&sentinel&&process.env.NODE_ENV!=="production"&&
    adminUrl.protocol==="postgres:"&&adminUrl.hostname==="127.0.0.1"&&
    adminUrl.port==="5432"&&adminUrl.username==="mfa_test"&&
    adminUrl.password==="ci-disposable-only-not-a-real-secret"&&
    adminUrl.pathname==="/mfa_ci_ephemeral",
    "REFUSED: Demir #364 native test requires own disposable PR PG16 service")
}
function guardNative(){
  guardAdmin()
  const dbName=process.env.PG_MFA_NATIVE_TEST_DATABASE??""
  const db=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  assert.ok(/^mfa_cli_ci_[a-f0-9]{16}$/.test(dbName)&&
    db.pathname==="/"+dbName&&db.hostname==="127.0.0.1"&&
    db.username==="mfa_test"&&db.password===adminUrl.password&&
    db.port==="5432"&&process.env.NODE_ENV==="test"&&
    process.env.DOGRUADRES_IDENTITY_ENABLED==="true",
    "REFUSED: native fixture cannot access a non-task database")
}
function marker(label:string){process.stdout.write(label+"\n")}
function child(args:string[],env:NodeJS.ProcessEnv,stage:string,timeout=210000){
  const task=spawnSync(process.execPath,args,{
    cwd:process.cwd(),env,timeout,encoding:"utf8",maxBuffer:1024*1024
  })
  if(task.error||task.status!==0){
    // Raw child output could contain ephemeral passwords, sessions and Owner reasons.
    // Emit ONLY our fixed step names and numeric line numbers from THIS own source.
    const text=String(task.stdout??"")+"\n"+String(task.stderr??"")
    const allowed=[
      "identities-ready","organizations-ready","member-native-ready","stores-ready","email-proof-ready",
      "https-ready","owner-browser-started","owner-strong-session",
      "member-link-started","member-link-verified",
      "staff-browser-started","staff-strong-session","staff-grant",
      "first-closure","staff-owner-denied","owner-privacy-read","foreign-org-denied",
      "mail-queued","mail-link-created","foreign-link-denied","csrf-link-denied",
      "owner-link-accepted","owner-link-replay","first-clock",
      "fc-get","fc-front","fc-select","fc-pause-wait","fc-choose","fc-appeal-wait","fc-refresh-click","fc-reason-wait","fc-form-eval","fc-input","fc-form-click","fc-status-wait","fc-appealed-get",
      "first-appeal","second-closure",
      "second-clock",
      "sc-update","sc-second-get","sc-staff-denied","sc-csrf-denied","sc-final-post","sc-staff-denied2","sc-select-alpha",
      "day11-request","day30-31","privacy-clean"
    ] as const
    const matched=[...text.matchAll(/STEP DEMIR364 scenario: ([a-z0-9-]+)/g)]
      .map(x=>x[1]).filter(x=>allowed.some(a=>a===x))
    const stageAt=matched.at(-1)??"none"
    const localFrames=[...text.matchAll(/(?:demir-364-owner-appeal-native\.accept\.ts|b06-ui-browser\.ts|native-verification-browser\.ts):(\d+)(?::(\d+))?/g)]
      .map(x=>({line:Number(x[1]),col:Number(x[2]??1)}))
      .filter(x=>Number.isSafeInteger(x.line)&&x.line>=1&&x.line<=2500&&
        Number.isSafeInteger(x.col)&&x.col>=1&&x.col<=300)
    const ownFrame=localFrames.at(-1)
    const safeLine=ownFrame?String(ownFrame.line)+":"+String(ownFrame.col):"unavailable"
    const safeErr=(text.match(/([A-Za-z]+Error):/)?.[1])??"unknown"
    throw Error("NATIVE_STAGE_FAIL "+stage+" exit="+String(task.status??"null")+
      " signal="+String(task.signal??"none")+
      " code="+String((task.error as NodeJS.ErrnoException|undefined)?.code??"none")+
      " checkpoint="+stageAt+" err="+safeErr+" own_source_line="+safeLine)
  }
  if(stage==="prepare")assert.ok(task.stdout?.includes("PASS DEMIR364 prepare"))
  if(stage==="activation")assert.ok(task.stdout?.includes("PASS B06 disposable native activation"))
  if(stage==="scenario")assert.ok(task.stdout?.includes("PASS DEMIR364 native Owner appeal"))
  marker("PASS DEMIR364 "+stage+" verified exact child marker")
}
async function driver(){
  guardAdmin()
  assert.equal(process.env.DEMIR_364_STAGE,"driver")
  const SQL=(globalThis as any).Bun?.SQL
  assert.equal(typeof SQL,"function","Bun PostgreSQL driver required")
  const dbName="mfa_cli_ci_"+randomBytes(8).toString("hex")
  const dbUrl=new URL(adminUrl)
  dbUrl.pathname="/"+dbName
  const credentials={
    DEMIR_364_EMAIL_A:"demir-a-"+randomBytes(8).toString("hex")+"@example.invalid",
    DEMIR_364_EMAIL_B:"demir-b-"+randomBytes(8).toString("hex")+"@example.invalid",
    DEMIR_364_PASSWORD_A:randomBytes(32).toString("base64url"),
    DEMIR_364_PASSWORD_B:randomBytes(32).toString("base64url")
  }
  const env:NodeJS.ProcessEnv={...process.env,...credentials,
    NODE_ENV:"test",DATABASE_URL:dbUrl.toString(),
    PG_MFA_NATIVE_TEST_DATABASE:dbName,
    REDIS_URL:"redis://127.0.0.1:1",
    JWT_SECRET:randomBytes(48).toString("hex"),
    COOKIE_SECRET:randomBytes(48).toString("hex"),
    DOGRUADRES_INVITATION_SECRET:randomBytes(48).toString("hex"),
    DOGRUADRES_MFA_ENCRYPTION_KEY:randomBytes(48).toString("hex"),
    STORE_CORS:"http://127.0.0.1:19040",
    ADMIN_CORS:"http://127.0.0.1:19040",
    VENDOR_CORS:"http://127.0.0.1:19040",
    AUTH_CORS:"http://127.0.0.1:19040",
    FILE_BACKEND_URL:"http://127.0.0.1:19040/static",
    DOGRUADRES_IDENTITY_ENABLED:"true",
    DOGRUADRES_MFA_RUNTIME_ENABLED:"false",
    DOGRUADRES_MFA_SETTINGS_ENABLED:"false",
    DOGRUADRES_MFA_ENROLLMENT_ENABLED:"false",
    DOGRUADRES_FRONTDOOR_HOST:"127.0.0.1",
    DOGRUADRES_FRONTDOOR_PORT:"19041",
    DOGRUADRES_PUBLIC_ORIGIN:"http://127.0.0.1:19041",
    DOGRUADRES_PRIVATE_API:"http://127.0.0.1:19042",
    B06_EVIDENCE_DIR:join(process.env.RUNNER_TEMP??"/not-authorized",
      "demir-364-r1-evidence"),
    DEMIR_364_STAGE:"prepare"
  }
  const admin=new SQL(adminUrl.toString())
  let created=false
  let failed:unknown
  try{
    const meta=await admin.unsafe("select current_database() db,current_setting('server_version_num') ver")
    assert.equal(meta[0].db,"mfa_ci_ephemeral")
    assert.match(String(meta[0].ver),/^16\d{4}$/)
    const before=await admin.unsafe("select count(*)::int n from pg_database where datname=$1",[dbName])
    assert.equal(Number(before[0].n),0,"Refuse an existing database")
    await admin.unsafe('create database "'+dbName+'"')
    created=true
    // Only the newly created, uniquely named database is migrated.
    child(["run","medusa","db:migrate","--execute-safe-links","--skip-scripts","--skip-search"],
      {...env,DOGRUADRES_IDENTITY_ENABLED:"false"},"migration",210000)
    child(["run","medusa","exec",testPath],env,"prepare",210000)
    // Existing signed R1 helper requires zero other connections and two prepared identities.
    child([ "./integration-tests/postgres/b06-activation.pg16.ts"],
      {...env,DEMIR_364_STAGE:"activation"},"activation",120000)
    const runEnv={...env,DEMIR_364_STAGE:"scenario",
      DOGRUADRES_MFA_RUNTIME_ENABLED:"true",
      DOGRUADRES_MFA_SETTINGS_ENABLED:"true",
      DOGRUADRES_MFA_ENROLLMENT_ENABLED:"true"}
    child(["run","medusa","exec",testPath],runEnv,"scenario",480000)
    marker("PASS DEMIR364 driver: real native workflow completed on fresh PG16")
  }catch(error){failed=error}
  finally{
    try{
      if(created){
        const exists=await admin.unsafe("select count(*)::int n from pg_database where datname=$1",[dbName])
        assert.equal(Number(exists[0].n),1,"REFUSED: random DB identity changed")
        await admin.unsafe('drop database "'+dbName+'" with (force)')
        marker("CLEANUP DEMIR364: only exact random disposable database dropped")
      }
    }catch(cleanupError){
      failed=Error("FAIL DEMIR364: isolated database teardown did not complete; "+
        (cleanupError instanceof Error?cleanupError.name:"unknown"))
    }finally{await admin.close()}
  }
  if(failed)throw failed
}
type Db=(sql:string,params?:unknown[])=>Promise<any[]>
const browserGet=(browser:B06Chrome,path:string)=>browser.callFunction(
  "async function(path){const r=await fetch(path,{cache:'no-store'});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}}",path)
const browserPost=(browser:B06Chrome,path:string,payload:unknown,bad=false)=>
  browser.callFunction("async function(input){const v=JSON.parse(input);"+
    "const session=await(await fetch('/personal/session')).json();"+
    "const r=await fetch(v.path,{method:'POST',headers:{'content-type':'application/json',"+
    "'x-csrf-token':v.bad?'invalid':session.csrf_token},"+
    "body:JSON.stringify(v.body)});return {status:r.status,body:await r.json()}}",
    JSON.stringify({path,body:payload,bad}))
export default async function({container}:any){
  guardNative()
  const stage=process.env.DEMIR_364_STAGE
  assert.ok(stage==="prepare"||stage==="scenario","REFUSED: unknown native stage")
  const pg=new Client({connectionString:process.env.DATABASE_URL!})
  await pg.connect()
  const q:Db=async(sql,params=[]) => (await pg.query(sql,params)).rows
  const auth=container.resolve("auth")
  const users=container.resolve("user")
  const foundation=container.resolve("dogruadresAccess")
  const seller=container.resolve("seller")
  let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined
  let tls:ReturnType<typeof tlsServer>|undefined
  let privateServer:ReturnType<typeof plainServer>|undefined
  const browsers:B06Chrome[]=[]
  const temp=mkdtempSync(join(tmpdir(),"demir-364-native-"))
  const prior={origin:process.env.DOGRUADRES_PUBLIC_ORIGIN,
    privateOrigin:process.env.DOGRUADRES_PRIVATE_API,
    tlsCert:process.env.DOGRUADRES_TLS_CERT,tlsKey:process.env.DOGRUADRES_TLS_KEY,
    frontPort:process.env.DOGRUADRES_FRONTDOOR_PORT,
    taxDir:process.env.DOGRUADRES_TAX_CERTIFICATE_DIR}
  try{
    assert.equal((await q("select current_database() db"))[0].db,
      process.env.PG_MFA_NATIVE_TEST_DATABASE)
    const activated=(await q("select mfa_activated from da_session_policy where id='current'"))[0]
    assert.equal(activated?.mfa_activated,stage==="scenario")
    const actors=async(label:"A"|"B")=>{
      const email=process.env["DEMIR_364_EMAIL_"+label]!
      const password=process.env["DEMIR_364_PASSWORD_"+label]!
      assert.match(email,/^demir-[ab]-[a-f0-9]{16}@example.invalid$/)
      assert.ok(password.length>=40)
      const user=await users.createUsers({email})
      const reg=await auth.register("emailpass",{body:{email,password}})
      assert.ok(reg.success&&reg.authIdentity?.id)
      await auth.updateAuthIdentities({id:reg.authIdentity.id,
        app_metadata:{user_id:user.id}})
      const [person]=await foundation.createPeople([{}])
      await foundation.createActorMappings([{actor_type:"user",actor_id:user.id,
        person_id:person.id,created_by_actor_type:"user",created_by_actor_id:user.id}])
      await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
        [reg.authIdentity.id,person.id,user.id])
      return {email,password,person:person.id,actor:user.id,authId:reg.authIdentity.id}
    }
    if(stage==="prepare"){
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding","auth_mfa_factor"])
        assert.equal(Number((await q("select count(*)::int n from "+table))[0].n),0)
      await actors("A");await actors("B")
      marker("PASS DEMIR364 prepare: two isolated native Persons without MFA factors")
      return
    }
    const current=async(label:"A"|"B")=>{
      const email=process.env["DEMIR_364_EMAIL_"+label]!
      const password=process.env["DEMIR_364_PASSWORD_"+label]!
      const rows=await q("select b.person_id,u.id actor,b.auth_identity_id auth_id "+
        "from public.user u join da_login_binding b on b.actor_id=u.id "+
        "where u.email=$1 and b.actor_type='user' and b.revoked_at is null",[email])
      assert.equal(rows.length,1)
      return {email,password,person:rows[0].person_id as string,
        actor:rows[0].actor as string,authId:rows[0].auth_id as string}
    }
    const A=await current("A"),B=await current("B")
    marker("STEP DEMIR364 scenario: identities-ready")
    const nonce=randomBytes(8).toString("hex")
    const orgs=await foundation.createOrganizations([
      {name:"Demir Alpha "+nonce,status:"active"},
      {name:"Demir Beta "+nonce,status:"active"},
      {name:"Demir Gamma "+nonce,status:"active"}
    ])
    await foundation.createMemberships([
      {organization_id:orgs[0].id,person_id:A.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:orgs[1].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:orgs[2].id,person_id:A.person,role:"owner",status:"active",protected_owner:true}
    ])
    marker("STEP DEMIR364 scenario: organizations-ready")
    // The protected Owner's Store access needs a genuinely verified
    // Person→native Member delegation. A legal membership alone is NOT enough.
    const memberEmail="demir-owner-member-"+nonce+"@example.invalid"
    const [nativeMember]=await seller.createMembers([{email:memberEmail,is_active:true}])
    const memberPassword=randomBytes(32).toString("base64url")
    const memberRegistration=await auth.register("emailpass",{
      body:{email:memberEmail,password:memberPassword}
    })
    assert.ok(memberRegistration.success&&memberRegistration.authIdentity?.id)
    await auth.updateAuthIdentities({
      id:memberRegistration.authIdentity.id,
      app_metadata:{member_id:nativeMember.id}
    })
    const memberMfa=await auth.startAuthMfa({
      auth_identity_id:memberRegistration.authIdentity.id,
      provider:"totp",issuer:"Demir isolated Owner native SellerMember"
    })
    const memberEnrollCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({
      id:memberMfa.mfa.id,
      auth_identity_id:memberRegistration.authIdentity.id,
      code:otp(memberMfa.secret)
    })
    marker("STEP DEMIR364 scenario: member-native-ready")
    const nativeStores:string[]=[]
    for(let i=0;i<2;i++){
      const [s]=await seller.createSellers([{
        name:"Demir Native Gamma "+i+" "+nonce,
        email:"demir-seller-"+i+"-"+nonce+"@example.invalid",
        currency_code:"eur"
      }])
      await approveSellerWorkflow(container).run({input:{seller_id:s.id}})
      const confirmed=(await seller.listSellers({id:s.id}))[0]
      assert.equal(confirmed?.status,"open")
      assert.ok(confirmed?.approved_at)
      await seller.createSellerMembers([{
        seller_id:s.id,member_id:nativeMember.id,is_owner:true
      }])
      // Canonical legacy association is a fixture in a BRAND NEW task DB.
      // It does not grant ownership from a forged header or change production.
      const audit="daaud_"+randomBytes(16).toString("hex")
      await q("insert into da_audit_event "+
        "(id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,role_context,occurred_at) "+
        "values($1,$2,'user',$3,$4,'organization.store_association_approved',"+
        "'dogruadres-access','store-association',$5,'platform_staff',clock_timestamp())",
        [audit,B.person,B.actor,orgs[2].id,s.id])
      await q("insert into da_audit_outbox "+
        "(id,source_audit_event_id,source_module,envelope) values($1,$2,'dogruadres-access','{}'::jsonb)",
        ["daaob_"+randomBytes(16).toString("hex"),audit])
      await q("insert into da_organization_seller_ownership "+
        "(id,organization_id,seller_id,verification_audit_event_id,verified_at) "+
        "values($1,$2,$3,$4,clock_timestamp())",
        ["daown_"+randomBytes(16).toString("hex"),orgs[2].id,s.id,audit])
      nativeStores.push(s.id as string)
    }
    marker("STEP DEMIR364 scenario: stores-ready")
    const proof=await auth.requestAuthVerification({
      auth_identity_id:A.authId,entity_id:A.email,entity_type:"email",code_provider:"token"
    })
    assert.ok(typeof proof.code==="string")
    await auth.confirmAuthVerification({auth_identity_id:A.authId,
      code:proof.code,code_provider:"token"})
    marker("STEP DEMIR364 scenario: email-proof-ready")
    const crt=join(temp,"ca.pem"),key=join(temp,"key.pem")
    mkdirSync(join(temp,"tax"),{recursive:true,mode:0o700})
    process.env.DOGRUADRES_TAX_CERTIFICATE_DIR=join(temp,"tax")
    const openssl=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
      "-keyout",key,"-out",crt,"-days","1","-subj","/CN=Demir task CA",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-addext","basicConstraints=critical,CA:TRUE"],{stdio:"ignore",timeout:20000})
    assert.equal(openssl.status,0,"Task CA creation failed")
    const require=createRequire(join(process.cwd(),"package.json"))
    const mercurApi=join(dirname(require.resolve("@mercurjs/core")),"api")
    app=await createPersonalHttpApp(container,[mercurApi])
    privateServer=plainServer(app.app)
    await new Promise<void>((resolve,reject)=>{
      privateServer!.once("error",reject)
      privateServer!.listen(0,"127.0.0.1",resolve)
    })
    process.env.DOGRUADRES_PRIVATE_API=
      "http://127.0.0.1:"+(privateServer.address() as any).port
    tls=tlsServer({cert:readFileSync(crt),key:readFileSync(key),minVersion:"TLSv1.2"},
      app.app)
    await new Promise<void>((resolve,reject)=>{
      tls!.once("error",reject)
      tls!.listen(0,"127.0.0.1",resolve)
    })
    const origin="https://127.0.0.1:"+(tls.address() as any).port
    process.env.DOGRUADRES_PUBLIC_ORIGIN=origin
    process.env.DOGRUADRES_TLS_CERT=crt
    process.env.DOGRUADRES_TLS_KEY=key
    process.env.DOGRUADRES_FRONTDOOR_PORT=String((tls.address() as any).port)
    marker("STEP DEMIR364 scenario: https-ready")
    const owner=new B06Chrome(origin,"A"),staff=new B06Chrome(origin,"B")
    browsers.push(owner,staff)
    await owner.start(crt,45000)
    marker("STEP DEMIR364 scenario: owner-browser-started")
    await owner.login(A.email,A.password,A.person)
    marker("STEP DEMIR364 scenario: owner-strong-session")
    await owner.select(orgs[2].name,"owner")
    const ownerPreLink="/personal/store-platform-closing?"+
      new URLSearchParams({organization_id:orgs[2].id,
        seller_id:nativeStores[0]}).toString()
    assert.equal((await browserGet(owner,ownerPreLink)).status,403,
      "Legal Owner alone cannot bypass native Member linkage")
    await owner.input("#link-account input[name=email]",memberEmail)
    await owner.input("#link-account input[name=password]",memberPassword)
    await owner.click("#link-account button")
    await owner.wait("!document.getElementById('link-confirm').hidden")
    marker("STEP DEMIR364 scenario: member-link-started")
    assert.ok(Math.floor(Date.now()/30000)>memberEnrollCounter,
      "Secondary native MFA code must be newer than enrollment")
    await owner.input("#link-confirm input[name=code]",otp(memberMfa.secret))
    await owner.click("#link-confirm button")
    await owner.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verifiedMember=await q("select actor_id,proof_reference from da_verified_actor_binding "+
      "where person_id=$1 and actor_type='member' and revoked_at is null",[A.person])
    assert.equal(verifiedMember.length,1)
    assert.equal(verifiedMember[0].actor_id,nativeMember.id)
    assert.match(verifiedMember[0].proof_reference,/^dual-proof:/)
    const ownerLinked=await browserGet(owner,ownerPreLink)
    assert.equal(ownerLinked.status,200,
      "Native Member+Person dual MFA must unlock only own current approved Store")
    assert.equal(ownerLinked.body?.state,"none")
    marker("STEP DEMIR364 scenario: member-link-verified")
    await staff.start(crt,45000)
    marker("STEP DEMIR364 scenario: staff-browser-started")
    await staff.login(B.email,B.password,B.person)
    marker("STEP DEMIR364 scenario: staff-strong-session")
    const root="/personal/platform/store-closings"
    const ownerBase="/personal/store-platform-closing"
    const ownerUrl=(s:string)=>ownerBase+"?"+
      new URLSearchParams({organization_id:orgs[2].id,seller_id:s}).toString()
    const reason="B22 Demir isolated platform decision for synthetic Gamma Store"
    const payload=(s:string)=>({organization_id:orgs[2].id,seller_id:s,
      request_id:"dascp_"+randomBytes(16).toString("hex"),reason})
    const originalCount=Number((await q("select count(*)::int n from da_audit_event "+
      "where organization_id=$1 and resource='store-platform-closing'",
      [orgs[2].id]))[0].n)
    assert.equal((await browserGet(staff,root)).status,403,
      "Strong session without separate Staff grant must not manage closures")
    assert.equal((await browserPost(owner,root,payload(nativeStores[0]))).status,403)
    const grantId="da_staff_demir_"+nonce
    await q("insert into da_platform_staff_grant "+
      "(id,person_id,task,resource,granted_by_person_id,reason) "+
      "values($1,$2,'store.closing.manage','platform',$2,$3)",
      [grantId,B.person,"Synthetic Demir #364 independent strong Staff"])
    marker("STEP DEMIR364 scenario: staff-grant")
    assert.equal((await browserPost(staff,root,
      {...payload(nativeStores[0]),organization_id:orgs[1].id})).status,403)
    assert.equal((await browserPost(staff,root,payload(nativeStores[0]),true)).status,403)
    assert.equal(Number((await q("select count(*)::int n from da_audit_event "+
      "where organization_id=$1 and resource='store-platform-closing'",
      [orgs[2].id]))[0].n),originalCount)
    const close=async(s:string)=>{
      const p=payload(s)
      const response=await browserPost(staff,root,p)
      assert.equal(response.status,200,"Authorized strong Staff closure must succeed")
      assert.notEqual(response.body?.permanent_finalization_enabled,true,
        "Staff close response cannot authorize irreversible finalization")
      assert.equal((await browserPost(staff,root,{...p,request_id:
        "dascp_"+randomBytes(16).toString("hex")})).status,409,
        "Different request must not start a second closing")
      const sameReplay=await browserPost(staff,root,p)
      assert.equal(sameReplay.status,200,"Exact Staff request replay is idempotent")
      assert.equal(sameReplay.body?.replayed,true,
        "Real Staff replay must report no new closure")
      const rows=await q("select state,version from da_store_platform_closing where seller_id=$1",[s])
      assert.deepEqual(rows.map((x:any)=>({state:x.state,version:Number(x.version)})),
        [{state:"notification_unverified",version:1}])
      return p
    }
    await close(nativeStores[0])
    marker("STEP DEMIR364 scenario: first-closure")
    assert.equal((await browserGet(staff,ownerUrl(nativeStores[0]))).status,403)
    marker("STEP DEMIR364 scenario: staff-owner-denied")
    assert.equal((await browserGet(owner,ownerUrl(nativeStores[0]))).status,200)
    marker("STEP DEMIR364 scenario: owner-privacy-read")
    const forbidden=await browserGet(owner,ownerBase+"?"+
      new URLSearchParams({organization_id:orgs[0].id,seller_id:nativeStores[0]}))
    assert.equal(forbidden.status,403,"Wrong Owner Organization cannot read reason")
    marker("STEP DEMIR364 scenario: foreign-org-denied")
    const clock=async(s:string)=>{
      const emailToken=randomBytes(32).toString("hex")
      const digest=createHash("sha256").update(emailToken).digest("hex")
      const queued=await q("select person_id from da_store_platform_closing_email "+
        "where seller_id=$1 and person_id=$2",[s,A.person])
      assert.equal(queued.length,1,"Real closing must enqueue protected Owner")
      marker("STEP DEMIR364 scenario: mail-queued")
      await q("insert into da_store_platform_closing_email_link "+
        "(seller_id,person_id,attempt,token_sha256) values($1,$2,4,$3)",
        [s,A.person,digest])
      marker("STEP DEMIR364 scenario: mail-link-created")
      const link="/personal/store-platform-closing-email-visit"
      assert.equal((await browserPost(staff,link,{token:emailToken})).status,403)
      marker("STEP DEMIR364 scenario: foreign-link-denied")
      assert.equal((await browserPost(owner,link,{token:emailToken},true)).status,403)
      marker("STEP DEMIR364 scenario: csrf-link-denied")
      const confirmed=await browserPost(owner,link,{token:emailToken})
      assert.equal(confirmed.status,200)
      assert.equal(confirmed.body?.deadline_started,true)
      marker("STEP DEMIR364 scenario: owner-link-accepted")
      const replay=await browserPost(owner,link,{token:emailToken})
      assert.equal(replay.status,200)
      marker("STEP DEMIR364 scenario: owner-link-replay")
      const rows=await q("select deadline_started_at from da_store_platform_closing where seller_id=$1",[s])
      assert.equal(rows.length,1)
      const original=new Date(rows[0].deadline_started_at).toISOString()
      assert.equal(new Date((await q("select deadline_started_at from da_store_platform_closing where seller_id=$1",[s]))[0].deadline_started_at).toISOString(),original)
      assert.equal(Number((await q("select count(*)::int n from da_audit_event where target_id=$1 "+
        "and action='organization.store_platform_closing_deadline_started'",[s]))[0].n),1)
      return original
    }
    const start1=await clock(nativeStores[0])
    marker("STEP DEMIR364 scenario: first-clock")
    const first=await browserGet(owner,ownerUrl(nativeStores[0]))
    assert.equal(first.status,200)
    assert.equal(first.body?.first_appeal_open,true)
    assert.equal(first.body?.final_review_open,false)
    assert.equal(first.body?.permanent_finalization_enabled,false)
    assert.equal(new Date(first.body.first_appeal_until).getTime()-
      new Date(start1).getTime(),10*86400000)
    assert.equal(new Date(first.body.final_review_until).getTime()-
      new Date(start1).getTime(),30*86400000)
    marker("STEP DEMIR364 scenario: fc-get")
    // Real Chrome Owner UI is source-rendered; do not substitute a mocked DOM.
    await owner.send("Page.bringToFront")
    marker("STEP DEMIR364 scenario: fc-front")
    await owner.select(orgs[2].name,"owner")
    marker("STEP DEMIR364 scenario: fc-select")
    await owner.wait("!document.getElementById('store-owner-pause-panel').hidden")
    marker("STEP DEMIR364 scenario: fc-pause-wait")
    const chosen=await owner.callFunction("function(store){const e=document.querySelector("+
      "'#store-owner-pause-form select[name=seller_id]');if(!e)return false;"+
      "if(!Array.from(e.options).some(o=>o.value===store))return false;"+
      "e.value=store;e.dispatchEvent(new Event('change',{bubbles:true}));return e.value===store}",
      nativeStores[0])
    assert.equal(chosen,true,"Native approved store must be selectable in Owner UI")
    marker("STEP DEMIR364 scenario: fc-choose")
    await owner.wait("!document.getElementById('store-platform-appeal-panel').hidden")
    marker("STEP DEMIR364 scenario: fc-appeal-wait")
    await owner.click("#store-platform-appeal-refresh")
    marker("STEP DEMIR364 scenario: fc-refresh-click")
    await owner.wait("!document.getElementById('store-platform-appeal-panel').hidden")
    await owner.wait("document.getElementById('store-platform-appeal-reason').textContent.includes('"+reason+"')")
    marker("STEP DEMIR364 scenario: fc-reason-wait")
    assert.equal(await owner.eval("!document.querySelector('#store-platform-appeal-form button').disabled"),true)
    marker("STEP DEMIR364 scenario: fc-form-eval")
    await owner.input("#store-platform-appeal-form textarea[name=reason]",
      "Demir synthetic Owner dispute with current strong MFA")
    marker("STEP DEMIR364 scenario: fc-input")
    await owner.click("#store-platform-appeal-form button")
    marker("STEP DEMIR364 scenario: fc-form-click")
    await owner.wait("document.getElementById('store-platform-appeal-status').textContent.includes('İtiraz kaydedildi')")
    marker("STEP DEMIR364 scenario: fc-status-wait")
    assert.equal((await browserGet(owner,ownerUrl(nativeStores[0]))).body?.state,"appealed")
    marker("STEP DEMIR364 scenario: fc-appealed-get")
    marker("STEP DEMIR364 scenario: first-appeal")
    const firstAudit=await q("select e.id,x.id outbox from da_audit_event e "+
      "join da_audit_outbox x on x.source_audit_event_id=e.id "+
      "where e.target_id=$1 and e.action='organization.store_platform_closing_appealed'",
      [nativeStores[0]])
    assert.equal(firstAudit.length,1,"One immutable appeal audit/outbox")
    // Separate live Seller: no first appeal; stage two is checked with a
    // strictly synthetic clock, never actual waiting or a payment flow.
    await close(nativeStores[1])
    marker("STEP DEMIR364 scenario: second-closure")
    const start2=await clock(nativeStores[1])
    marker("STEP DEMIR364 scenario: second-clock")
    const day11=new Date(Date.now()-11*86400000).toISOString()
    const day11Audit="daaud_"+randomBytes(16).toString("hex")
    // Insert day11 audit event and update closing row; da_audit_event is append-only
    // (trigger da_audit_event_append_only_rows / 55000) so each clock shift inserts a
    // fresh audit row and updates the FK on da_store_platform_closing. The day30/31
    // boundary check runs BEFORE the final review POST to avoid violating the
    // da_store_platform_final_review_complete constraint (which applies only when
    // final_review_request_id IS NOT NULL). This isolated test DB is ephemeral; no
    // restore is needed after the final review is committed.
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,role_context,organization_id,
       action,module,resource,target_id,new_values,occurred_at)
      values ($1,$2,'user',$3,'owner',$4,
        'organization.store_platform_closing_deadline_started',
        'dogruadres-access','store-platform-closing',$5,$6::jsonb,$7::timestamptz)`,[
      day11Audit,A.person,A.actor,orgs[2].id,nativeStores[1],
      JSON.stringify({basis:"owner_delivery",deadline_started_at:day11}),day11])
    await q(`insert into da_audit_outbox
      (id,source_audit_event_id,source_module,envelope_version,envelope,status)
      values ($1,$2,'dogruadres-access',1,'{}'::jsonb,'pending')`,[
      "daaob_"+randomBytes(16).toString("hex"),day11Audit])
    await q("update da_store_platform_closing set deadline_started_at=$1::timestamptz, deadline_audit_event_id=$2 "+
      "where seller_id=$3",
      [day11,day11Audit,nativeStores[1]])
    marker("STEP DEMIR364 scenario: sc-update")
    const second=await browserGet(owner,ownerUrl(nativeStores[1]))
    assert.equal(second.status,200)
    assert.equal(second.body?.first_appeal_open,false)
    assert.equal(second.body?.final_review_open,true)
    marker("STEP DEMIR364 scenario: sc-second-get")
    const finalPayload={organization_id:orgs[2].id,seller_id:nativeStores[1],
      request_id:"dasfr_"+randomBytes(16).toString("hex"),
      expected_version:1,reason:"Demir separate second-stage independent review request"}
    assert.equal((await browserPost(staff,
      "/personal/store-platform-closing-final-review",finalPayload)).status,403)
    marker("STEP DEMIR364 scenario: sc-staff-denied")
    assert.equal((await browserPost(owner,
      "/personal/store-platform-closing-final-review",finalPayload,true)).status,403)
    marker("STEP DEMIR364 scenario: sc-csrf-denied")
    // Verify day30/31 boundary BEFORE the final review POST. When
    // final_review_request_id IS NULL the da_store_platform_final_review_complete
    // constraint does not apply, so the deadline shift is safe.
    for(const day of [30,31]){
      const dayTime=new Date(Date.now()-day*86400000).toISOString()
      const dayTimeAudit="daaud_"+randomBytes(16).toString("hex")
      await q(`insert into da_audit_event
        (id,actor_person_id,actor_type,actor_id,role_context,organization_id,
         action,module,resource,target_id,new_values,occurred_at)
        values ($1,$2,'user',$3,'owner',$4,
          'organization.store_platform_closing_deadline_started',
          'dogruadres-access','store-platform-closing',$5,$6::jsonb,$7::timestamptz)`,[
        dayTimeAudit,A.person,A.actor,orgs[2].id,nativeStores[1],
        JSON.stringify({basis:"owner_delivery",deadline_started_at:dayTime}),dayTime])
      await q(`insert into da_audit_outbox
        (id,source_audit_event_id,source_module,envelope_version,envelope,status)
        values ($1,$2,'dogruadres-access',1,'{}'::jsonb,'pending')`,[
        "daaob_"+randomBytes(16).toString("hex"),dayTimeAudit])
      await q("update da_store_platform_closing "+
        "set deadline_started_at=$1::timestamptz, deadline_audit_event_id=$2 where seller_id=$3",
        [dayTime,dayTimeAudit,nativeStores[1]])
      const expired=await browserGet(owner,ownerUrl(nativeStores[1]))
      assert.equal(expired.status,200)
      assert.equal(expired.body?.permanent_finalization_enabled,false)
      assert.equal(expired.body?.first_appeal_open,false)
    }
    marker("STEP DEMIR364 scenario: day30-31")
    // Restore to day11Audit so the final review POST falls in second_window (240h–720h).
    // The ephemeral test DB is dropped after the run; no further rollback is needed.
    await q("update da_store_platform_closing set deadline_started_at=$1::timestamptz, deadline_audit_event_id=$2 "+
      "where seller_id=$3",[day11,day11Audit,nativeStores[1]])
    const final=await browserPost(owner,
      "/personal/store-platform-closing-final-review",finalPayload)
    assert.equal(final.status,200,"Day11 real Owner HTTPS second-stage request")
    assert.equal(final.body.final_review_requested,true)
    assert.equal(final.body.permanent_finalization_enabled,false)
    marker("STEP DEMIR364 scenario: sc-final-post")
    marker("STEP DEMIR364 scenario: day11-request")
    const finalAudit=await q("select e.id,x.id outbox from da_audit_event e "+
      "join da_audit_outbox x on x.source_audit_event_id=e.id "+
      "where e.target_id=$1 and e.action='organization.store_platform_closing_final_review_requested'",
      [nativeStores[1]])
    assert.equal(finalAudit.length,1,"One second-stage audit/outbox")
    const denied=await browserGet(staff,ownerUrl(nativeStores[0]))
    assert.equal(denied.status,403)
    marker("STEP DEMIR364 scenario: sc-staff-denied2")
    await owner.select(orgs[0].name,"owner")
    marker("STEP DEMIR364 scenario: sc-select-alpha")
    await owner.wait("document.getElementById('store-platform-appeal-reason').textContent===''")
    assert.equal(await owner.eval("document.body.textContent.includes("+
      JSON.stringify(reason)+")"),false,
      "Private Gamma closure reason must vanish after Org change")
    const closingAudit=await q("select e.id,x.id outbox from da_audit_event e "+
      "join da_audit_outbox x on x.source_audit_event_id=e.id "+
      "where e.organization_id=$1 and e.action='organization.store_platform_closing_started'",
      [orgs[2].id])
    assert.equal(closingAudit.length,2)
    const orders=Number((await q('select count(*)::int n from "order"'))[0].n)
    const groups=Number((await q("select count(*)::int n from order_group"))[0].n)
    const carts=Number((await q("select count(*)::int n from cart"))[0].n)
    assert.equal(orders,0);assert.equal(groups,0);assert.equal(carts,0)
    marker("STEP DEMIR364 scenario: privacy-clean")
    marker("PASS DEMIR364 native Owner appeal: two Organizations, strong Staff/Owner Chrome HTTPS, first appeal, synthetic day11/day30/day31, foreign/CSRF, PG16 audit/outbox; zero Cart/Order/OrderGroup/payment and finalizer disabled")
    marker("NOT TESTED DEMIR364: external mailbox delivery, real 30-day wait, independent review, full WCAG axe, concurrent replay race")
  }finally{
    for(const browser of browsers.reverse()){
      try{await browser.close()}catch{process.exitCode=1}
    }
    if(tls)await new Promise<void>((resolve,reject)=>tls!.close(e=>e?reject(e):resolve()))
    if(privateServer)await new Promise<void>((resolve,reject)=>privateServer!.close(e=>e?reject(e):resolve()))
    await app?.close()
    for(const [name,value] of Object.entries({
      DOGRUADRES_PUBLIC_ORIGIN:prior.origin,DOGRUADRES_PRIVATE_API:prior.privateOrigin,
      DOGRUADRES_TLS_CERT:prior.tlsCert,DOGRUADRES_TLS_KEY:prior.tlsKey,
      DOGRUADRES_FRONTDOOR_PORT:prior.frontPort,
      DOGRUADRES_TAX_CERTIFICATE_DIR:prior.taxDir
    })){
      if(value===undefined)delete process.env[name];else process.env[name]=value
    }
    await pg.end()
    rmSync(temp,{recursive:true,force:true})
  }
}
if(process.env.DEMIR_364_STAGE==="driver")
  driver().catch(error=>{
    // Only fixed error classes/stages, never temporary identities or tokens.
    console.error("FAIL DEMIR364 native isolated driver:",
      error instanceof Error?error.message.split("\n")[0]:"unknown")
    process.exitCode=1
  })
