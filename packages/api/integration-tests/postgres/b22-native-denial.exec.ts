/**
 * B22 narrow real native HTTP negative acceptance in the pre-existing,
 * random, disposable Medusa 2.21.x / PG16 CI database. No verified secondary
 * binding is inserted. A SellerMember relation alone cannot grant access.
 * No real registration approval, Chrome MFA or commerce assertion is made.
 */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { Client } from "@medusajs/framework/pg"
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows"
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
    // A genuine, current publishable key still cannot stand in for a Buyer Org.
    const {result:[publishable]}=await createApiKeysWorkflow(container).run({input:{
      api_keys:[{title:"B22 closed catalog "+suffix,type:"publishable",created_by:""}]
    }})
    assert.ok(publishable?.token && publishable?.id)
    assert.equal((await rows("select count(*)::int n from api_key where id=$1",[publishable.id]))[0].n,1)
    // Current #217 closed B4B decision supersedes the old public B2C demo.
    // Use the real Medusa HTTP stack on this same disposable PostgreSQL DB.
    const beforeCatalog=await rows("select id,action from da_audit_event where organization_id=$1 order by id",[org.id])
    // Check the entire serialized response, including nested DTO fields, not
    // only known top-level product keys. Never print fixture identities.
    const assertNoPrivateCatalogData=(body:unknown)=>{
      const serialized=JSON.stringify(body)
      for(const privateValue of [mail,person.id,org.id,user.id,reg.authIdentity.id,
        member.id,store.id,publishable.id,publishable.token]){
        assert.ok(privateValue && !serialized.includes(privateValue),
          "Denied catalog response must not disclose Person, Organization, Store or API-key fixtures")
      }
    }
    const deniedCatalog=[
      {path:"/store/products",method:"GET"},
      {path:"/store/products/prod_synthetic",method:"GET"},
      {path:"/store/offers",method:"GET"},
      {path:"/store/sellers",method:"GET"},
      {path:"/store/product-categories",method:"GET"},
      {path:"/store/search",method:"POST"},
    ]
    for(const target of deniedCatalog){
      const response=await fetch(base+target.path,{method:target.method,
        headers:{"x-publishable-api-key":publishable.token,
          ...(target.method==="POST"?{"content-type":"application/json"}:{})},
        ...(target.method==="POST"?{body:"{}"}:{}),
        redirect:"manual",signal:AbortSignal.timeout(15000)})
      assert.equal(response.redirected,false,"Catalog must not follow a redirect")
      assert.equal(response.status,401,"Anonymous/publishable-key native catalog must be closed: "+target.path)
      const denied=await response.json()
      assert.deepEqual(denied,{message:"Personal session ingress required"})
      assertNoPrivateCatalogData(denied)
    }
    const personalOnly=await fetch(base+"/store/products",{
      headers:{cookie,"x-publishable-api-key":publishable.token},
      redirect:"manual",signal:AbortSignal.timeout(15000)})
    assert.equal(personalOnly.redirected,false,"Personal-only catalog must not follow a redirect")
    assert.equal(personalOnly.status,401,"Personal login alone cannot grant an approved Buyer Organization catalog")
    const personalDenied=await personalOnly.json()
    assert.deepEqual(personalDenied,{message:"Personal session ingress required"})
    assertNoPrivateCatalogData(personalDenied)
    // Medusa may reject a malformed native Bearer at the framework boundary
    // with 400 before nativeIngress can return 401. Either is a closed result.
    // Pass a genuine publishable key so the test cannot pass simply because
    // the mandatory Store key was missing.
    const nativeBearer=await fetch(base+"/store/products",{
      headers:{authorization:"Bearer synthetic-native-token",
        "x-publishable-api-key":publishable.token},
      redirect:"manual",signal:AbortSignal.timeout(15000)})
    assert.equal(nativeBearer.redirected,false,"Malformed native Bearer must not follow a redirect")
    assert.ok([400,401].includes(nativeBearer.status),
      "Malformed native Bearer must be rejected before catalog access")
    const bearerDenied=await nativeBearer.json()
    assert.equal(typeof bearerDenied?.message,"string")
    assert.equal(bearerDenied.products,undefined,"Malformed Bearer cannot obtain Store products")
    assert.equal(bearerDenied.offers,undefined,"Malformed Bearer cannot obtain Store offers")
    assertNoPrivateCatalogData(bearerDenied)
    assert.deepEqual(await rows("select id,action from da_audit_event where organization_id=$1 order by id",[org.id]),
      beforeCatalog,"Denied native catalog cannot change canonical audit")
    process.stdout.write("PASS B22 closed B4B native HTTP: public catalog/search denied before native data; no Organization audit mutation\n")
    assert.equal((await rows("select count(*)::int n from da_verified_actor_binding where person_id=$1",[person.id]))[0].n,0)
    assert.equal((await rows("select count(*)::int n from da_organization_seller_ownership where seller_id=$1",[store.id]))[0].n,0)
    process.stdout.write("PASS B22 native HTTP negative: real personal password session, native SellerMember without verified Member binding denied\n")
  }finally{
    if(server)await new Promise<void>(r=>server.close(()=>r()))
    if(app)await app.close()
    await pg.end()
  }
}
