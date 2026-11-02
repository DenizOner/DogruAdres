/** B02 only. Real native providers, shipped HTTP middleware/routes and separate
 * PostgreSQL readback in the existing CLI harness's one disposable database.
 * No factors, organizations, grants, external delivery or protected resources.
 */
import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import type {ExecArgs,IAuthModuleService,IUserModuleService,ICustomerModuleService} from "@medusajs/framework/types"
import {Client} from "@medusajs/framework/pg"
import Foundation from "../../src/modules/dogruadres-access/service"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"

export default async function({container}:ExecArgs){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  assert.ok(process.env.CI==="true"&&process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1"&&
    u.protocol==="postgres:"&&u.hostname==="127.0.0.1"&&u.port==="5432"&&u.username==="mfa_test"&&
    u.password==="ci-disposable-only-not-a-real-secret"&&/^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname)&&
    process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1)&&process.env.DOGRUADRES_IDENTITY_ENABLED==="true"&&
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED==="false","REFUSED: wrong disposable B02 environment")
  const pg=new Client({connectionString:u.toString()});await pg.connect()
  const report:any={scope:"B02 native HTTP/SQL only; no Chrome",http:[],checks:{},acceptance:"OPEN"}
  let http:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined,server:any
  const rows=async(q:string,p:any[]=[]) => (await pg.query(q,p)).rows
  const count=async(t:string)=>Number((await rows(`select count(*)::int n from "${t}"`))[0].n)
  const snapshot=async()=>{
    const result:Record<string,{count:number;hash:string}>={}
    for(const {tablename} of await rows("select tablename from pg_tables where schemaname='public' order by tablename"))
      result[tablename]=(await rows(`select count(*)::int count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),'')) hash from "${tablename}" r`))[0]
    return result
  }
  try{
    assert.equal((await rows("select current_database() db,current_setting('server_version_num') ver"))[0].db,u.pathname.slice(1))
    assert.match((await rows("show server_version_num"))[0].server_version_num,/^16\d{4}$/)
    const empty=["da_person","user","customer","auth_identity","provider_identity","da_actor_mapping","da_login_binding",
      "da_browser_session","da_actor_link_intent","auth_mfa_factor","da_organization","da_organization_membership","da_platform_staff_grant"]
    for(const t of empty)assert.equal(await count(t),0,"Nonempty disposable fixture table: "+t)
    const auth:IAuthModuleService=container.resolve("auth"),users:IUserModuleService=container.resolve("user"),customers:ICustomerModuleService=container.resolve("customer"),foundation:Foundation=container.resolve("dogruadresAccess")
    const suffix=randomBytes(8).toString("hex"),contact=`b02-${suffix}@example.invalid`,secondaryEmail=`b02-secondary-${suffix}@example.invalid`
    const primaryPassword=randomBytes(32).toString("base64url"),secondaryPassword=randomBytes(32).toString("base64url")
    const user=await users.createUsers({email:contact}),customer=await customers.createCustomers({email:contact,has_account:true})
    const primary=await auth.register("emailpass",{body:{email:contact,password:primaryPassword}})
    const secondary=await auth.register("emailpass",{body:{email:secondaryEmail,password:secondaryPassword}})
    assert.ok(primary.success&&primary.authIdentity&&secondary.success&&secondary.authIdentity)
    const aid=primary.authIdentity!.id,bid=secondary.authIdentity!.id
    await auth.updateAuthIdentities([{id:aid,app_metadata:{user_id:user.id}},{id:bid,app_metadata:{customer_id:customer.id}}])
    const persons=await foundation.createPeople([{},{}]);assert.equal(persons.length,2)
    await foundation.createActorMappings([
      {actor_type:"user",actor_id:user.id,person_id:persons[0].id,created_by_actor_type:"user",created_by_actor_id:user.id},
      {actor_type:"customer",actor_id:customer.id,person_id:persons[1].id,created_by_actor_type:"customer",created_by_actor_id:customer.id},
    ])
    await pg.query("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now()),($4,$5,'customer',$6,now())",[aid,persons[0].id,user.id,bid,persons[1].id,customer.id])
    const actorEmails=(await rows('select u.email=c.email shared_contact from public.user u cross join customer c where u.id=$1 and c.id=$2',[user.id,customer.id]))[0]
    assert.equal(actorEmails.shared_contact,true)
    assert.equal((await rows("select count(distinct entity_id)::int n from provider_identity where provider='emailpass'"))[0].n,2)
    const personSnapshot=await rows("select to_jsonb(p)-'disabled_at'-'updated_at' stable from da_person p order by id")
    const bindingSnapshot=async()=>JSON.stringify(await rows("select * from (select 'mapping' kind,to_jsonb(m) data from da_actor_mapping m union all select 'login',to_jsonb(b) from da_login_binding b) q order by kind,data::text"))
    const originalBindings=await bindingSnapshot(),before=await snapshot()
    http=await createPersonalHttpApp(container)
    server=await new Promise<any>(resolve=>{const s=http!.app.listen(0,"127.0.0.1",()=>resolve(s))})
    const origin="http://127.0.0.1:"+server.address().port
    const call=async(label:string,path:string,options:{method?:string;body?:object;cookie?:string;csrf?:string}={})=>{
      const response=await fetch(origin+path,{method:options.method??"GET",headers:{Origin:process.env.DOGRUADRES_PUBLIC_ORIGIN!,
        ...(options.body?{"Content-Type":"application/json"}:{}),...(options.cookie?{Cookie:options.cookie}:{}),...(options.csrf?{"x-csrf-token":options.csrf}:{})},
        body:options.body?JSON.stringify(options.body):undefined,signal:AbortSignal.timeout(15000)})
      report.http.push({case:label,method:options.method??"GET",path,status:response.status});return response
    }
    const duplicate=await call("duplicate credential email","/auth/customer/emailpass/register",{method:"POST",body:{email:contact,password:secondaryPassword}})
    assert.ok([400,401,422].includes(duplicate.status));assert.equal(await count("auth_identity"),2)
    assert.equal((await call("forged password for shared contact email","/personal/session",{method:"POST",body:{email:contact,password:secondaryPassword}})).status,401)
    assert.equal(await count("da_browser_session"),0);assert.equal(await bindingSnapshot(),originalBindings)
    const login=await call("primary native password login","/personal/session",{method:"POST",body:{email:contact,password:primaryPassword}})
    assert.equal(login.status,200)
    const cookie=(login.headers.getSetCookie().find(c=>c.startsWith("da_session="))??"").split(";")[0]
    assert.ok(cookie.startsWith("da_session="));const {csrf_token}=await login.json() as any
    const sessionId=createHash("sha256").update(cookie.slice("da_session=".length)).digest("hex")
    assert.equal(await count("da_browser_session"),1)
    assert.equal((await call("shared contact grants no Customer scope","/personal/contexts?type=customer",{cookie})).status,403)
    const validated=await auth.authenticate("emailpass",{body:{email:secondaryEmail,password:secondaryPassword}})
    assert.ok(validated.success&&validated.authIdentity?.id===bid)
    await pg.query("update da_browser_session set last_strong_auth_at=now() where id=$1",[sessionId])
    const beginRes=await call("begin foreign credential link","/personal/links",{method:"POST",cookie,csrf:csrf_token,body:{action:"begin",actor_type:"customer",email:secondaryEmail,password:secondaryPassword}})
    assert.equal(beginRes.status,202)
    const {intent,challenge_required}=await beginRes.json() as any
    assert.ok(typeof intent==="string"&&intent.length===43&&challenge_required===false)
    assert.equal(await count("da_actor_link_intent"),1)
    const completeRes=await call("complete foreign credential link denied by ownership","/personal/links",{method:"POST",cookie,csrf:csrf_token,body:{action:"complete",intent}})
    assert.equal(completeRes.status,403)
    assert.equal((await completeRes.json() as any).message,"Account operation denied")
    const intentRow=(await rows("select attempts,consumed_at is not null consumed,auth_identity_id=$1 correct_auth from da_actor_link_intent where session_id=$2",[bid,sessionId]))[0]
    assert.deepEqual(intentRow,{attempts:1,consumed:false,correct_auth:true})
    assert.equal(await count("da_actor_link_intent"),1)
    assert.equal(await count("da_verified_actor_binding"),0)
    assert.equal(await bindingSnapshot(),originalBindings)
    // Native module update; never restore or alter any preserved actor.
    await foundation.updatePeople({id:persons[0].id,disabled_at:new Date()})
    assert.equal((await call("disabled Person protected session","/personal/session",{cookie})).status,401)
    const exact=(await rows("select person_id=$2 correct_person,status,auth_identity_id=$3 correct_identity from da_browser_session where id=$1",[sessionId,persons[0].id,aid]))[0]
    assert.deepEqual(exact,{correct_person:true,status:"revoked",correct_identity:true})
    assert.equal(await bindingSnapshot(),originalBindings)
    const after=await snapshot(),allowed=new Set(["da_person","da_person_security","da_browser_session","da_native_credential","da_login_attempt","da_audit_event","da_security_outbox","da_actor_link_intent"])
    const changed=Object.keys(before).filter(t=>JSON.stringify(before[t])!==JSON.stringify(after[t]))
    assert.ok(changed.every(t=>allowed.has(t)),"Unexpected table writes: "+changed.filter(t=>!allowed.has(t)).join(","))
    for(const [table,n] of Object.entries({da_person:2,user:1,customer:1,auth_identity:2,provider_identity:2,da_actor_mapping:2,da_login_binding:2,da_browser_session:1,da_native_credential:1,da_actor_link_intent:1,da_verified_actor_binding:0,da_actor_credential:0,auth_mfa_factor:0,auth_mfa_recovery_code:0,da_organization:0,da_organization_membership:0,da_platform_staff_grant:0,da_machine_grant:0}))assert.equal(await count(table),n,"Fixture cap/invariant: "+table)
    assert.equal((await rows("select count(*)::int n from da_person where disabled_at is not null"))[0].n,1)
    assert.equal((await rows("select count(*)::int n from da_audit_event where action='identity.actor_linked'"))[0].n,0)
    report.checks={distinctPersons:true,sharedActorContact:true,distinctProviderEmails:true,canonicalBindingsUnchanged:true,noCustomerAccess:true,foreignLinkDenied:true,singlePendingIntent:true,noExtraSession:true,exactRevokedSession:exact,zeroOrganizationsMembershipsGrantsFactors:true,changedTables:changed,unchangedTables:Object.keys(before).length-changed.length}
    assert.deepEqual(await rows("select to_jsonb(p)-'disabled_at'-'updated_at' stable from da_person p order by id"),personSnapshot)
    const audit=await rows("select action,actor_person_id=$1 correct_person,target_id=$2 correct_session from da_audit_event",[persons[0].id,sessionId])
    assert.deepEqual(audit,[{action:"session.created",correct_person:true,correct_session:true}])
    assert.equal((await rows("select count(*)::int n from da_security_outbox o join da_audit_event a on a.id=o.audit_event_id where a.target_id=$1",[sessionId]))[0].n,1)
    report.audit=audit
    report.tableReadback={before,after}
    report.sessionCorrelation=createHash("sha256").update(sessionId).digest("hex").slice(0,16)
    report.counts=Object.fromEntries(await Promise.all(["da_person","auth_identity","da_actor_mapping","da_login_binding","da_browser_session","da_native_credential","da_actor_link_intent","da_login_attempt","da_audit_event","da_security_outbox"].map(async t=>[t,await count(t)])))
    console.log("B02_EVIDENCE "+JSON.stringify(report))
    console.log("PASS B02 bounded HTTP/SQL execution: duplicate/forged-email and Customer denial; foreign-owned linkage denial with single unconsumed intent; disabled Person 401 and durable revoked; fixture caps and mapping conservation")
  }catch(error){
    report.execution="FAILED; no retry"
    report.errorType=error instanceof Error?error.name:"UnknownError"
    console.log("B02_EVIDENCE "+JSON.stringify(report))
    throw new Error("B02 native acceptance assertion failed; see sanitized evidence")
  }finally{
    if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
    await http?.close();await pg.end()
  }
}
