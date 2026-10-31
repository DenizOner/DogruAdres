/**
 * B22 narrow real native HTTP negative acceptance in the pre-existing,
 * random, disposable Medusa 2.21.x / PG16 CI database. No verified secondary
 * binding is inserted. A SellerMember relation alone cannot grant access.
 * No real registration approval, Chrome MFA or commerce assertion is made.
 */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { Client } from "@medusajs/framework/pg"
import { createPersonalHttpApp } from "../../src/scripts/personal-http-runtime"

export default async function({container}:any){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  assert.ok(process.env.CI==="true" &&
    process.env.PG_MFA_TEST_SCOPE==="verification" &&
    process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1" &&
    process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1) &&
    process.env.DOGRUADRES_IDENTITY_ENABLED==="true" &&
    process.env.DOGRUADRES_MFA_RUNTIME_ENABLED==="false" &&
    u.protocol==="postgres:" && u.hostname==="127.0.0.1" &&
    u.port==="5432" && u.username==="mfa_test" &&
    u.password==="ci-disposable-only-not-a-real-secret" &&
    /^\/mfa_cli_ci_[0-9a-f]{16}$/.test(u.pathname),
    "REFUSED: B22 negative HTTP requires the exact disposable verification database")
  const pg=new Client({connectionString:u.toString()}); await pg.connect()
  let server:any,app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined
  try{
    const rows=async(sql:string,args:unknown[]=[]) => (await pg.query(sql,args)).rows
    assert.equal((await rows("select current_database() db"))[0].db,u.pathname.slice(1))
    const suffix=randomBytes(8).toString("hex")
    const mail="b22-negative-"+suffix+"@example.invalid"
    const password=randomBytes(32).toString("base64url")
    const auth=container.resolve("auth"),users=container.resolve("user")
    const f=container.resolve("dogruadresAccess"),seller=container.resolve("seller")
    const user=await users.createUsers({email:mail})
    const reg=await auth.register("emailpass",{body:{email:mail,password}})
    assert.ok(reg.success&&reg.authIdentity?.id)
    await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{user_id:user.id}})
    const [person]=await f.createPeople([{}])
    await f.createActorMappings([{actor_type:"user",actor_id:user.id,
      person_id:person.id,created_by_actor_type:"user",created_by_actor_id:user.id}])
    await rows("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
      [reg.authIdentity.id,person.id,user.id])
    const [org]=await f.createOrganizations([{name:"B22 temporary Organization "+suffix,status:"active"}])
    await f.createMemberships([{organization_id:org.id,person_id:person.id,
      role:"owner",status:"active",protected_owner:true}])
    const [member]=await seller.createMembers([{email:"b22-member-"+suffix+"@example.invalid",is_active:true}])
    const [store]=await seller.createSellers([{name:"B22 temporary Store "+suffix,
      email:"b22-store-"+suffix+"@example.invalid",currency_code:"eur",status:"open"}])
    await seller.createSellerMembers([{member_id:member.id,seller_id:store.id,is_owner:true}])
    assert.equal((await rows("select count(*)::int n from da_verified_actor_binding where person_id=$1",[person.id]))[0].n,0)
    assert.equal((await rows("select count(*)::int n from da_organization_seller_ownership where seller_id=$1",[store.id]))[0].n,0)

    app=await createPersonalHttpApp(container)
    server=await new Promise<any>((resolve,reject)=>{
      const s=app!.app.listen(0,"127.0.0.1",()=>resolve(s))
      s.once("error",reject)
    })
    const base="http://127.0.0.1:"+server.address().port
    process.env.DOGRUADRES_PUBLIC_ORIGIN=base
    const login=await fetch(base+"/personal/session",{
      method:"POST",headers:{"content-type":"application/json",origin:base},
      body:JSON.stringify({email:mail,password}),signal:AbortSignal.timeout(15000),
    })
    assert.equal(login.status,200,"Native personal session login required")
    const cookie=login.headers.getSetCookie().find((s:string)=>s.startsWith("da_session="))?.split(";")[0]
    assert.ok(cookie && /^da_session=[A-Za-z0-9_-]{43}$/.test(cookie))
    assert.equal((await(await fetch(base+"/personal/session",{headers:{cookie}})).json()).person_id,person.id)
    const get=async(path:string,session?:string,headers:Record<string,string>={})=>{
      const response=await fetch(base+path,{headers:{...(session?{cookie:session}:{}),...headers},signal:AbortSignal.timeout(15000)})
      assert.match(response.headers.get("cache-control")??"",/no-store/)
      const data=await response.json()
      assert.equal(JSON.stringify(data).includes(mail),false,"Personal email leaked")
      return {status:response.status,data}
    }
    const own="/personal/organization-stores?organization="+encodeURIComponent(org.id)
    const allowedOrg=await get("/personal/organizations?id="+encodeURIComponent(org.id),cookie)
    assert.equal(allowedOrg.status,200)
    assert.equal((await get(own,cookie)).status,403,"Native SellerMember must not auto-grant Store")
    assert.equal((await get(own)).status,403,"Anonymous Store access must be denied")
    assert.equal((await get(own,cookie,{"x-seller-id":store.id})).status,400,"Forged seller context must be rejected")
    assert.equal((await get("/personal/organization-stores?organization=daorg_foreign",cookie)).status,403)
    assert.equal((await get(own+"&unexpected=1",cookie)).status,400)
    assert.equal((await rows("select count(*)::int n from da_verified_actor_binding where person_id=$1",[person.id]))[0].n,0)
    assert.equal((await rows("select count(*)::int n from da_organization_seller_ownership where seller_id=$1",[store.id]))[0].n,0)
    process.stdout.write("PASS B22 native HTTP negative: real personal password session, native SellerMember without verified Member binding denied\n")
  }finally{
    if(server)await new Promise<void>(r=>server.close(()=>r()))
    if(app)await app.close()
    await pg.end()
  }
}
