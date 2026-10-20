import assert from "node:assert/strict"
import {test} from "node:test"
import {readFileSync} from "node:fs"
import {createHmac,createHash,createDecipheriv,randomUUID} from "node:crypto"
import {spawnSync} from "node:child_process"
const base=process.env.M0_TEST_ORIGIN
const requestOrigin=process.env.M0_REQUEST_ORIGIN??base
const evidence=process.env.M0_TEST_EVIDENCE
if(base!=="http://127.0.0.1:19100" || !evidence)throw new Error("Explicit isolated origin/evidence required")
const credentials=JSON.parse(readFileSync(evidence+"/login.private.json","utf8"))
const secret=JSON.parse(readFileSync(evidence+"/totp.private.json","utf8")).secret
// This suite deliberately revokes its XYZ membership.  Allocate its own
// synthetic Organization so a prior successful run never changes a later
// run's preconditions or makes revocation evidence ambiguous.
const xyz=`daorg_m0ssi_xyz_${randomUUID().replaceAll("-","")}`
function sql(query){const r=spawnSync("docker",["exec","dogruadres-m0ssi-20261020-a7f1-pg","psql","-U","m0ssi_user","-d","m0ssi_a7f1","-X","-At","-v","ON_ERROR_STOP=1","-c",query],{encoding:"utf8"});assert.equal(r.status,0,"isolated SQL exit");return r.stdout.trim()}
assert.equal(sql("select current_database()"),"m0ssi_a7f1")
assert.equal((await fetch(base+"/personal",{signal:AbortSignal.timeout(20000)})).status,200,"startup must finish before fixture mutations")
assert.equal(sql("select count(*) from da_platform_staff_grant where person_id='daprs_m0ssi_a7f1' and revoked_at is null"),"0","fresh staff-negative fixture required")
sql(`insert into da_organization(id,name,status) values ('${xyz}','HTTP per-run XYZ synthetic','active')`)
sql(`insert into da_organization_membership(id,organization_id,person_id,role,status,protected_owner) values ('damem_${randomUUID().replaceAll("-","")}','${xyz}','daprs_m0ssi_a7f1','owner','active',true)`)
assert.equal(sql(`select status from da_organization_membership where organization_id='${xyz}'`),"active","fresh revocable Organization fixture required")
function totp(){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";for(const c of secret.toUpperCase().replace(/=+$/,""))bits+=alphabet.indexOf(c).toString(2).padStart(5,"0");const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac("sha1",key).update(counter).digest();return ((h.readUInt32BE(h[h.length-1]&15)&0x7fffffff)%1000000).toString().padStart(6,"0")}
async function call(path,{method="GET",body,cookie,csrf,bearer,origin=requestOrigin}={}){return fetch(base+path,{method,headers:{Origin:origin,...(body?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{"x-csrf-token":csrf}:{}),...(bearer?{Authorization:"Bearer "+bearer}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)})}
async function login(){const r=await call("/personal/session",{method:"POST",body:credentials});assert.equal(r.status,202,"MFA required, no active session before challenge");const pending=(r.headers.get("set-cookie")??"").split(";")[0];const data=await r.json();const v=await call("/personal/challenge",{method:"POST",cookie:pending,csrf:data.csrf_token,body:{code:totp()}});assert.equal(v.status,200,"framework-verified MFA");const cookies=v.headers.getSetCookie();const sessionCookie=cookies.find(x=>x.startsWith("da_session="));assert.match(sessionCookie,/HttpOnly/i);assert.match(sessionCookie,/SameSite=Strict/i);const cookie=sessionCookie.split(";")[0];const out=await v.json();assert.deepEqual(Object.keys(out),["csrf_token"],"no actor credential in browser response");return{cookie,csrf:out.csrf_token}}
function nativeFor(cookie){
  const hash=createHash("sha256").update(cookie.slice("da_session=".length)).digest("hex")
  const [iv,tag,value]=sql(`select ciphertext from da_native_credential where session_id='${hash}' and retired_at is null`).split(".").map(p=>Buffer.from(p,"base64url"))
  const d=createDecipheriv("aes-256-gcm",createHash("sha256").update("native-credential:"+process.env.COOKIE_SECRET).digest(),iv);d.setAuthTag(tag)
  return Buffer.concat([d.update(value),d.final()]).toString("utf8")
}
test("real isolated PostgreSQL + authenticated HTTP vertical slice",async t=>{
  let s
  await t.test("anonymous and login-CSRF rejection",async()=>{assert.equal((await call("/personal/session")).status,401);assert.equal((await call("/personal/session",{method:"POST",origin:"https://attacker.invalid",body:credentials})).status,403)})
  await t.test("strict credentials reject actor/Person injection",async()=>assert.equal((await call("/personal/session",{method:"POST",body:{...credentials,person_id:"daprs_fake"}})).status,400))
  await t.test("unknown plugin, hooks and cloud writers are closed; public metadata remains readable",async()=>{
    for(const path of ["/plugin/private","/cloud/auth/users","/hooks/private","/personal-future","/personal/private"])
      assert.equal((await call(path,{method:"POST"})).status,401)
    assert.equal((await call("/cloud/auth")).status,200)
  })
  await t.test("public Store requires a publishable key; machine read requires a current explicit scope",async()=>{
    assert.equal((await call("/store/regions")).status,400)
    const pk=sql("select token from api_key where type='publishable' and deleted_at is null limit 1")
    assert.ok(pk);assert.equal((await fetch(base+"/store/regions",{headers:{"x-publishable-api-key":pk}})).status,200)
    const {token}=JSON.parse(readFileSync(evidence+"/machine.private.json","utf8"))
    const basic="Basic "+Buffer.from(token+":").toString("base64")
    const machine=async(method="GET")=>fetch(base+"/admin/api-keys",{method,headers:{Authorization:basic,"Content-Type":"application/json"},...(method==="POST"?{body:'{"title":"must deny","type":"secret"}'}:{})})
    assert.equal((await machine()).status,403)
    const key=sql("select id from api_key where title='M0 isolated machine read' and deleted_at is null")
    assert.match(key,/^apk_[A-Za-z0-9]+$/);const grant=randomUUID()
    sql(`insert into da_machine_grant(id,api_key_id,method,resource) values ('${grant}','${key}','GET','/admin/api-keys')`)
    assert.equal((await machine()).status,200);assert.equal((await machine("POST")).status,401)
    sql(`update da_machine_grant set revoked_at=clock_timestamp() where id='${grant}'`)
    assert.equal((await machine()).status,403)
  })
  await t.test("one password and genuine MFA create canonical Person session",async()=>{s=await login();const r=await call("/personal/session",s);assert.equal(r.status,200);assert.equal((await r.json()).person_id,"daprs_m0ssi_a7f1")})
  await t.test("XYZ/ABC concurrent request contexts remain independent",async()=>{assert.ok(s);const responses=await Promise.all([xyz,"daorg_m0ssi_abc"].map(id=>call("/personal/organizations?id="+id,s)));assert.deepEqual(await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return(await r.json()).organizations[0].id})),[xyz,"daorg_m0ssi_abc"])})
  await t.test("unrelated Organization denied",async()=>assert.equal((await call("/personal/organizations?id=daorg_m0ssi_denied",s)).status,403))
  await t.test("framework user without grant denied even after MFA",async()=>assert.equal((await call("/personal/platform",s)).status,403))
  await t.test("explicit grant permits audited provisioning, rollback and revocation",async()=>{
    assert.ok(s);const grant=randomUUID()
    sql(`insert into da_platform_staff_grant(id,person_id,task,resource,granted_by_person_id,reason) values ('${grant}','daprs_m0ssi_a7f1','organization.provision','platform','daprs_m0ssi_a7f1','isolated synthetic fixture')`)
    assert.equal((await call("/personal/platform",s)).status,200)
    const fresh=sql("select id from public.user where email='m0ssi-rollback-a7f1@example.invalid'")
    assert.match(fresh,/^user_[A-Za-z0-9]+$/)
    const counts=()=>sql("select (select count(*) from da_person)||','||(select count(*) from da_actor_mapping)||','||(select count(*) from da_organization)||','||(select count(*) from da_audit_event)||','||(select count(*) from da_security_outbox)")
    const before=counts()
    const rejected=await call("/personal/platform",{...s,method:"POST",body:{name:"must rollback",initial_owners:[{actor_type:"user",actor_id:fresh},{actor_type:"user",actor_id:fresh}]}})
    assert.equal(rejected.status,400)
    assert.equal(counts(),before,"new Person/mapping generated before duplicate detection must roll back")
    const owners=sql("select id from public.user where email in ('m0ssi-a7f1@example.invalid','m0ssi-adversary-a7f1@example.invalid') order by id").split("\n").map(id=>({actor_type:"user",actor_id:id}))
    assert.equal(owners.length,2)
    const provision=await call("/personal/platform",{...s,method:"POST",body:{name:"HTTP synthetic staff provisioning",initial_owners:owners}})
    assert.equal(provision.status,201);const {organization}=await provision.json();assert.match(organization.id,/^daorg_[A-Za-z0-9]+$/)
    assert.equal(sql(`select count(*) from da_audit_event where organization_id='${organization.id}'`),"3")
    assert.equal(sql(`select count(*) from da_security_outbox o join da_audit_event a on a.id=o.audit_event_id where a.organization_id='${organization.id}'`),"3")
    const audits=JSON.parse(sql(`select json_agg(json_build_object('actor_person_id',actor_person_id,'actor_type',actor_type,'actor_id',actor_id,'role_context',role_context,'organization_id',organization_id,'action',action,'resource',resource,'target_id',target_id,'values',new_values)) from da_audit_event where organization_id='${organization.id}'`))
    const provisioner=sql("select actor_id from da_login_binding where person_id='daprs_m0ssi_a7f1'")
    for(const a of audits){assert.equal(a.actor_person_id,"daprs_m0ssi_a7f1");assert.equal(a.actor_type,"user");assert.equal(a.actor_id,provisioner);assert.equal(a.role_context,"platform_staff");assert.equal(a.organization_id,organization.id);assert.equal(a.values.staff_grant_id,grant);assert.equal(a.values.staff_task,"organization.provision");assert.equal(a.values.staff_resource,"platform")}
    assert.deepEqual(audits.map(a=>a.action).sort(),["organization.owner_assigned","organization.owner_assigned","organization.provisioned"])
    assert.equal(sql(`select count(*) from da_audit_event a join da_organization_membership m on m.id=a.target_id and m.organization_id=a.organization_id and m.person_id=a.new_values->>'person_id' where a.organization_id='${organization.id}' and a.action='organization.owner_assigned'`),"2")
    sql(`update da_platform_staff_grant set revoked_at=clock_timestamp() where id='${grant}'`)
    assert.equal((await call("/personal/platform",s)).status,403)
  })
  await t.test("committed XYZ revocation denies XYZ while ABC remains active",async()=>{assert.ok(s);sql(`update da_organization_membership set status='revoked',revoked_at=clock_timestamp() where organization_id='${xyz}'`);assert.equal((await call("/personal/organizations?id="+xyz,s)).status,403);assert.equal((await call("/personal/organizations?id=daorg_m0ssi_abc",s)).status,200)})
  await t.test("valid bound native credential works before logout and fails afterwards",async()=>{
    const leaked=nativeFor(s.cookie)
    assert.equal((await call("/admin/users/me",{bearer:leaked})).status,200,"real native actor handler accepts session-bound credential")
    assert.equal((await call("/ADMIN/users/me/",{bearer:leaked})).status,200)
    const verification=await call("/auth/verification/request",{method:"POST",bearer:leaked,body:{entity_id:`verify-${randomUUID()}@example.invalid`,entity_type:"email",code_provider:"token"}})
    assert.equal(verification.status,201)
    const issued=await verification.json();assert.equal(issued.verification.code,undefined,"native request does not disclose verification secret")
    const {verification:challenge}=JSON.parse(readFileSync(evidence+"/"+process.env.M0_RESET_FIXTURE,"utf8"));assert.ok(challenge.code)
    assert.equal((await call("/auth/verification/confirm",{method:"POST",body:{code:challenge.code,code_provider:"token"}})).status,200,"legitimate anonymous verification remains functional")
    assert.equal((await call("/auth/verification/confirm",{method:"POST",body:{code:challenge.code,code_provider:"token"}})).status,400,"verification code replay denied by native provider")
    assert.equal((await call("/personal/session",{...s,csrf:"invalid",method:"DELETE"})).status,403)
    assert.equal((await call("/personal/session",{...s,method:"DELETE"})).status,200)
    assert.equal((await call("/personal/session",s)).status,401)
    assert.equal((await call("/admin/users/me",{bearer:leaked})).status,401)
    assert.equal((await call("/auth/token/refresh",{method:"POST",bearer:leaked})).status,401)
    assert.equal((await call("/ADMIN/users/me/",{bearer:leaked})).status,401)
    const before=sql("select count(*) from auth_verification")
    for(const path of ["/auth/verification/request","/auth/verification/confirm","/auth/mfa/factors","/auth/mfa/recovery-codes"])
      assert.equal((await call(path,{method:"POST",bearer:leaked,body:{entity_id:"denied@example.invalid",entity_type:"email",code:"denied"}})).status,401)
    assert.equal((await call("/auth/user/emailpass/update",{method:"POST",bearer:leaked,body:{password:credentials.password}})).status,401,"ordinary session JWT is not a reset-purpose credential")
    assert.equal(sql("select count(*) from auth_verification"),before,"post-logout verification has no persistent write")
  })
  await t.test("15-minute native ledger expiry renews only server-side, retires old credentials and preserves MFA age",async()=>{
    const x=await login(),hash=createHash("sha256").update(x.cookie.slice(11)).digest("hex"),old=nativeFor(x.cookie)
    // Test-only decode of the framework-signed output; never an authority in production.
    const claims=JSON.parse(Buffer.from(old.split('.')[1],"base64url").toString());assert.equal(claims.exp-claims.iat,900)
    sql(`update da_native_credential set expires_at=clock_timestamp() where session_id='${hash}' and retired_at is null`)
    assert.equal((await call("/admin/users/me",{bearer:old})).status,401)
    const responses=await Promise.all([call("/personal/session",x),call("/personal/session",x)])
    for(const r of responses){assert.equal(r.status,200);assert.deepEqual(Object.keys(await r.json()).sort(),["csrf_token","person_id"])}
    const replacement=nativeFor(x.cookie);assert.ok(old!==replacement,"credential must rotate; token values intentionally redacted")
    const fresh=JSON.parse(Buffer.from(replacement.split('.')[1],"base64url").toString());assert.equal(fresh.exp-fresh.iat,900);assert.equal(fresh.mfa_challenge_completed_at,claims.mfa_challenge_completed_at)
    assert.equal(sql(`select count(*) from da_native_credential where session_id='${hash}' and retired_at is null`),"1")
    assert.equal((await call("/admin/users/me",{bearer:old})).status,401);assert.equal((await call("/admin/users/me",{bearer:replacement})).status,200)
    assert.equal((await call("/personal/session",{...x,method:"DELETE"})).status,200)
    assert.equal((await call("/auth/verification/request",{method:"POST",bearer:replacement,body:{}})).status,401)
    assert.equal((await call("/personal/session",x)).status,401)
  })
  await t.test("anonymous recovery and genuine purpose-bound single-use reset remain functional",async()=>{
    assert.ok(process.env.M0_RESET_FIXTURE,"fresh workflow-issued recovery fixture required")
    const {token}=JSON.parse(readFileSync(evidence+"/"+process.env.M0_RESET_FIXTURE,"utf8"))
    assert.equal((await call("/auth/verification/request",{method:"POST",bearer:token,body:{}})).status,401,"purpose credential does not become session authority")
    assert.equal((await call("/auth/user/emailpass/reset-password",{method:"POST",body:{identifier:"unknown-synthetic@example.invalid"}})).status,201)
    assert.equal((await call("/auth/user/emailpass/update",{method:"POST",bearer:token,body:{password:credentials.password}})).status,200)
    assert.equal((await call("/auth/user/emailpass/update",{method:"POST",bearer:token,body:{password:credentials.password}})).status,401)
  })
  await t.test("genuine native-issued user Bearer cannot bypass ingress or refresh",async()=>{const r=await call("/auth/user/emailpass",{method:"POST",body:{email:"m0ssi-adversary-a7f1@example.invalid",password:credentials.password}});assert.equal(r.status,200);const {token}=await r.json();assert.ok(token);for(const [path,method]of [["/admin/users/me","GET"],["/admin/api-keys","GET"],["/auth/token/refresh","POST"],["/auth/session","POST"]])assert.equal((await call(path,{method,bearer:token})).status,401)})
  await t.test("a valid password without an explicit login binding creates no Person",async()=>{const before=sql("select count(*) from da_person");const r=await call("/personal/session",{method:"POST",body:{email:JSON.parse(readFileSync(evidence+"/unbound.private.json","utf8")).email,password:credentials.password}});assert.equal(r.status,401);assert.equal(sql("select count(*) from da_person"),before)})
  await t.test("selective exact idle expiration persists terminal status",async()=>{const x=await login();const hash=createHash("sha256").update(x.cookie.slice("da_session=".length)).digest("hex");sql(`update da_browser_session set created_at=clock_timestamp()-interval '1 hour',last_activity_at=clock_timestamp()-interval '1800 seconds' where id='${hash}'`);assert.equal((await call("/personal/session",x)).status,401);assert.equal(sql(`select status from da_browser_session where id='${hash}'`),"expired")})
  await t.test("8h to 6h policy selectively expires 7h, retains 5h, relaxation never resurrects",async()=>{
    const x=await login(),y=await login()
    const hash=c=>createHash("sha256").update(c.cookie.slice("da_session=".length)).digest("hex")
    for(const [session,hours]of [[x,7],[y,5]])sql(`update da_browser_session set created_at=clock_timestamp()-interval '${hours} hours' where id='${hash(session)}'`)
    sql("update da_session_policy set absolute_lifetime_seconds=21600,version=version+1 where id='current'")
    assert.equal((await call("/personal/session",x)).status,401);assert.equal((await call("/personal/session",y)).status,200)
    sql("update da_session_policy set absolute_lifetime_seconds=28800,version=version+1 where id='current'")
    assert.equal((await call("/personal/session",x)).status,401);assert.equal((await call("/personal/session",y)).status,200)
  })
  await t.test("all-device logout revokes independently issued opaque sessions and native delegations",async()=>{const x=await login(),y=await login();const native=nativeFor(y.cookie);assert.equal((await call("/personal/session?all=true",{...x,method:"DELETE"})).status,200);assert.equal((await call("/personal/session",x)).status,401);assert.equal((await call("/personal/session",y)).status,401);assert.equal((await call("/admin/users/me",{bearer:native})).status,401);assert.equal((await call("/auth/token/refresh",{method:"POST",bearer:native})).status,401)})
  await t.test("canonical session audits have one-to-one durable security outbox pointers",()=>{assert.equal(sql("select count(*) from da_audit_event a left join da_security_outbox o on o.audit_event_id=a.id where a.resource='identity-session' and o.id is null"),"0")})
})
