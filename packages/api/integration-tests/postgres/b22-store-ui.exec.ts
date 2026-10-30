/**
 * M0 B22 — Real Chrome + native Medusa Auth MFA + real secondary Member
 * dual proof through /personal/links + same-origin Organization Store GET.
 * The Organization/Store approval rows are SYNTHETIC FIXTURES in a single
 * random task-only CI database; they are NOT a real platform approval service.
 * No protected writes, credentials or real documents are stored in evidence.
 */
import assert from "node:assert/strict"
import {randomBytes,createHash} from "node:crypto"
import {createServer as tlsServer,request as tlsRequest} from "node:https"
import {createServer as plainServer} from "node:http"
import {dirname} from "node:path"
import {mkdtempSync,readFileSync,rmSync} from "node:fs"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {ingressConfig} from "../../src/utils/ingress-config"
import {completeCartWithSplitOrdersWorkflow,approveSellerWorkflow,suspendSellerWorkflow,unsuspendSellerWorkflow,createProductsWorkflow,createOffersWorkflow} from "@mercurjs/core/workflows"
import {createShippingProfilesWorkflow,addToCartWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow} from "@medusajs/medusa/core-flows"
import {B06Chrome} from "./b06-ui-browser"
import {otp,until} from "./b19-browser"

export default async function({container}:any){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  const preparing=process.env.B22_UI_PREPARE==="true"
  assert.ok(process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true"&&
    process.env.GITHUB_EVENT_NAME==="pull_request"&&process.env.B22_UI_AUTO_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SCOPE==="b22-ui"&&
    process.env.PG_MFA_TEST_SENTINEL==="mfa-pg16-disposable-ci-v1"&&
    process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1)&&
    u.protocol==="postgres:"&&u.hostname==="127.0.0.1"&&u.port==="5432"&&
    u.username==="mfa_test"&&u.password==="ci-disposable-only-not-a-real-secret"&&
    /^\/mfa_cli_ci_[0-9a-f]{16}$/.test(u.pathname)&&
    (preparing?process.env.DOGRUADRES_MFA_RUNTIME_ENABLED==="false":
      ["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED",
       "DOGRUADRES_MFA_SETTINGS_ENABLED","DOGRUADRES_MFA_ENROLLMENT_ENABLED"]
      .every(k=>process.env[k]==="true")),"REFUSED: B22 browser scope only disposable native CI")
  const pg=new Client({connectionString:u.toString()});await pg.connect()
  const q=async(sql:string,args:unknown[]=[]) => (await pg.query(sql,args)).rows
  let app:Awaited<ReturnType<typeof createPersonalHttpApp>>|undefined
  let server:ReturnType<typeof tlsServer>|undefined
  let privateServer:ReturnType<typeof plainServer>|undefined
  const previousPrivateOrigin=process.env.DOGRUADRES_PRIVATE_API
  const previousTlsCert=process.env.DOGRUADRES_TLS_CERT
  const previousTlsKey=process.env.DOGRUADRES_TLS_KEY
  const previousListenerPort=process.env.DOGRUADRES_FRONTDOOR_PORT
  const browsers:B06Chrome[]=[]
  const temp=mkdtempSync(join(tmpdir(),"b22-task-ca-"))
  try{
    assert.equal((await q("select current_database() db"))[0].db,u.pathname.slice(1))
    assert.equal((await q("select mfa_activated from da_session_policy where id='current'"))[0].mfa_activated,!preparing)
    const rand=randomBytes(8).toString("hex"),auth=container.resolve("auth")
    const users=container.resolve("user"),foundation=container.resolve("dogruadresAccess")
    const native=container.resolve("seller")
    const primary=async(label:"A"|"B")=>{
      const email=process.env["B22_UI_EMAIL_"+label]!,password=process.env["B22_UI_PASSWORD_"+label]!
      assert.match(email,/^b22-[ab]-[0-9a-f]{16}@example.invalid$/)
      assert.ok(password.length>=40)
      const user=await users.createUsers({email})
      const reg=await auth.register("emailpass",{body:{email,password}})
      assert.ok(reg.success&&reg.authIdentity?.id)
      await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{user_id:user.id}})
      const [person]=await foundation.createPeople([{}])
      await foundation.createActorMappings([{actor_type:"user",actor_id:user.id,
        person_id:person.id,created_by_actor_type:"user",created_by_actor_id:user.id}])
      // Primary synthetic enrollment fixture from existing Foundation B06;
      // NOT a shortcut for the secondary Member ownership proof.
      await q("insert into da_login_binding(auth_identity_id,person_id,actor_type,actor_id,verified_at) values($1,$2,'user',$3,now())",
        [reg.authIdentity.id,person.id,user.id])
      return {email,password,person:person.id,actor:user.id}
    }
    if(preparing){
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding","auth_mfa_factor"])
        assert.equal((await q("select count(*)::int n from "+table))[0].n,0,"R1 clean fixture "+table)
      await primary("A");await primary("B")
      for(const table of ["public.user","auth_identity","da_person","da_actor_mapping","da_login_binding"])
        assert.equal((await q("select count(*)::int n from "+table))[0].n,2,"R1 prepared "+table)
      assert.equal((await q("select count(*)::int n from auth_mfa_factor"))[0].n,0)
      process.stdout.write("PASS B22 test fixture: two native primary identities prepared for existing signed R1 preflight\n")
      return
    }
    const readActor=async(label:"A"|"B")=>{
      const email=process.env["B22_UI_EMAIL_"+label]!,password=process.env["B22_UI_PASSWORD_"+label]!
      const result=await q(`select u.id actor,b.person_id person from public.user u
        join da_login_binding b on b.actor_id=u.id and b.actor_type='user'
        where u.email=$1 and b.verified_at is not null and b.revoked_at is null`,[email])
      assert.equal(result.length,1)
      return {email,password,person:result[0].person as string,actor:result[0].actor as string}
    }
    const A=await readActor("A"),B=await readActor("B")
    const organizations=await foundation.createOrganizations([
      {name:"B22 Alpha "+rand,status:"active"},{name:"B22 Beta "+rand,status:"active"},
      {name:"B22 Foreign "+rand,status:"active"},
    ])
    const memberships=await foundation.createMemberships([
      {organization_id:organizations[0].id,person_id:A.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:organizations[1].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
      {organization_id:organizations[1].id,person_id:A.person,role:"admin",status:"active",protected_owner:false},
      {organization_id:organizations[2].id,person_id:B.person,role:"owner",status:"active",protected_owner:true},
    ])
    // A single canonical Person may independently own two seller legal
    // Organizations. Gamma is a separate seller Organization, not a new
    // Person, a second login or a fabricated Seller ownership association.
    const [sellerGamma]=await foundation.createOrganizations([{
      name:"B22 Gamma Seller "+rand,status:"active"
    }])
    const [gammaOwnerMembership]=await foundation.createMemberships([{
      organization_id:sellerGamma.id,person_id:A.person,role:"owner",
      status:"active",protected_owner:true
    }])
    assert.match(gammaOwnerMembership.id,/^[A-Za-z0-9_-]+$/)
    const betaAdminMembership=memberships[2]
    const memberEmail="b22-secondary-"+rand+"@example.invalid"
    const [member]=await native.createMembers([{email:memberEmail,is_active:true}])
    const memberPassword=randomBytes(32).toString("base64url")
    const reg=await auth.register("emailpass",{body:{email:memberEmail,password:memberPassword}})
    assert.ok(reg.success&&reg.authIdentity?.id)
    await auth.updateAuthIdentities({id:reg.authIdentity.id,app_metadata:{member_id:member.id}})
    const secondaryMfa=await auth.startAuthMfa({auth_identity_id:reg.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Member"})
    const secondaryEnrolledCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({id:secondaryMfa.mfa.id,auth_identity_id:reg.authIdentity.id,
      code:otp(secondaryMfa.secret)})
    // Medusa's installed Customer Module creates this task-only native actor.
    // This Customer is NOT itself a legal Organization or purchase grant.
    const customerEmail="b22-customer-"+rand+"@example.invalid"
    const customerService=container.resolve("customer")
    const [nativeCustomer]=await customerService.createCustomers([{
      email:customerEmail
    }])
    assert.match(nativeCustomer.id,/^cus_[A-Za-z0-9_-]+$/)
    // Task-only native Medusa Cart fixtures. No line item, payment or order.
    const cartService=container.resolve("cart")
    const customerCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    assert.match(customerCart.id,/^cart_[A-Za-z0-9_-]+$/)
    const [foreignNativeCustomer]=await customerService.createCustomers([{
      email:"b22-foreign-cart-"+rand+"@example.invalid"
    }])
    const foreignCart=await cartService.createCarts({
      currency_code:"eur",customer_id:foreignNativeCustomer.id
    })
    assert.match(foreignCart.id,/^cart_[A-Za-z0-9_-]+$/)

    const customerPassword=randomBytes(32).toString("base64url")
    const customerReg=await auth.register("emailpass",{
      body:{email:customerEmail,password:customerPassword}
    })
    assert.ok(customerReg.success&&customerReg.authIdentity?.id)
    await auth.updateAuthIdentities({
      id:customerReg.authIdentity.id,
      app_metadata:{customer_id:nativeCustomer.id}
    })
    const customerMfa=await auth.startAuthMfa({
      auth_identity_id:customerReg.authIdentity.id,
      provider:"totp",issuer:"B22 isolated verified Customer"
    })
    const customerEnrollCounter=Math.floor(Date.now()/30000)
    await auth.verifyAuthMfa({
      id:customerMfa.mfa.id,
      auth_identity_id:customerReg.authIdentity.id,
      code:otp(customerMfa.secret)
    })
    const stores: Array<{id:string;name:string}>=[]
    for(let n=0;n<3;n++){
      // Mercur's own Store workflow is authoritative for its native approval.
      // Never forge status=open or approved_at with a direct service write.
      const [store]=await native.createSellers([{name:"B22 Store "+(n+1)+" "+rand,
        email:"b22-store-"+n+"-"+rand+"@example.invalid",currency_code:"eur"}])
      const before=await native.listSellers({id:store.id})
      assert.equal(before.length,1);assert.equal(before[0].status,"pending_approval")
      assert.equal(before[0].approved_at,null)
      await approveSellerWorkflow(container).run({input:{seller_id:store.id}})
      const after=await native.listSellers({id:store.id})
      assert.equal(after.length,1);assert.equal(after[0].status,"open")
      assert.ok(after[0].approved_at,"Mercur native approval timestamp required")
      await native.createSellerMembers([{seller_id:store.id,member_id:member.id,is_owner:true}])
      stores.push(store)
    }
    // Deliberately inconsistent TEST-ONLY Seller: status OPEN was written
    // without Mercur approveSellerWorkflow, so approved_at remains absent.
    // Even a platform association + verified Member must never expose it.
    const [unapprovedStore]=await native.createSellers([{name:"B22 approval-negative "+rand,
      email:"b22-unapproved-"+rand+"@example.invalid",currency_code:"eur",status:"open"}])
    const unapprovedNative=await native.listSellers({id:unapprovedStore.id})
    assert.equal(unapprovedNative.length,1)
    assert.equal(unapprovedNative[0].status,"open")
    assert.equal(unapprovedNative[0].approved_at,null)
    await native.createSellerMembers([{seller_id:unapprovedStore.id,member_id:member.id,is_owner:true}])

    const crt=join(temp,"ca.pem"),key=join(temp,"key.pem")
    const certificate=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
      "-keyout",key,"-out",crt,"-days","1","-subj","/CN=B22 task CA",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-addext","basicConstraints=critical,CA:TRUE"],{stdio:"ignore",timeout:20000})
    assert.equal(certificate.status,0,"Task-only CA generation")
    // B22 now also validates the server-only native Member context. Use
    // the already-supported real Mercur loader from B20's runtime, and an
    // ephemeral HTTP listener bound strictly to loopback. No external API,
    // no mock route or browser-visible native credential is introduced.
    const mercurApi=join(dirname(require.resolve("@mercurjs/core")),"api")
    app=await createPersonalHttpApp(container,[mercurApi])
    privateServer=plainServer(app.app)
    await new Promise<void>((resolve,reject)=>{
      privateServer!.once("error",reject)
      privateServer!.listen(0,"127.0.0.1",resolve)
    })
    const nativePort=(privateServer.address() as {port:number}).port
    process.env.DOGRUADRES_PRIVATE_API="http://127.0.0.1:"+nativePort
    server=tlsServer({cert:readFileSync(crt),key:readFileSync(key),minVersion:"TLSv1.2"},app.app)
    await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve)})
    const host="https://127.0.0.1:"+(server.address() as any).port
    process.env.DOGRUADRES_PUBLIC_ORIGIN=host
    process.env.DOGRUADRES_TLS_CERT=crt
    process.env.DOGRUADRES_TLS_KEY=key
    process.env.DOGRUADRES_FRONTDOOR_PORT=(server.address() as {port:number}).port.toString()
    const topology=ingressConfig(process.env)
    assert.equal(topology.privateOrigin,process.env.DOGRUADRES_PRIVATE_API)
    assert.equal(topology.publicOrigin,host)
    const browser=new B06Chrome(host,"A");browsers.push(browser)
    await browser.start(crt)
    await browser.login(A.email,A.password,A.person)
    const cookie=await browser.token()
    assert.match(cookie??"",/^[A-Za-z0-9_-]{43}$/)
    // Execute the INSTALLED native Mercur product workflow on the existing
    // disposable CI DB, before creating any new personal commerce writer.
    // Workflow input is INTERNAL ONLY: it is not a visitor authorization.
    const nativeProductTitle="B22 native draft "+rand
    const {result:products}=await createProductsWorkflow(container).run({
      input:{products:[{title:nativeProductTitle,status:"draft",seller_ids:[stores[0].id]}],
        created_by:stores[0].id}
    })
    assert.equal(products.length,1)
    const draft=products[0]
    assert.ok(/^prod_[A-Za-z0-9_-]+$/.test(draft.id))
    const [actualProduct]=await q("select id,title,status from product where id=$1",[draft.id])
    assert.equal(actualProduct?.title,nativeProductTitle)
    assert.equal(actualProduct?.status,"draft")
    const actualLinks=await q("select seller_id from product_seller where product_id=$1",[draft.id])
    assert.deepEqual(actualLinks.map(x=>x.seller_id),[stores[0].id])
    // A native product workflow does not by itself prove a human's product
    // permission, nor grant the other Seller/Organization access.
    assert.ok(!actualLinks.some(x=>x.seller_id===stores[1].id))
    process.stdout.write("PASS B22 native Mercur product workflow: draft persisted, only selected Seller linked; no visitor writer/permission claim\n")
    const get=async(path:string,additional:Record<string,string>={})=>{
      return browser.eval(`(async()=>{
        const r=await fetch(${JSON.stringify(path)},{headers:${JSON.stringify(additional)}})
        return {status:r.status,body:await r.json(),cache:r.headers.get("cache-control")}
      })()`)
    }
    const selected=(org:string)=>"/personal/organization-stores?organization="+encodeURIComponent(org)
    // Native SellerMember is NOT a verified human association. Nothing visible.
    await browser.eval("window.__b22_ui_error='';window.addEventListener('error',event=>{window.__b22_ui_error=String(event.message).slice(0,90)});window.__b22_events=[];['pagehide','visibilitychange','popstate'].forEach(name=>window.addEventListener(name,()=>window.__b22_events.push({type:name,hidden:document.hidden})))")
    // A headless Chrome tab is not entitled to a visible workspace while
    // backgrounded. Bring the actual tab forward; do not bypass its privacy
    // event handlers or fake an active session.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    try {
      await browser.select(organizations[0].name,"owner")
    } catch (error) {
      const info=await browser.eval(`({
        detailValid:(()=>{try{return !!JSON.parse(document.getElementById('detail').textContent).role}catch{return false}})(),
        workspaceVisible:!document.getElementById('workspace').hidden,
        applicationFormExists:!!document.getElementById('store-application-form'),
        applicationRequestReady:typeof applicationRequest==='number',
        sessionStatus:document.getElementById('status').textContent.slice(0,70),
        uiError:String(window.__b22_ui_error||'').replace(/[A-Za-z0-9_-]{20,}/g,'[masked]'),
        visibility:document.visibilityState,
        events:(window.__b22_events||[]).slice(-8),
        selectionForm:(document.querySelector('#organizations button')?.closest('form')?.id||null),
        pathIsPersonal:location.pathname==='/personal'
      })`)
      throw Error("B22 Organization select contract failed: "+JSON.stringify(info))
    }
    await browser.wait("document.getElementById('org-stores-status').textContent.includes('erişim izniniz yok')")
    assert.equal((await get(selected(organizations[0].id))).status,403)
    assert.equal((await q("select count(*)::int n from da_verified_actor_binding where person_id=$1",[A.person]))[0].n,0)
    // Exercise supported real secondary password and native TOTP via UI.
    await browser.input("#link-account input[name=email]",memberEmail)
    await browser.input("#link-account input[name=password]",memberPassword)
    await browser.click("#link-account button")
    await browser.wait("!document.getElementById('link-confirm').hidden")
    // Primary Chrome MFA login has advanced the TOTP counter. Never reuse
    // the just-consumed secondary enrollment code within the same window.
    assert.ok(Math.floor(Date.now()/30000)>secondaryEnrolledCounter,
      "Secondary TOTP challenge must not reuse its enrollment window")
    await browser.input("#link-confirm input[name=code]",otp(secondaryMfa.secret))
    await browser.click("#link-confirm button")
    await browser.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verified=await q("select proof_reference from da_verified_actor_binding where person_id=$1 and actor_type='member' and revoked_at is null",[A.person])
    assert.equal(verified.length,1);assert.match(verified[0].proof_reference,/^dual-proof:/)
    // The real Owner UI submits via native Mercur createSellerAccountWorkflow.
    // No extra Store-to-Organization approval or native dashboard login.
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-application-form').hidden")
    const applicationName="B22 Owner application "+rand
    const applicationEmail="b22-owner-app-"+rand+"@example.invalid"
    await browser.input("#store-application-form input[name=name]",applicationName)
    await browser.input("#store-application-form input[name=email]",applicationEmail)
    await browser.click("#store-application-form button")
    let observed=""
    await until(async()=>{
      observed=String(await browser.eval("document.getElementById('store-application-status').textContent"))
      return observed.includes("Başvuru kaydedildi") ||
        observed.includes("Başvuru reddedildi") || observed.includes("Sonuç belirsiz")
    },19000,"B22 Owner Store application outcome")
    if(!observed.includes("Başvuru kaydedildi")){
      const state=await q(`select status,seller_id is not null as seller_created
        from da_store_application where organization_id=$1 and person_id=$2`,
        [organizations[0].id,A.person])
      // Never log credentials, Member IDs, application keys or Seller details.
      throw Error("B22 application incomplete: ui_category="+
        (observed.includes("Sonuç belirsiz")?"uncertain":"denied")+
        ",rows="+state.length+",state="+state.map((row:any)=>row.status).join(",")+
        ",seller_written="+state.some((row:any)=>row.seller_created))
    }
    const createdList=await get("/personal/store-applications?organization_id="+encodeURIComponent(organizations[0].id))
    assert.equal(createdList.status,200)
    const ownApplications=createdList.body.applications
    assert.equal(ownApplications.length,1)
    assert.equal(ownApplications[0].status,"created")
    const applicationId=ownApplications[0].id,ownerStoreId=ownApplications[0].seller_id
    assert.match(applicationId,/^daapp_[0-9a-f]{32}$/)
    assert.match(ownerStoreId,/^sel_[A-Za-z0-9_-]+$/)
    const newNative=await native.listSellers({id:ownerStoreId})
    assert.equal(newNative.length,1)
    assert.equal(newNative[0].status,"pending_approval")
    assert.equal(newNative[0].approved_at,null)
    const linked=await q(`select o.organization_id,e.action,e.actor_person_id,
      x.id outbox_id from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1`,[ownerStoreId])
    assert.equal(linked.length,1)
    assert.equal(linked[0].organization_id,organizations[0].id)
    assert.equal(linked[0].actor_person_id,A.person)
    assert.equal(linked[0].action,"organization.store_application_created")
    const submit=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const csrf=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/store-applications',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})})
      return {status:response.status,body:await response.json()}
    })()`)
    const data={organization_id:organizations[0].id,application_id:applicationId,
      name:applicationName,email:applicationEmail,currency_code:"try"}
    const replay=await submit(data)
    assert.equal(replay.status,200);assert.equal(replay.body.seller_id,ownerStoreId)
    assert.equal((await submit({...data,name:applicationName+" changed"})).status,403)
    assert.equal((await submit({...data,organization_id:organizations[2].id,
      application_id:"daapp_"+randomBytes(16).toString("hex")})).status,403)
    assert.equal((await q("select count(*)::int n from da_store_application where person_id=$1",[A.person]))[0].n,1)
    // The Origin link is created at Owner submission, but Seller approval is
    // STILL mandatory. A pending Seller must never enter the active Store list.
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    // The Owner cannot impersonate a platform reviewer, even though the
    // workflow created SellerMember.is_owner for this Store.
    const ownerApprovalDenied=await browser.eval(`(async()=>{
      const session=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({application_id:applicationId,seller_id:ownerStoreId})})})
      return response.status
    })()`)
    assert.equal(ownerApprovalDenied,403)
    assert.equal((await get("/personal/platform/stores")).status,403)
    assert.equal((await native.listSellers({id:ownerStoreId}))[0].status,"pending_approval")
    // One isolated historical Origin fixture has a real native pending
    // Seller; 30 older records have no native Seller and convey no access.
    // This tests approval of an older page without a second linkage approval.
    const [olderPending]=await native.createSellers([{
      name:"B22 older pending "+rand,
      email:"b22-older-pending-"+rand+"@example.invalid",currency_code:"try"
    }])
    const nativeBeforeOlder=await native.listSellers({id:olderPending.id})
    assert.equal(nativeBeforeOlder.length,1)
    assert.equal(nativeBeforeOlder[0].status,"pending_approval")
    assert.equal(nativeBeforeOlder[0].approved_at,null)
    await native.createSellerMembers([{seller_id:olderPending.id,
      member_id:member.id,is_owner:true}])
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    await q(`insert into da_store_application
      (id,organization_id,person_id,member_actor_id,member_auth_identity_id,
       request_fingerprint,status,seller_id,created_at)
      select 'daapp_'||md5('b22-history-'||$1||':'||g.n::text),
        $2,$3,$4,$5,repeat('b',64),'created',
        case when g.n=0 then $7 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        (select created_at from da_store_application where id=$6)-interval '1 hour'
          +g.n*interval '1 millisecond'
      from generate_series(0,30) g(n)`,
      [rand,organizations[0].id,A.person,member.id,reg.authIdentity.id,applicationId,olderPending.id])
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,
       resource,target_id,new_values,occurred_at)
      select 'daaud_b22_history_'||g.n::text||'_'||$1,
        $2,'user',$3,$4,'organization.store_application_created',
        'dogruadres-access','store-application',
        case when g.n=0 then $5 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        jsonb_build_object('application_id',
          'daapp_'||md5('b22-history-'||$1||':'||g.n::text),
          'status','pending_approval'),clock_timestamp()
      from generate_series(0,30) g(n)`,
      [rand,A.person,A.actor,organizations[0].id,olderPending.id])
    await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
      select 'daaob_b22_history_'||g.n::text||'_'||$1,
        'daaud_b22_history_'||g.n::text||'_'||$1,
        'dogruadres-access','{}'::jsonb from generate_series(0,30) g(n)`,[rand])
    await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      select 'daown_b22_history_'||g.n::text||'_'||$1,$2,
        case when g.n=0 then $3 else 'sel_b22_history_'||g.n::text||'_'||$1 end,
        'daaud_b22_history_'||g.n::text||'_'||$1,clock_timestamp()
      from generate_series(0,30) g(n)`,[rand,organizations[0].id,olderPending.id])
    assert.equal((await q("select count(*)::int n from da_store_application where organization_id=$1",
      [organizations[0].id]))[0].n,32)
    // TEST-ONLY disposable scope: an explicit store.approve grant belongs to
    // another Person. It is never inferred from B's native User/Org roles.
    const grantId="da_staff_b22_"+rand
    await q(`insert into da_platform_staff_grant
      (id,person_id,task,resource,granted_by_person_id,reason)
      values($1,$2,'store.approve','platform',$2,'B22 disposable CI platform reviewer fixture')`,[grantId,B.person])
    const reviewer=new B06Chrome(host,"B");browsers.push(reviewer)
    await reviewer.start(crt)
    await reviewer.login(B.email,B.password,B.person)
    reviewer.phase="platform-store-review"
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),true)
    // Real staff Chrome can approve a native pending Seller on page 2;
    // the remaining 30 fake Seller IDs confer no lifecycle or authority.
    assert.equal(await reviewer.eval("document.getElementById('store-approval-older').hidden"),false)
    await reviewer.click("#store-approval-older")
    await reviewer.wait("document.getElementById('store-approval-status').textContent.includes('sayfa 2') || document.getElementById('store-approval-status').textContent.includes('Bu sayfada')")
    assert.equal(await reviewer.eval("document.getElementById('store-approval-newer').hidden"),false)
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),false)
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(olderPending.name)})`),true)
    await reviewer.click("#store-approval-list button")
    await until(async()=>{
      const rows=await native.listSellers({id:olderPending.id})
      return rows.length===1&&rows[0].status==="open"&&!!rows[0].approved_at
    },19000,"B22 older native pending Seller approval from page 2")
    // Suspend only this older task-owned Seller so the pre-existing Owner
    // and new Seller positive/negative expectations remain independent.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:olderPending.id,reason:"B22 task-only older Store suspension"
    }})
    assert.equal((await native.listSellers({id:olderPending.id}))[0].status,"suspended")
    await reviewer.click("#store-approval-newer")
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===1")
    assert.equal(await reviewer.eval(`document.getElementById('store-approval-list').textContent.includes(${JSON.stringify(applicationName)})`),true)
    // The real browser button invokes the project-owned staff-only adapter,
    // which reuses Mercur's native pending→open approval workflow.
    await reviewer.click("#store-approval-list button")
    // Verify the real browser network action AND native committed Seller state.
    // A temporary status message is not a durable success contract: the
    // privacy epoch may conceal an inactive browser while the POST completes.
    await until(async()=>{
      const http=reviewer.http.filter((x:any)=>x.path==="/personal/platform/stores"&&x.method==="POST")
      const current=await native.listSellers({id:ownerStoreId})
      return http.some((x:any)=>x.status===200)&&current.length===1&&
        current[0].status==="open"&&!!current[0].approved_at
    },19000,"B22 reviewer HTTP200 and native approval")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("!document.getElementById('workspace').hidden")
    await reviewer.wait("!document.getElementById('store-approval-panel').hidden")
    // Owner Store was approved, but the 31 historical Origin rows still
    // exist on older pages. Empty CURRENT page must offer older navigation,
    // not falsely imply the whole review backlog is empty.
    await reviewer.wait("document.querySelectorAll('#store-approval-list button').length===0 && document.getElementById('store-approval-status').textContent.includes('önceki başvurulara bakın.') && !document.getElementById('store-approval-older').hidden")
    assert.equal(await reviewer.eval("document.querySelectorAll('#store-approval-list button').length"),0,
      "Approved Store must disappear from the reviewer pending list on reload")
    const afterReview=await native.listSellers({id:ownerStoreId})
    assert.equal(afterReview.length,1)
    assert.equal(afterReview[0].status,"open")
    assert.ok(afterReview[0].approved_at)

    const [alphaMember]=await foundation.createMemberships([{
      organization_id:organizations[0].id,person_id:B.person,role:"member",
      status:"active",protected_owner:false
    }])
    // B22 buyer.purchase is Organization-scoped and NEVER inferred from
    // Owner/Member roles, native Customer or Store product permission.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")
    const buyerBefore=await get('/personal/buyer-permissions?organization_id='+organizations[0].id)
    assert.equal(buyerBefore.status,200)
    assert.deepEqual(buyerBefore.body.grants,[],"Owner has no automatic buyer.purchase permission")
    // An Organization Owner has no implicit procurement authority.
    const ownerBuyerContext=await get('/personal/buyer-context?organization_id='+
      encodeURIComponent(organizations[0].id))
    assert.equal(ownerBuyerContext.status,403)

    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where organization_id=$1`,[organizations[0].id]))[0].n,0)
    await browser.eval(`document.querySelector('#buyer-grants-form select[name=membership_id]').value=${JSON.stringify(alphaMember.id)}`)
    await browser.click('#buyer-grants-form button[value="grant"]')
    await until(async()=>{
      const rows=await q(`select id from da_organization_buyer_permission
        where person_id=$1 and organization_id=$2 and permission='buyer.purchase'
          and revoked_at is null`,[B.person,organizations[0].id])
      return rows.length===1
    },19000,"B22 real Chrome buyer permission issued")
    const [buyerGrant]=await q(`select id,source_audit_event_id,issued_by_person_id
      from da_organization_buyer_permission where person_id=$1
        and organization_id=$2 and revoked_at is null`,
      [B.person,organizations[0].id])
    assert.equal(buyerGrant.issued_by_person_id,A.person)
    assert.match(buyerGrant.id,/^dabpg_[A-Za-z0-9_-]+$/)
    const buyerProof=await q(`select e.action,e.actor_person_id,e.organization_id,
      e.target_id,x.id as outbox_id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.new_values->>'grant_id'=$2
        and e.new_values->>'person_id'=$3
        and e.new_values->>'permission'='buyer.purchase'`,
      [buyerGrant.source_audit_event_id,buyerGrant.id,B.person])
    assert.equal(buyerProof.length,1)
    assert.equal(buyerProof[0].action,"organization.buyer_permission_granted")
    assert.equal(buyerProof[0].actor_person_id,A.person)
    assert.equal(buyerProof[0].organization_id,organizations[0].id)
    assert.equal(buyerProof[0].target_id,B.person)
    const buyerRequest={action:"grant",organization_id:organizations[0].id,
      membership_id:alphaMember.id}
    const repeatBuyer=await browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(buyerRequest)})
      });return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(repeatBuyer.status,200)
    assert.equal(repeatBuyer.body.grant_id,buyerGrant.id)
    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where person_id=$1 and organization_id=$2`,
      [B.person,organizations[0].id]))[0].n,1)
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const rejectedBuyer=await reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(buyerRequest)})
      });return response.status
    })()`)
    assert.equal(rejectedBuyer,403,
      "Other Org Owner / platform staff cannot issue buyer.purchase in Alpha")
    const foreignBuyer=await reviewer.eval(`(async()=>{
      const response=await fetch('/personal/buyer-permissions?organization_id=${encodeURIComponent(organizations[0].id)}')
      return response.status
    })()`)
    assert.equal(foreignBuyer,403,"Non-Owner cannot enumerate buyer grants")
    // Before secondary dual proof the Alpha buyer grant is not sufficient
    // to establish which current native Customer belongs to Person B.
    const customerContext=(org:string)=>'/personal/buyer-context?organization_id='+
      encodeURIComponent(org)+'&customer=verified'
    const unlinkedCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return r.status
    })()`)
    assert.equal(unlinkedCustomer,403,
      "buyer.purchase must not infer Customer from email, native registration or role")
    // Real primary Chrome session + real native secondary password/TOTP
    // via the existing supported dual-proof personal account link.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    await reviewer.eval("document.querySelector('#link-account select[name=actor_type]').value='customer'")
    await reviewer.input("#link-account input[name=email]",customerEmail)
    await reviewer.input("#link-account input[name=password]",customerPassword)
    await reviewer.click("#link-account button")
    await reviewer.wait("!document.getElementById('link-confirm').hidden")
    await until(async()=>Math.floor(Date.now()/30000)>customerEnrollCounter,
      45000,"Customer TOTP challenge must not reuse enrollment window")
    await reviewer.input("#link-confirm input[name=code]",otp(customerMfa.secret))
    await reviewer.click("#link-confirm button")
    await reviewer.wait("document.getElementById('status').textContent==='Hesap bağlantısı tamamlandı'")
    const verifiedCustomerBinding=await q(`select actor_id,proof_reference
      from da_verified_actor_binding
      where person_id=$1 and actor_type='customer' and revoked_at is null`,
      [B.person])
    assert.equal(verifiedCustomerBinding.length,1)
    assert.equal(verifiedCustomerBinding[0].actor_id,nativeCustomer.id)
    assert.match(verifiedCustomerBinding[0].proof_reference,/^dual-proof:/)
    const readyCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')}
    })()`)
    assert.equal(readyCustomer.status,200)
    assert.deepEqual(readyCustomer.body,{
      organization_id:organizations[0].id,
      status:"buyer_customer_verified",checkout_ready:false
    })
    assert.match(readyCustomer.cache,/no-store/)
    // The native Cart Module only proves Customer↔Cart; the legal Buyer
    // Organization↔Cart association and per-Store blocks remain unverified.
    const buyerCart=(org:string,cart:string)=>
      customerContext(org)+'&cart_id='+encodeURIComponent(cart)
    const readNativeCart=async(url:string)=>reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(url)})
      return {status:r.status,body:await r.json()}
    })()`)
    const validCart=await readNativeCart(buyerCart(organizations[0].id,customerCart.id))
    assert.equal(validCart.status,200)
    assert.deepEqual(validCart.body,{
      organization_id:organizations[0].id,status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:false
    })
    const foreignCartCheck=await readNativeCart(buyerCart(organizations[0].id,foreignCart.id))
    assert.equal(foreignCartCheck.status,403)
    assert.deepEqual(foreignCartCheck.body,{message:"Access denied"})
    const absentCartCheck=await readNativeCart(buyerCart(organizations[0].id,
      "cart_absent_"+rand))
    assert.equal(absentCartCheck.status,403)
    const noCustomerProof=await readNativeCart("/personal/buyer-context?organization_id="+
      encodeURIComponent(organizations[0].id)+"&cart_id="+encodeURIComponent(customerCart.id))
    assert.equal(noCustomerProof.status,400)
    const foreignOrganizationCart=await readNativeCart(
      buyerCart(organizations[1].id,customerCart.id))
    assert.equal(foreignOrganizationCart.status,403)
    assert.equal((await cartService.listCarts({
      id:customerCart.id,customer_id:nativeCustomer.id
    })).length,1,"Read-only preflight must not mutate cart")
    process.stdout.write("PASS B22 native cart ownership: real Medusa Cart belongs to verified Customer, foreign and missing carts denied, Org not attributed, no payment or checkout\\n")

    // Bind this real native Customer Cart once to legal Organization Alpha.
    // This is a Foundation audit transaction, NOT native cart metadata.
    const claimCart=async(organization_id:string,cart_id:string)=>{
      return reviewer.eval(`(async()=>{
        const s=await(await fetch('/personal/session')).json()
        const r=await fetch('/personal/buyer-context',{
          method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
          body:JSON.stringify(${JSON.stringify({action:"attribute",organization_id,cart_id})})
        })
        return {status:r.status,body:await r.json()}
      })()`)
    }
    const attributionBefore=await q(`select count(*)::int n
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id])
    assert.equal(attributionBefore[0].n,0)
    const foreignClaim=await claimCart(organizations[0].id,foreignCart.id)
    assert.equal(foreignClaim.status,403)
    const claimed=await claimCart(organizations[0].id,customerCart.id)
    assert.equal(claimed.status,200)
    assert.deepEqual(claimed.body,{status:"attributed",
      organization_id:organizations[0].id,checkout_ready:false})
    const sameClaim=await claimCart(organizations[0].id,customerCart.id)
    assert.equal(sameClaim.status,200)
    assert.deepEqual(sameClaim.body,claimed.body)
    const [attributed]=await q(`select a.person_id,a.customer_id,a.organization_id,
      a.source_audit_event_id,e.action,e.actor_person_id,e.new_values,
      x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[customerCart.id])
    assert.equal(attributed.person_id,B.person)
    assert.equal(attributed.customer_id,nativeCustomer.id)
    assert.equal(attributed.organization_id,organizations[0].id)
    assert.equal(attributed.actor_person_id,B.person)
    assert.equal(attributed.action,"organization.buyer_cart_attributed")
    assert.equal(attributed.new_values.cart_id,customerCart.id)
    assert.equal(attributed.new_values.customer_id,nativeCustomer.id)
    assert.equal((await q(`select count(*)::int n
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id]))[0].n,1)
    const afterClaim=await readNativeCart(buyerCart(organizations[0].id,customerCart.id))
    assert.equal(afterClaim.status,200)
    assert.deepEqual(afterClaim.body,{organization_id:organizations[0].id,
      status:"native_customer_cart_verified",
      checkout_ready:false,organization_attributed:true})
    const otherOrgClaim=await claimCart(organizations[1].id,customerCart.id)
    assert.equal(otherOrgClaim.status,403)
    assert.equal((await q(`select count(*)::int n from da_buyer_cart_attribution
      where cart_id=$1 and organization_id=$2`,
      [customerCart.id,organizations[0].id]))[0].n,1)
    const noCsrf=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(${JSON.stringify({action:"attribute",
          organization_id:organizations[0].id,cart_id:customerCart.id})})
      });return r.status
    })()`)
    assert.equal(noCsrf,403)
    assert.equal((await cartService.listCarts({
      id:customerCart.id,customer_id:nativeCustomer.id
    })).length,1,"Attribution must not modify native Cart")
    // Real empty Cart cannot prove sellable Store coverage or buyer block.
    const inspected=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(inspected.status,200)
    assert.deepEqual(inspected.body,{
      organization_id:organizations[0].id,status:"seller_scope_empty",
      seller_count:0,seller_block_verified:false,checkout_ready:false
    })
    assert.equal((await readNativeCart(buyerCart(organizations[1].id,
      customerCart.id)+"&seller_scope=inspect")).status,403)
    assert.equal((await readNativeCart(
      "/personal/buyer-context?organization_id="+
      encodeURIComponent(organizations[0].id)+"&seller_scope=inspect")).status,400)

    // The second participating Store uses the SAME real Owner application
    // and independent platform native approval pathway, not synthetic links.
    // One Organization may own multiple individually approved Stores (#37).
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    const secondApplicationId="daapp_"+randomBytes(16).toString("hex")
    const secondApplication={
      organization_id:organizations[0].id,application_id:secondApplicationId,
      name:"B22 second Owner Store "+rand,
      email:"b22-second-owner-store-"+rand+"@example.invalid",currency_code:"try"
    }
    const secondSubmission=await submit(secondApplication)
    assert.equal(secondSubmission.status,201,
      "Second Store must use authenticated Owner application path")
    const secondOwnerStoreId=secondSubmission.body.seller_id as string
    assert.match(secondOwnerStoreId,/^sel_[A-Za-z0-9_-]+$/)
    assert.notEqual(secondOwnerStoreId,ownerStoreId)
    const preApproval=await native.listSellers({id:secondOwnerStoreId})
    assert.equal(preApproval.length,1)
    assert.equal(preApproval[0].status,"pending_approval")
    assert.equal(preApproval[0].approved_at,null)
    const secondOrigin=await q(`select o.organization_id,e.action,
      x.id as outbox_id from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1 and o.revoked_at is null`,[secondOwnerStoreId])
    assert.equal(secondOrigin.length,1)
    assert.equal(secondOrigin[0].organization_id,organizations[0].id)
    assert.equal(secondOrigin[0].action,"organization.store_application_created")
    assert.equal((await get(selected(organizations[0].id))).body.stores
      .some((store:any)=>store.id===secondOwnerStoreId),false,
      "Pending second Store cannot be used for commerce")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const secondApproval=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:secondApplicationId,seller_id:secondOwnerStoreId
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(secondApproval.status,200,
      "Only explicit platform staff can approve the second Owner Store")
    assert.equal(secondApproval.body.status,"open")
    const secondApproved=await native.listSellers({id:secondOwnerStoreId})
    assert.equal(secondApproved.length,1)
    assert.equal(secondApproved[0].status,"open")
    assert.ok(secondApproved[0].approved_at)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    assert.deepEqual(new Set((await get(selected(organizations[0].id)))
      .body.stores.map((store:any)=>store.id)),
      new Set([ownerStoreId,secondOwnerStoreId]),
      "Both platform-linked native approved Stores belong to Alpha only")
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    process.stdout.write("PASS B22 second Owner Store: real application and separate platform approval, two audited Org→Store links, native pending denied then approved; no automatic permission\\n")

    // Positive REAL native multi-Store Cart, no synthetic Graph mocks:
    // Medusa published master variant, Mercur's per-Seller Offer workflow,
    // and Medusa's native addToCartWorkflow with Mercur's Offer hooks.
    // All resources exist solely in this guarded disposable PG16 CI database.
    const {result:[b22Profile]}=await createShippingProfilesWorkflow(container).run({
      input:{data:[{name:"B22 two-Store Offer profile "+rand,type:"default"}]}
    })
    assert.match(b22Profile.id,/^sp_[A-Za-z0-9_-]+$/)
    const {result:[sellableProduct]}=await createProductsWorkflow(container).run({
      input:{created_by:stores[0].id,products:[{
        title:"B22 two-Store shared master "+rand,status:"published",
        variants:[{title:"One size",sku:"B22-NATIVE-"+rand}]
      }]}
    })
    // Mercur's product workflow result is the master product projection;
    // variants are not guaranteed populated. Read the ACTUAL persisted
    // native Medusa Product module, never infer a variant from output shape.
    const persistedVariants=await container.resolve("product").listProductVariants({
      product_id:sellableProduct.id
    })
    assert.equal(persistedVariants.length,1)
    const variant=persistedVariants[0]
    assert.match(variant.id,/^variant_[A-Za-z0-9_-]+$/)
    // Mercur 2.3.7 createOffersWorkflow's seller-inventory step obtains
    // its Seller from offers[0], so use one run per Seller, not a mixed batch.
    const offerRows:Array<{id:string;seller_id:string}>=[]
    // Both participating native Stores used real Owner application and
    // independent platform approval. Other Sellers are not silently included.
    const cartStoreIds=[ownerStoreId,secondOwnerStoreId]
    for(let i=0;i<2;i++){
      const sku="B22-TWO-STORE-"+i+"-"+rand
      const {result:[offer]}=await createOffersWorkflow(container).run({
        input:{offers:[{
          seller_id:cartStoreIds[i],created_by:member.id,
          sku,variant_id:variant.id,shipping_profile_id:b22Profile.id,
          inventory_items:[{sku,stock_levels:[]}],
          prices:[{amount:1000+i*100,currency_code:"eur"}],
          manage_inventory:false,allow_backorder:true
        }]}
      })
      assert.match(offer.id,/^offer_[A-Za-z0-9_-]+$/)
      assert.equal(offer.seller_id,cartStoreIds[i])
      offerRows.push(offer)
    }
    // Use a task-only sales channel and region for native cart pricing.
    const sales=container.resolve("sales_channel")
    const market=await sales.createSalesChannels({name:"B22 two-Store channel "+rand})
    const regions=container.resolve("region")
    const region=await regions.createRegions({
      name:"B22 two-Store region "+rand,currency_code:"eur",countries:[]
    })
    await cartService.updateCarts(customerCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    for(const offer of offerRows){
      await addToCartWorkflow(container).run({input:{
        cart_id:customerCart.id,items:[{
          variant_id:variant.id,offer_id:offer.id,
          quantity:1,requires_shipping:true,metadata:{offer_id:offer.id}
        } as any] // Mercur's installed Offer augmentation is runtime-registered.
        // The downstream Medusa DTO alone lacks this Mercur-specific field.
      }})
    }
    const nativeTwoStore=await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })
    assert.equal(nativeTwoStore.items?.length,2)
    assert.equal(nativeTwoStore.customer_id,nativeCustomer.id)
    assert.equal(nativeTwoStore.completed_at,null)
    const query=container.resolve("query")
    const {data:graphTwoStore}=await query.graph({entity:"cart",fields:[
      "id","items.id","items.offer.id","items.offer.seller_id"
    ],filters:{id:customerCart.id}})
    assert.equal(graphTwoStore.length,1)
    assert.equal(graphTwoStore[0].items.length,2)
    assert.deepEqual(
      new Set(graphTwoStore[0].items.map((line:any)=>line.offer?.seller_id)),
      new Set(cartStoreIds)
    )
    assert.deepEqual(
      new Set(graphTwoStore[0].items.map((line:any)=>line.offer?.id)),
      new Set(offerRows.map(o=>o.id))
    )
    const twoStoreScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(twoStoreScope.status,200)
    assert.deepEqual(twoStoreScope.body,{
      organization_id:organizations[0].id,status:"seller_scope_mapped",
      seller_count:2,seller_block_verified:true,checkout_ready:false
    })
    assert.equal((await readNativeCart(buyerCart(organizations[1].id,
      customerCart.id)+"&seller_scope=inspect")).status,403)
    // B22 #76: strong Foundation Owner A has the actual platform-approved
    // Store association. B is only Alpha buyer/member and cannot issue Store
    // policy. Native Member/SellerMember alone is not the issuer grant.
    const changeStoreBlock=async(action:"block"|"unblock")=>browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify({action,organization_id:organizations[0].id,
          seller_id:ownerStoreId,buyer_organization_id:organizations[0].id})})
      })
      return {status:r.status,body:await r.json()}
    })()`)
    // Native Chrome Owner control, not merely an HTTP request through CDP.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.send("Page.reload",{ignoreCache:true})
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('store-block-panel').hidden")
    await browser.eval(`document.querySelector('#store-block-form select[name=seller_id]').value=${JSON.stringify(ownerStoreId)}`)
    await browser.input('#store-block-form input[name=buyer_organization_id]',
      organizations[0].id)
    await browser.click('#store-block-form button[value="block"]')
    await browser.wait("document.getElementById('store-block-status').textContent.includes('engellendi')")
    assert.ok(browser.http.some((x:any)=>x.path==="/personal/store-buyer-blocks"&&
      x.method==="POST"&&x.status===200),"Owner's visible policy form must POST 200")
    assert.equal((await changeStoreBlock("block")).status,200,
      "Replay must not write another active block")
    // Admin of the other Organization cannot use the same native member
    // association to manage Alpha's Store, nor can SellerMember alone.
    const wrongOwner=await browser.eval(`(async()=>{
      const token=(await(await fetch('/personal/session')).json()).csrf_token
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},
        body:JSON.stringify(${JSON.stringify({action:"block",
          organization_id:organizations[1].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[0].id})})
      });return r.status
    })()`)
    assert.equal(wrongOwner,403)
    const noBlockCsrf=await browser.eval(`(async()=>{
      const r=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(${JSON.stringify({action:"unblock",
          organization_id:organizations[0].id,seller_id:ownerStoreId,
          buyer_organization_id:organizations[0].id})})
      });return r.status
    })()`)
    assert.equal(noBlockCsrf,403)
    assert.equal((await q(`select count(*)::int n from da_store_buyer_organization_block
      where seller_id=$1 and buyer_organization_id=$2 and revoked_at is null`,
      [ownerStoreId,organizations[0].id]))[0].n,1)
    const blockedScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(blockedScope.status,403)
    assert.deepEqual(blockedScope.body,{message:"Access denied"})
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A Store Buyer Organization block committed before L must deny checkout")
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2)
    await browser.click('#store-block-form button[value="unblock"]')
    await browser.wait("document.getElementById('store-block-status').textContent.includes('kaldırıldı')")
    assert.equal((await changeStoreBlock("unblock")).status,200,
      "Replay must not erase revocation history")
    assert.equal((await q(`select count(*)::int n from da_store_buyer_organization_block
      where seller_id=$1 and buyer_organization_id=$2 and revoked_at is null`,
      [ownerStoreId,organizations[0].id]))[0].n,0)
    assert.deepEqual((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")).body,
      twoStoreScope.body)
    // Each Store has an independent Buyer Organization policy. B-only block
    // must never be read as an Alpha global organization suspension.
    const changeSecondBlock=async(action:"block"|"unblock")=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action,organization_id:organizations[0].id,
          seller_id:secondOwnerStoreId,
          buyer_organization_id:organizations[0].id
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal((await changeSecondBlock("block")).status,200)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,1)
    const onlySecondBlocked=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(onlySecondBlocked.status,403)
    assert.deepEqual(onlySecondBlocked.body,{message:"Access denied"})
    // Unblocking A must not undo B's block. Re-block A, then unblock it
    // independently while B stays active: full scope remains denied.
    assert.equal((await changeStoreBlock("block")).status,200)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,2)
    assert.equal((await changeStoreBlock("unblock")).status,200)
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")).status,403)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,1)
    assert.equal((await changeSecondBlock("unblock")).status,200)
    const allUnblocked=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(allUnblocked.status,200)
    assert.deepEqual(allUnblocked.body,twoStoreScope.body)
    assert.equal(allUnblocked.body.seller_block_verified,true)
    // The single Foundation decision is positive only for the exact immutable
    // Alpha attribution, verified Customer and both currently unblocked Stores.
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),true,"B22 final checkout snapshot must allow the exact current legal Buyer scope")
    assert.equal(await foundation.authorizeBuyerCheckout(
      foreignCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A foreign native Cart has no Alpha legal attribution")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,foreignNativeCustomer.id,cartStoreIds
    ),false,"A different native Customer cannot borrow the immutable attribution")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,[...cartStoreIds,"sel_missing_checkout"]
    ),false,"Every native Offer Seller must have a matching approved Organization origin")
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2)
    assert.equal((await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is not null`,
      [organizations[0].id]))[0].n,3,
      "Both independent Store block revocation histories must persist")
    process.stdout.write("PASS B22 two platform-approved Stores: each Store's buyer block separately denies whole multi-Store scope; unblock A cannot lift B; both unblocked restores 200, no cart writes\\n")
    process.stdout.write("PASS B22 audited Owner Store Buyer Organization block: two-Store scope 403 if one blocked, idempotent unblock restores 200; no checkout\\n")
    // One native Seller suspended means NO partially authorized two-Store
    // scope. The native workflow restores the task's prior approved state.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:secondOwnerStoreId,reason:"B22 task-only cart Seller suspension negative"
    }})
    assert.equal((await native.listSellers({id:secondOwnerStoreId}))[0].status,"suspended")
    const suspendedScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(suspendedScope.status,403)
    assert.deepEqual(suspendedScope.body,{message:"Access denied"})
    assert.equal((await cartService.retrieveCart(customerCart.id,{
      relations:["items"]
    })).items?.length,2,"Suspension must not silently mutate cart")
    await unsuspendSellerWorkflow(container).run({input:{seller_id:secondOwnerStoreId}})
    const restoredScope=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id)+"&seller_scope=inspect")
    assert.equal(restoredScope.status,200)
    assert.deepEqual(restoredScope.body,twoStoreScope.body)
    // Later historical fixtures expect only the original Owner Store
    // enabled. Retain the second Store's audited link and history, but
    // suspend only this disposable native Store before old list assertions.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:secondOwnerStoreId,
      reason:"B22 task-only second Store isolated from later fixture"
    }})
    process.stdout.write("PASS B22 native Seller suspension: one Store suspends -> entire two-Store scope 403, native reopen -> 200; no checkout\\n")
    process.stdout.write("PASS B22 real two-Store Offer Cart: native Mercur Offers and Medusa addToCartWorkflow persist 2 separate Seller links; Chrome read-only scope counts 2 with both Store origin links verified and checkout closed\\n")


    process.stdout.write("PASS B22 audited Buyer Organization Cart attribution: real Chrome POST + Foundation PG16 audit/outbox, exact replay, foreign Customer/Organization denied, no Medusa cart mutation or checkout\\n")

    const wrongCustomerOrg=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[1].id))})
      return r.status
    })()`)
    assert.equal(wrongCustomerOrg,403)
    const forgedCustomer=await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id)+"&customer_id=cus_foreign")})
      return r.status
    })()`)
    assert.equal(forgedCustomer,400)
    // Dual-proof linking updates the active privacy epoch. If the Organization
    // workspace was concealed, restore it via a real Chrome navigation and
    // server-validated Organization selection. Never fake document.hidden.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    if(!await reviewer.eval("!document.getElementById('workspace').hidden && !document.getElementById('buyer-context-panel').hidden")){
      await reviewer.send("Page.reload",{ignoreCache:true})
      await reviewer.wait("document.getElementById('workspace').hidden===false")
      await reviewer.select(organizations[0].name,"member")
      await reviewer.wait("!document.getElementById('buyer-context-panel').hidden")
    }
    await reviewer.click('#buyer-customer-check')
    await reviewer.wait("document.getElementById('buyer-customer-status').textContent.includes('Kuruluş izni ve mevcut müşteri bağınız doğrulandı')")
    process.stdout.write("PASS B22 linked Customer profile reload and buyer Organization privacy-safe UI check\\n")
    assert.equal((await q(`select count(*)::int n from da_verified_actor_binding
      where person_id=$1 and actor_type='customer' and revoked_at is null`,
      [B.person]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: live Customer dual-proof binding + Alpha buyer.purchase / native Customer module, wrong Buyer Org 403, forged Customer 400, no JWT/checkout writer\\n")
    // B is Alpha Member and Beta Owner, but the selected legal buyer must
    // always be Alpha when Alpha's explicit buyer.purchase is granted.
    const verifiedBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}')
      return {status:r.status,body:await r.json()}
    })()`)
    assert.equal(verifiedBuyer.status,200)
    assert.deepEqual(verifiedBuyer.body,{
      organization_id:organizations[0].id,
      status:"buyer_permission_verified",checkout_ready:false
    })
    const wrongBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[1].id)}')
      return r.status
    })()`)
    assert.equal(wrongBuyer,403,"Beta Owner role cannot invent buyer.purchase")

    // Even when B explicitly gains buyer.purchase in TWO Organizations, the
    // same native Cart cannot be silently reassigned from Alpha to Beta.
    // This tests the unique immutable attribution, not only missing permission.
    const ownBetaMembership=memberships[1]
    const betaPermission=async(action:"grant"|"revoke")=>reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/buyer-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action,organization_id:organizations[1].id,
          membership_id:ownBetaMembership.id
        })})
      });return {status:r.status,body:await r.json()}
    })()`)
    assert.equal((await betaPermission("grant")).status,200)
    const betaCartEligible=await readNativeCart(buyerCart(organizations[1].id,customerCart.id))
    assert.equal(betaCartEligible.status,200)
    assert.equal(betaCartEligible.body.organization_attributed,false,
      "Native Customer is valid for Beta, but Alpha's attribution must remain exclusive")
    assert.equal((await claimCart(organizations[1].id,customerCart.id)).status,403,
      "Authorized Beta buyer cannot steal Cart already attributed to Alpha")
    const unchangedCart=await q(`select organization_id,source_audit_event_id
      from da_buyer_cart_attribution where cart_id=$1`,[customerCart.id])
    assert.equal(unchangedCart.length,1)
    assert.equal(unchangedCart[0].organization_id,organizations[0].id)
    assert.equal(unchangedCart[0].source_audit_event_id,attributed.source_audit_event_id)

    // B22 cross-Organization commercial scope: independent seller companies
    // Alpha and Gamma, third independent legal Buyer Beta. Person A is a
    // real protected Owner of BOTH seller Orgs via separate memberships.
    // B is Beta Owner and the same dual-proof Customer, without a separate
    // buyer login or any automatic buyer.purchase permission.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(sellerGamma.name,"owner")
    const gammaApplication={
      organization_id:sellerGamma.id,
      application_id:"daapp_"+randomBytes(16).toString("hex"),
      name:"B22 Gamma independent Store "+rand,
      email:"b22-gamma-store-"+rand+"@example.invalid",currency_code:"try"
    }
    const gammaSubmitted=await submit(gammaApplication)
    assert.equal(gammaSubmitted.status,201)
    const gammaSellerId=gammaSubmitted.body.seller_id as string
    assert.match(gammaSellerId,/^sel_[A-Za-z0-9_-]+$/)
    assert.notEqual(gammaSellerId,ownerStoreId)
    assert.equal((await native.listSellers({id:gammaSellerId}))[0].status,
      "pending_approval")
    const gammaLink=await q(`select o.organization_id,e.action,x.id as outbox_id
      from da_organization_seller_ownership o
      join da_audit_event e on e.id=o.verification_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where o.seller_id=$1 and o.revoked_at is null`,[gammaSellerId])
    assert.equal(gammaLink.length,1)
    assert.equal(gammaLink[0].organization_id,sellerGamma.id)
    assert.equal(gammaLink[0].action,"organization.store_application_created")
    assert.deepEqual((await get(selected(sellerGamma.id))).body.stores,[],
      "Gamma Store must be denied before separate platform approval")
    const wrongGammaApproval=await browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      return (await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:gammaApplication.application_id,
          seller_id:gammaSellerId
        })})
      })).status
    })()`)
    assert.equal(wrongGammaApproval,403,
      "Gamma Owner cannot grant themselves the platform approver task")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const gammaApproved=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          application_id:gammaApplication.application_id,
          seller_id:gammaSellerId
        })})
      })
      return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(gammaApproved.status,200)
    assert.equal(gammaApproved.body.status,"open")
    assert.equal((await native.listSellers({id:gammaSellerId}))[0].status,"open")
    assert.equal((await get(selected(sellerGamma.id))).body.stores[0].id,
      gammaSellerId)
    const alphaAfterGamma=(await get(selected(organizations[0].id))).body.stores
    assert.deepEqual(alphaAfterGamma.map((store:any)=>store.id),
      [ownerStoreId],
      "Gamma must not enter Alpha; previously suspended second Alpha Store stays excluded")
    assert.equal(alphaAfterGamma.some((store:any)=>store.id===gammaSellerId),false)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    const gammaSku="B22-GAMMA-BETA-"+rand
    const {result:[gammaOffer]}=await createOffersWorkflow(container).run({
      input:{offers:[{
        seller_id:gammaSellerId,created_by:member.id,
        sku:gammaSku,variant_id:variant.id,
        shipping_profile_id:b22Profile.id,
        inventory_items:[{sku:gammaSku,stock_levels:[]}],
        prices:[{amount:1200,currency_code:"eur"}],
        manage_inventory:false,allow_backorder:true
      }]}
    })
    assert.equal(gammaOffer.seller_id,gammaSellerId)
    const betaTwoSellerCart=await cartService.createCarts({
      currency_code:"eur",customer_id:nativeCustomer.id
    })
    await cartService.updateCarts(betaTwoSellerCart.id,{
      region_id:region.id,sales_channel_id:market.id
    })
    for(const offer of [offerRows[0],gammaOffer]){
      await addToCartWorkflow(container).run({input:{
        cart_id:betaTwoSellerCart.id,
        items:[{variant_id:variant.id,offer_id:offer.id,
          quantity:1,requires_shipping:true,
          metadata:{offer_id:offer.id}} as any]
      }})
    }
    const betaNative=await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })
    assert.equal(betaNative.items?.length,2)
    assert.equal(betaNative.customer_id,nativeCustomer.id)
    assert.equal(betaNative.completed_at,null)
    const {data:betaGraph}=await query.graph({
      entity:"cart",fields:["id","items.id","items.offer.id",
        "items.offer.seller_id"],
      filters:{id:betaTwoSellerCart.id}
    })
    assert.equal(betaGraph.length,1)
    assert.deepEqual(new Set(betaGraph[0].items.map((line:any)=>
      line.offer?.seller_id)),new Set([ownerStoreId,gammaSellerId]))
    const betaClaim=await claimCart(organizations[1].id,betaTwoSellerCart.id)
    assert.equal(betaClaim.status,200)
    assert.equal(betaClaim.body.organization_id,organizations[1].id)
    assert.equal(betaClaim.body.checkout_ready,false)
    const betaAttribution=await q(`select a.organization_id,e.action,
      x.id as outbox_id from da_buyer_cart_attribution a
      join da_audit_event e on e.id=a.source_audit_event_id
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where a.cart_id=$1`,[betaTwoSellerCart.id])
    assert.equal(betaAttribution.length,1)
    assert.equal(betaAttribution[0].organization_id,organizations[1].id)
    assert.equal(betaAttribution[0].action,"organization.buyer_cart_attributed")
    const alphaPreflight=await readNativeCart(
      buyerCart(organizations[0].id,betaTwoSellerCart.id))
    assert.equal(alphaPreflight.status,200,
      "Native Customer preflight is not a Cart ownership or checkout grant")
    assert.equal(alphaPreflight.body.organization_attributed,false)
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,betaTwoSellerCart.id)+
      "&seller_scope=inspect")).status,403,
      "Explicit Alpha buyer grant cannot inspect Beta's attributed Seller Cart")
    const betaScopeUrl=buyerCart(organizations[1].id,betaTwoSellerCart.id)+
      "&seller_scope=inspect"
    const betaOpenScope=await readNativeCart(betaScopeUrl)
    assert.equal(betaOpenScope.status,200)
    assert.deepEqual(betaOpenScope.body,{
      organization_id:organizations[1].id,status:"seller_scope_mapped",
      seller_count:2,seller_block_verified:true,checkout_ready:false
    })
    // B22 native checkout ingress boundary: Mercur 2.3.7 overrides
    // POST /store/carts/:id/complete with its split-order writer. Before
    // any financial/provider or order flow is authorized, the existing
    // personal ingress must reject this native route, even for a valid
    // signed-in Buyer, a Store Owner and a forged native Bearer.
    // No payment session is created; a nonzero two-Offer Cart remains open.
    const nativeCompletePath="/store/carts/"+
      encodeURIComponent(betaTwoSellerCart.id)+"/complete"
    // Without an API key, Medusa rejects the request before the DoğruAdres
    // ingress can run. Use its supported native workflow and a disposable
    // test-only publishable key to prove the INNER security boundary too.
    const {result:[b22PublishableKey]}=await createApiKeysWorkflow(container).run({
      input:{api_keys:[{title:"B22 isolated native checkout denial "+rand,
        type:"publishable",created_by:""}]}
    })
    assert.equal(typeof b22PublishableKey.id,"string")
    assert.equal(typeof b22PublishableKey.token,"string")
    assert.ok(b22PublishableKey.token.length>20)
    await linkSalesChannelsToApiKeyWorkflow(container).run({input:{
      id:b22PublishableKey.id,add:[market.id]
    }})
    // Medusa's API Key module distinguishes the internal apk_ ID from the
    // public pk_ token used in the Store HTTP header. Never log the token.
    const keyHeaders={"x-publishable-api-key":b22PublishableKey.token}
    assert.equal((await q(`select count(*)::int n from order_group
      where cart_id=$1`,[betaTwoSellerCart.id]))[0].n,0)
    const tryNativeCompletion=async(actor:B06Chrome,
      additionalHeaders:Record<string,string>={})=>actor.eval(`(async()=>{
      const response=await fetch(${JSON.stringify(nativeCompletePath)},{
        method:"POST",headers:${JSON.stringify(additionalHeaders)}
      })
      return {status:response.status,body:await response.json()}
    })()`)
    const missingKey=await tryNativeCompletion(reviewer)
    assert.equal(missingKey.status,400,
      "No-key request should fail Medusa's publishable-key preflight")
    assert.equal(missingKey.body?.type,"not_allowed")
    assert.match(missingKey.body?.message??"",/Publishable API key required/)
    for(const actor of [reviewer,browser]){
      const denied=await tryNativeCompletion(actor,keyHeaders)
      assert.equal(denied.status,401,
        "Native checkout with valid Store key returned "+denied.status+
        "; body="+JSON.stringify(denied.body).slice(0,380)+
        "; only the personal ingress denial proves checkout is closed")
      assert.deepEqual(denied.body,{
        message:"Personal session ingress required"
      })
    }
    const forgedNative=await tryNativeCompletion(reviewer,{
      ...keyHeaders,authorization:"Bearer b22-untrusted-not-a-token"
    })
    assert.equal(forgedNative.status,401,
      "An unverified native credential cannot enter the order writer")
    assert.deepEqual(forgedNative.body,{
      message:"Personal session ingress required"
    })
    assert.equal((await q(`select count(*)::int n from order_group
      where cart_id=$1`,[betaTwoSellerCart.id]))[0].n,0,
      "No OrderGroup is created by a denied checkout attempt")
    const afterDenied=await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })
    assert.equal(afterDenied.completed_at,null)
    assert.equal(afterDenied.items?.length,2)
    assert.equal((await readNativeCart(betaScopeUrl)).status,200,
      "A denied native checkout must not damage valid read-only Buyer scope")
    process.stdout.write("PASS B22 Mercur native split-order POST ingress: real Buyer/Owner/forged Bearer 401, zero OrderGroups, unchanged two-item Cart; no payment or checkout writer\\n")

    const betaSellerBlock=async(action:"block"|"unblock",
      sellerOrg:string,sellerId:string)=>browser.eval(`(async()=>{
        const session=await(await fetch('/personal/session')).json()
        const response=await fetch('/personal/store-buyer-blocks',{
          method:'POST',headers:{'content-type':'application/json',
            'x-csrf-token':session.csrf_token},
          body:JSON.stringify(${JSON.stringify({
            action,organization_id:sellerOrg,seller_id:sellerId,
            buyer_organization_id:organizations[1].id
          })})
        })
        return {status:response.status,body:await response.json()}
      })()`)
    assert.equal((await betaSellerBlock("block",organizations[0].id,
      gammaSellerId)).status,403,
      "Alpha Owner scope cannot issue Gamma Store's policy")
    const wrongBetaIssuer=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      return (await fetch('/personal/store-buyer-blocks',{
        method:'POST',headers:{'content-type':'application/json',
          'x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({
          action:"block",organization_id:sellerGamma.id,
          seller_id:gammaSellerId,
          buyer_organization_id:organizations[1].id
        })})
      })).status
    })()`)
    assert.equal(wrongBetaIssuer,403,
      "Buyer Organization Owner and staff may not control Gamma Seller policy")
    const activeBetaBlocks=async()=>{
      const [row]=await q(`select count(*)::int n
        from da_store_buyer_organization_block
        where buyer_organization_id=$1 and revoked_at is null`,
        [organizations[1].id])
      return row.n as number
    }
    assert.equal(await activeBetaBlocks(),0)
    assert.equal((await betaSellerBlock("block",organizations[0].id,
      ownerStoreId)).status,200)
    assert.equal(await activeBetaBlocks(),1)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403)
    // Alpha's earlier two-Store cart has its second Seller deliberately
    // suspended. Its native Customer/Organization ownership preflight still
    // works; do NOT expect sellable Seller scope from a suspended Store.
    const alphaBuyerPreflight=await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id))
    assert.equal(alphaBuyerPreflight.status,200)
    assert.equal(alphaBuyerPreflight.body.organization_attributed,true)
    assert.equal((await q(`select count(*)::int n from
      da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is null`,
      [organizations[0].id]))[0].n,0,
      "Beta-only Store policy must not create a block on Buyer Alpha")
    assert.equal((await betaSellerBlock("block",sellerGamma.id,
      gammaSellerId)).status,200)
    assert.equal(await activeBetaBlocks(),2)
    assert.equal((await betaSellerBlock("unblock",organizations[0].id,
      ownerStoreId)).status,200)
    assert.equal(await activeBetaBlocks(),1)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403,
      "Gamma Store's Beta block survives Alpha Store's independent unblock")
    assert.equal((await betaSellerBlock("unblock",sellerGamma.id,
      gammaSellerId)).status,200)
    assert.equal(await activeBetaBlocks(),0)
    assert.deepEqual((await readNativeCart(betaScopeUrl)).body,
      betaOpenScope.body)
    assert.equal((await cartService.retrieveCart(betaTwoSellerCart.id,{
      relations:["items"]
    })).items?.length,2,
      "No partial Cart mutation across separate seller companies")
    const [history]=await q(`select count(*)::int n
      from da_store_buyer_organization_block
      where buyer_organization_id=$1 and revoked_at is not null`,
      [organizations[1].id])
    assert.equal(history.n,2)
    assert.equal((await q(`select organization_id from
      da_buyer_cart_attribution where cart_id=$1`,
      [betaTwoSellerCart.id]))[0].organization_id,organizations[1].id)
    process.stdout.write("PASS B22 Alpha/Gamma separate legal Seller Organizations and Beta legal Buyer: two native Offers/Cart, two platform-approved Owner-origin links, wrong issuer 403, each Store block denies full scope, cross-Buyer isolation, independent unblock and audit history, checkout closed\\n")
    assert.equal((await betaPermission("revoke")).status,200)
    assert.equal((await readNativeCart(betaScopeUrl)).status,403,
      "Revoked buyer.purchase must remove Beta access even after both sellers unblock")
    process.stdout.write("PASS B22 explicit Beta grant cannot reassign Alpha Cart: both Organization buyer permissions tested; canonical audit ownership unchanged\\n")

    const forgedBuyer=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}&actor_id=cus_forged')
      return r.status
    })()`)
    assert.equal(forgedBuyer,400,"Forged Customer context rejected")
    // Actual browser selection, not only an HTTP request: B's newly-active
    // Alpha membership is refreshed before selecting that Organization.
    await reviewer.send("Page.reload",{ignoreCache:true})
    await reviewer.wait("document.getElementById('workspace').hidden===false")
    await reviewer.select(organizations[0].name,"member")
    await reviewer.wait("!document.getElementById('buyer-context-panel').hidden")
    assert.equal(await reviewer.eval(`document.getElementById('buyer-context-status').textContent.includes('Sepet ve ödeme henüz kullanıma açık değil')`),true)

    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('buyer-grants-panel').hidden")
    await browser.eval(`document.querySelector('#buyer-grants-form select[name=membership_id]').value=${JSON.stringify(alphaMember.id)}`)
    await browser.click('#buyer-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select revoked_at from da_organization_buyer_permission
        where id=$1`,[buyerGrant.id])
      return rows.length===1&&!!rows[0].revoked_at
    },19000,"B22 Chrome Owner revokes explicit buyer.purchase")
    const buyerRevoked=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.buyer_permission_revoked'
        and e.actor_person_id=$1 and e.organization_id=$2
        and e.target_id=$3 and e.previous_values->>'grant_id'=$4`,
      [A.person,organizations[0].id,B.person,buyerGrant.id])
    assert.equal(buyerRevoked[0].n,1,"Revocation must emit canonical outbox")
    assert.equal(await foundation.authorizeBuyerCheckout(
      customerCart.id,nativeCustomer.id,cartStoreIds
    ),false,"A buyer.purchase revocation committed before L must deny checkout")
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const deniedAfterRevoke=await reviewer.eval(`(async()=>{
      const r=await fetch('/personal/buyer-context?organization_id=${encodeURIComponent(organizations[0].id)}')
      return r.status
    })()`)
    assert.equal(deniedAfterRevoke,403,"Server rechecks revoked buyer.purchase")
    assert.equal((await readNativeCart(
      buyerCart(organizations[0].id,customerCart.id))).status,403,
      "Revoked buyer.purchase cannot read even its own native Cart")
    assert.equal((await claimCart(organizations[0].id,customerCart.id)).status,403,
      "Revoked buyer.purchase must not renew an earlier immutable Cart attribution")

    assert.equal(await reviewer.eval(`(async()=>{
      const r=await fetch(${JSON.stringify(customerContext(organizations[0].id))})
      return r.status
    })()`),403,"Revoked buyer.purchase denies even a valid native Customer")

    await reviewer.click('#buyer-context-refresh')
    await reviewer.wait("document.getElementById('buyer-context-panel').hidden===true")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    process.stdout.write("PASS B22 Chrome: selected Buyer Organization requires same Person active membership and explicit current buyer.purchase, foreign Owner 403, forged actor 400, revocation clears access; no checkout\\n")

    assert.equal((await q(`select count(*)::int n from da_organization_buyer_permission
      where person_id=$1 and organization_id=$2 and revoked_at is null`,
      [B.person,organizations[0].id]))[0].n,0)
    process.stdout.write("PASS B22 Chrome: Organization Owner grants and revokes buyer.purchase for active Alpha Member, audit/outbox PG16, idempotent replay, foreign Org Owner/staff 403 and no automatic Owner permission; no checkout writer\\n")
    // The Organization Owner may explicitly grant AND revoke products.edit
    // for an active member; platform staff status is not sufficient.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("!document.getElementById('product-grants-panel').hidden")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form');
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)};
      f.elements.namedItem('membership_id').value=${JSON.stringify(alphaMember.id)};
    })()`)
    await browser.click('#product-grants-form button[value="grant"]')
    await until(async()=>{
      const rows=await q(`select g.id from da_store_product_permission g
        where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
          and g.permission='products.edit' and g.revoked_at is null`,
        [B.person,organizations[0].id,ownerStoreId])
      return rows.length===1
    },19000,"B22 Chrome Owner actual products.edit permission")
    const [issued]=await q(`select g.id,g.source_audit_event_id from da_store_product_permission g
      where g.person_id=$1 and g.organization_id=$2 and g.seller_id=$3
        and g.revoked_at is null`,[B.person,organizations[0].id,ownerStoreId])
    const auditGrant=await q(`select e.action,e.actor_person_id,e.organization_id,e.target_id,x.id outbox_id
      from da_audit_event e join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.new_values->>'grant_id'=$2`,[issued.source_audit_event_id,issued.id])
    assert.equal(auditGrant.length,1)
    assert.equal(auditGrant[0].action,"organization.store_product_permission_granted")
    assert.equal(auditGrant[0].actor_person_id,A.person)
    assert.equal(auditGrant[0].organization_id,organizations[0].id)
    assert.equal(auditGrant[0].target_id,ownerStoreId)
    // Repeating the exact grant cannot create a second event or grant.
    const sameRequest={action:"grant",organization_id:organizations[0].id,
      seller_id:ownerStoreId,membership_id:alphaMember.id}
    const replayGrant=await browser.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/store-product-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(sameRequest)})
      });return {status:response.status,body:await response.json()}
    })()`)
    assert.equal(replayGrant.status,200)
    assert.equal(replayGrant.body.grant_id,issued.id)
    assert.equal((await q(`select count(*)::int n from da_store_product_permission
      where person_id=$1 and organization_id=$2 and seller_id=$3`,
      [B.person,organizations[0].id,ownerStoreId]))[0].n,1)
    // A Person who is only a MEMBER of Alpha cannot grant products.edit,
    // even if that Person has an unrelated Beta Owner and platform staff role.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const forbiddenGrant=await reviewer.eval(`(async()=>{
      const s=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/store-product-permissions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf_token},
        body:JSON.stringify(${JSON.stringify(sameRequest)})
      });return response.status
    })()`)
    assert.equal(forbiddenGrant,403,"Other Organization Owner / platform staff cannot grant Alpha")
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('product-grants-panel').hidden")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form');
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)};
      f.elements.namedItem('membership_id').value=${JSON.stringify(alphaMember.id)};
    })()`)
    await browser.click('#product-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select revoked_at from da_store_product_permission where id=$1`,[issued.id])
      return rows.length===1&&!!rows[0].revoked_at
    },19000,"B22 Chrome Owner actual products.edit revocation")
    const revokeAudit=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.action='organization.store_product_permission_revoked'
        and e.actor_person_id=$1 and e.organization_id=$2 and e.target_id=$3`,
      [A.person,organizations[0].id,ownerStoreId])
    assert.equal(revokeAudit[0].n,1,"Revocation requires canonical outbox")
    process.stdout.write("PASS B22 Chrome: Owner grants active Member scoped products.edit, retry idempotent, foreign Member/staff 403, Owner revokes with PG16 audit/outbox\\n")
    // B22 actual visitor draft writer: Owner may grant THEMSELVES an explicit
    // permission but protected Owner alone still confers no product privilege.
    assert.equal((await get('/personal/product-drafts?organization_id='+organizations[0].id)).status,200)
    assert.deepEqual((await get('/personal/product-drafts?organization_id='+organizations[0].id)).body.stores,[])
    await browser.wait("!document.getElementById('product-grants-panel').hidden")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form')
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)}
      f.elements.namedItem('membership_id').value=${JSON.stringify(memberships[0].id)}
    })()`)
    await browser.click('#product-grants-form button[value="grant"]')
    await browser.wait("!document.getElementById('product-draft-panel').hidden")
    const draftTitle="B22 browser product draft "+rand
    await browser.input("#product-draft-form input[name=title]",draftTitle)
    await browser.eval(`document.querySelector('#product-draft-form select[name=seller_id]').value=${JSON.stringify(ownerStoreId)}`)
    await browser.click("#product-draft-form button[type=submit]")
    await until(async()=>{
      const result=await q("select id,status from product where title=$1",[draftTitle])
      return result.length===1&&result[0].status==="draft"
    },19000,"B22 actual personal draft native PG16 persistence")
    await browser.wait("document.getElementById('product-draft-status').textContent.includes('Ürün taslağı kaydedildi')")
    const [written]=await q("select id,status,metadata from product where title=$1",[draftTitle])
    assert.match(written.id,/^prod_[A-Za-z0-9_-]+$/)
    assert.equal(written.status,"draft")
    const requestId=written.metadata?.dogruadres_draft_request_id
    assert.match(requestId,/^dapd_[0-9a-f]{32}$/)
    assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[written.id]))
      .map((row:any)=>row.seller_id),[ownerStoreId])
    const [intent]=await q(`select status,person_id,organization_id,seller_id,product_id,
      completion_audit_event_id from da_product_draft_request where id=$1`,[requestId])
    assert.equal(intent.status,"created")
    assert.equal(intent.person_id,A.person)
    assert.equal(intent.organization_id,organizations[0].id)
    assert.equal(intent.seller_id,ownerStoreId)
    assert.equal(intent.product_id,written.id)
    const audit=await q(`select e.id from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.product_draft_created'
        and e.actor_person_id=$2 and e.organization_id=$3 and e.target_id=$4
        and e.new_values->>'request_id'=$5 and e.new_values->>'product_id'=$6`,
      [intent.completion_audit_event_id,A.person,organizations[0].id,ownerStoreId,requestId,written.id])
    assert.equal(audit.length,1,"Real product draft and canonical outbox must correspond")
    const productRequest={request_id:requestId,organization_id:organizations[0].id,
      seller_id:ownerStoreId,title:draftTitle}
    const draftPost=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:response.status,body:await response.json()}
    })()`)
    const replayProduct=await draftPost(productRequest)
    assert.equal(replayProduct.status,200)
    assert.equal(replayProduct.body.product_id,written.id)
    const receiptProduct=await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(requestId))
    assert.equal(receiptProduct.status,200)
    assert.equal(receiptProduct.body.status,"created")
    assert.equal(receiptProduct.body.product_id,written.id)
    // Real CI PG16 "native committed, Foundation outcome lost" fixture:
    // reserve once, run the *actual Mercur* workflow with deterministic ID,
    // intentionally omit the Foundation completion, then recover through
    // the authenticated browser without a second native create.
    const recoveryKey="dapd_"+randomBytes(16).toString("hex")
    const recoveryId="prod_"+recoveryKey.slice(5)
    const recoveryTitle="B22 interrupted native draft "+rand
    const fingerprint=createHash("sha256").update(JSON.stringify([
      organizations[0].id,ownerStoreId,recoveryTitle
    ])).digest("hex")
    await q(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values ($1,$2,$3,$4,$5)`,[recoveryKey,A.person,organizations[0].id,ownerStoreId,fingerprint])
    const {result:recoveredNative}=await createProductsWorkflow(container).run({
      input:{products:[{
        id:recoveryId,title:recoveryTitle,status:"draft",seller_ids:[ownerStoreId],
        metadata:{dogruadres_draft_request_id:recoveryKey}
      }],created_by:ownerStoreId}
    })
    assert.equal(recoveredNative.length,1)
    assert.equal(recoveredNative[0].id,recoveryId,"Installed Mercur must preserve caller ID")
    const recoveryBefore=await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(recoveryKey))
    assert.equal(recoveryBefore.status,200)
    assert.equal(recoveryBefore.body.status,"review_required",
      "Native draft alone must not fabricate Foundation completion")
    const reconcile=async(payload:Record<string,string>)=>browser.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json()
      const r=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify(payload)})
      });return {status:r.status,body:await r.json()}
    })()`)
    const reconcilePayload={...productRequest,request_id:recoveryKey,
      title:recoveryTitle,action:"reconcile"}
    const recoveredOnce=await reconcile(reconcilePayload)
    assert.equal(recoveredOnce.status,200)
    assert.deepEqual(recoveredOnce.body,{status:"created",product_id:recoveryId})
    const recoveredAgain=await reconcile(reconcilePayload)
    assert.equal(recoveredAgain.status,200)
    assert.deepEqual(recoveredAgain.body,{status:"created",product_id:recoveryId})
    const [recoveredLedger]=await q(`select status,product_id,completion_audit_event_id
      from da_product_draft_request where id=$1`,[recoveryKey])
    assert.equal(recoveredLedger.status,"created")
    assert.equal(recoveredLedger.product_id,recoveryId)
    const nativeCount=await q(`select count(*)::int n from product
      where id=$1 and title=$2 and metadata->>'dogruadres_draft_request_id'=$3`,
      [recoveryId,recoveryTitle,recoveryKey])
    assert.equal(nativeCount[0].n,1,"Reconcile must not create another product")
    assert.deepEqual((await q("select seller_id from product_seller where product_id=$1",[recoveryId]))
      .map((x:any)=>x.seller_id),[ownerStoreId])
    const proofCount=await q(`select count(*)::int n from da_audit_event e
      join da_audit_outbox x on x.source_audit_event_id=e.id
      where e.id=$1 and e.action='organization.product_draft_created'
        and e.new_values->>'request_id'=$2 and e.new_values->>'product_id'=$3`,
      [recoveredLedger.completion_audit_event_id,recoveryKey,recoveryId])
    assert.equal(proofCount[0].n,1,"Reconciled outcome needs canonical audit/outbox")
    // A reserved request with no native product must NOT be turned into a
    // false success or trigger a product create on a reconcile-only request.
    const absentKey="dapd_"+randomBytes(16).toString("hex")
    await q(`insert into da_product_draft_request
      (id,person_id,organization_id,seller_id,request_fingerprint)
      values($1,$2,$3,$4,$5)`,[absentKey,A.person,organizations[0].id,ownerStoreId,
      createHash("sha256").update(JSON.stringify([organizations[0].id,ownerStoreId,recoveryTitle])).digest("hex")])
    const absent=await reconcile({...reconcilePayload,request_id:absentKey})
    assert.equal(absent.status,200)
    assert.equal(absent.body.status,"review_required")
    assert.equal((await q("select status from da_product_draft_request where id=$1",[absentKey]))[0].status,"reserved")
    assert.equal((await q("select count(*)::int n from product where id=$1",
      ["prod_"+absentKey.slice(5)]))[0].n,0)
    process.stdout.write("PASS B22 native reconciliation confirmed: real Mercur draft already committed, Foundation reserved, authenticated Chrome repair with canonical audit/outbox and zero duplicate products; absent native record stays reserved\\n")
    assert.equal((await draftPost({...productRequest,title:draftTitle+" changed"})).status,403)
    assert.equal((await draftPost({...productRequest,organization_id:organizations[1].id})).status,403)
    assert.equal((await q("select count(*)::int n from product where title=$1",[draftTitle]))[0].n,1)
    assert.equal((await q("select count(*)::int n from da_product_draft_request where id=$1",[requestId]))[0].n,1)
    // A different Alpha Member, even a Beta Owner/platform reviewer, cannot
    // use A's intent or product without the independent products.edit grant.
    await reviewer.send("Page.bringToFront")
    await reviewer.wait("document.visibilityState==='visible'")
    const memberCannotWrite=await reviewer.eval(`(async()=>{
      const session=await(await fetch('/personal/session')).json();
      const response=await fetch('/personal/product-drafts',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({...productRequest,request_id:"dapd_"+randomBytes(16).toString("hex")})})
      });return response.status
    })()`)
    assert.equal(memberCannotWrite,403)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('product-grants-panel').hidden")
    await browser.eval(`(()=>{
      const f=document.getElementById('product-grants-form')
      f.elements.namedItem('seller_id').value=${JSON.stringify(ownerStoreId)}
      f.elements.namedItem('membership_id').value=${JSON.stringify(memberships[0].id)}
    })()`)
    await browser.click('#product-grants-form button[value="revoke"]')
    await until(async()=>{
      const rows=await q(`select count(*)::int n from da_store_product_permission
        where person_id=$1 and organization_id=$2 and seller_id=$3
          and permission='products.edit' and revoked_at is null`,
        [A.person,organizations[0].id,ownerStoreId])
      return rows[0].n===0
    },19000,"B22 product permission revoke invalidates writer")
    assert.equal((await draftPost(productRequest)).status,403,
      "Even a completed intent cannot disclose its old product after revoke")
    assert.equal((await get('/personal/product-drafts?organization_id='+
      encodeURIComponent(organizations[0].id)+'&seller_id='+
      encodeURIComponent(ownerStoreId)+'&request_id='+encodeURIComponent(requestId))).status,403,
      "Receipt lookup must never bypass revoked products.edit")
    assert.equal((await q("select count(*)::int n from product where title=$1",[draftTitle]))[0].n,1)
    process.stdout.write("PASS B22 Chrome: personally authorized native draft, PG16 product_seller and canonical audit/outbox, exact replay no duplicate, conflicting key/foreign Member/revoked permission denied\\n")
    // Native Member context now requires the SAME live legal Organization
    // used by the personal Store list; SellerMember alone is insufficient.
    const storeContext=(org:string,seller:string)=>
      '/personal/contexts?type=member&organization='+encodeURIComponent(org)+
      '&seller='+encodeURIComponent(seller)
    const authorizedContext=await get(storeContext(organizations[0].id,ownerStoreId))
    assert.equal(authorizedContext.status,200,
      "B22 native Member context response category: "+
      (typeof authorizedContext.body?.message==="string"?
        authorizedContext.body.message.slice(0,50):"unavailable"))
    assert.equal(authorizedContext.body.organization_id,organizations[0].id)
    assert.equal(authorizedContext.body.seller.id,ownerStoreId)
    assert.equal((await get(storeContext(organizations[1].id,ownerStoreId))).status,403)
    assert.equal((await get('/personal/contexts?type=member&seller='+ownerStoreId)).status,400)
    const replayApprove=await reviewer.eval(`(async()=>{
      const session=await (await fetch('/personal/session')).json()
      const response=await fetch('/personal/platform/stores',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf_token},
        body:JSON.stringify(${JSON.stringify({application_id:applicationId,seller_id:ownerStoreId})})})
      return response.status
    })()`)
    assert.equal(replayApprove,409,"Native approval must not execute twice")
    // Revoking a staff task immediately denies further platform approval
    // access; an Organization Owner cannot gain this permission implicitly.
    await q("update da_platform_staff_grant set revoked_at=clock_timestamp() where id=$1",[grantId])
    assert.equal(await reviewer.eval(`(async()=> (await fetch('/personal/platform/stores')).status)()`),403)
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    await browser.wait("!document.getElementById('workspace').hidden")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    assert.equal((await get(selected(organizations[0].id))).body.stores[0].id,ownerStoreId)
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(applicationName)})`),true)
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    // Keep the later existing fixture expectations intact: native suspension
    // hides this reviewed Store without altering the Owner→Org link.
    await suspendSellerWorkflow(container).run({input:{seller_id:ownerStoreId,reason:"B22 task-only native suspend"}})
    assert.equal((await get(storeContext(organizations[0].id,ownerStoreId))).status,403)
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.getElementById('org-stores-status').textContent.includes('görüntülenebilir onaylı mağaza bulunmuyor')")
    // ONLY SYNTHETIC isolated fixture records: approved action + matching
    // Organization/Store + canonical source outbox. No production reviewer,
    // document decision, operator grant or actual Store ownership is inferred.
    for(let n=0;n<3;n++){
      const org=organizations[n===2?1:0],event="daaud_b22_ui_"+n+"_"+rand
      await q(`insert into da_audit_event
        (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
        values($1,$2,'user',$3,$4,'organization.store_association_approved',
          'dogruadres-access','store-association',$5,now())`,
        [event,A.person,A.actor,org.id,stores[n].id])
      await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
        values($1,$2,'dogruadres-access','{}'::jsonb)`,["daaob_b22_ui_"+n+"_"+rand,event])
      await q(`insert into da_organization_seller_ownership
        (id,organization_id,seller_id,verification_audit_event_id,verified_at)
        values($1,$2,$3,$4,now())`,
        ["daown_b22_ui_"+n+"_"+rand,org.id,stores[n].id,event])
    }
    // A platform association does not replace the separate native approval.
    const unapprovedAudit="daaud_b22_unapproved_"+rand
    await q(`insert into da_audit_event
      (id,actor_person_id,actor_type,actor_id,organization_id,action,module,resource,target_id,occurred_at)
      values($1,$2,'user',$3,$4,'organization.store_association_approved',
        'dogruadres-access','store-association',$5,now())`,
      [unapprovedAudit,A.person,A.actor,organizations[0].id,unapprovedStore.id])
    await q(`insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope)
      values($1,$2,'dogruadres-access','{}'::jsonb)`,
      ["daaob_b22_unapproved_"+rand,unapprovedAudit])
    await q(`insert into da_organization_seller_ownership
      (id,organization_id,seller_id,verification_audit_event_id,verified_at)
      values($1,$2,$3,$4,now())`,
      ["daown_b22_unapproved_"+rand,organizations[0].id,unapprovedStore.id,unapprovedAudit])
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    const alpha=await get(selected(organizations[0].id))
    assert.equal(alpha.status,200)
    assert.deepEqual(alpha.body.stores.map((s:any)=>s.id).sort(),stores.slice(0,2).map(s=>s.id).sort())
    assert.equal(alpha.body.stores.some((store:any)=>store.id===unapprovedStore.id),false,
      "Unapproved Seller must stay hidden even with platform association and Member link")
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(unapprovedStore.name)})`),false)
    // Native Store suspension must independently remove ONLY its own Store
    // without revoking Person, Organization membership or platform association.
    await suspendSellerWorkflow(container).run({input:{
      seller_id:stores[0].id,reason:"B22 task-only suspension negative"
    }})
    const suspended=await native.listSellers({id:stores[0].id})
    assert.equal(suspended.length,1)
    assert.equal(suspended[0].status,"suspended")
    assert.ok(suspended[0].approved_at,"Suspension must retain historical native approval")
    const alphaSuspended=await get(selected(organizations[0].id))
    assert.equal(alphaSuspended.status,200)
    assert.deepEqual(alphaSuspended.body.stores.map((x:any)=>x.id),[stores[1].id])
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores.map((x:any)=>x.id),[stores[2].id],
      "Independent Organization Store visibility must survive Alpha suspension")
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(stores[0].name)})`),false)
    await unsuspendSellerWorkflow(container).run({input:{seller_id:stores[0].id}})
    const reopened=await native.listSellers({id:stores[0].id})
    assert.equal(reopened.length,1);assert.equal(reopened[0].status,"open")
    assert.ok(reopened[0].approved_at)
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores.map((x:any)=>x.id).sort(),
      stores.slice(0,2).map(x=>x.id).sort())
    await browser.select(organizations[1].name,"admin")
    await browser.wait("document.querySelectorAll('#org-stores p').length===1")
    const beta=await get(selected(organizations[1].id))
    assert.equal(beta.status,200);assert.deepEqual(beta.body.stores.map((s:any)=>s.id),[stores[2].id])
    assert.equal(await browser.eval(`document.getElementById('org-stores').textContent.includes(${JSON.stringify(stores[0].name)})`),false)
    assert.equal((await get(selected(organizations[2].id))).status,403)
    assert.equal((await get(selected(organizations[1].id),{"x-seller-id":stores[0].id})).status,400)
    // Revoke the platform association without disturbing protected owner.
    await q("update da_organization_seller_ownership set revoked_at=now() where seller_id=$1",[stores[2].id])
    assert.deepEqual((await get(selected(organizations[1].id))).body.stores,[])
    await native.updateMembers([{id:member.id,is_active:false}])
    assert.equal((await get(selected(organizations[0].id))).status,403)
    await native.updateMembers([{id:member.id,is_active:true}])
    // An authorized protected Owner revokes only A's unprotected Admin
    // membership in Beta via the supported Foundation service. Native
    // SellerMember and Person's active session remain intact.
    const revoked=await foundation.changeMembership({
      organization_id:organizations[1].id,membership_id:betaAdminMembership.id,
      actor_person_id:B.person,actor_type:"user",actor_id:B.actor,status:"revoked",
    })
    assert.equal(revoked.status,"revoked")
    assert.equal((await get(selected(organizations[1].id))).status,403,
      "Revoked Organization Admin cannot retain Store access")
    assert.equal((await q("select status from da_organization_membership where id=$1",
      [betaAdminMembership.id]))[0].status,"revoked")
    assert.equal((await get(selected(organizations[0].id))).status,200,
      "Unrelated active Organization must survive Beta revocation")
    // No actor-native JWT or personal details should reach the page.
    const privateView=await browser.eval("({jwt:/eyJ[A-Za-z0-9_-]+\\.eyJ/.test(document.body.innerText),local:Object.keys(localStorage),session:Object.keys(sessionStorage)})")
    assert.equal(privateView.jwt,false);assert.deepEqual(privateView.local,[]);assert.deepEqual(privateView.session,[])
    // Organization membership revocation may make the privacy observer hide
    // the old workspace immediately. Do NOT fake visible state, disable the
    // observer, or assume that a stale Owner button must remain clickable.
    // Both supported user actions share the exact same CSRF-protected lock.
    await browser.send("Page.bringToFront")
    await browser.wait("document.visibilityState==='visible'")
    const ownerButton=await browser.eval(`Array.from(document.querySelectorAll('#organizations button')).some(b=>b.textContent===${JSON.stringify(organizations[0].name+" — owner")})`)
    let clickedLock=false
    if(ownerButton){
      // The visible UI path is preferred, but the privacy observer may
      // conceal it BETWEEN the Owner selection and actual button click.
      await browser.select(organizations[0].name,"owner")
      await browser.wait("document.querySelectorAll('#org-stores p').length===2")
      assert.equal((await get(selected(organizations[0].id))).status,200)
      const visible=await browser.eval(`(()=>{
        const button=document.getElementById('session-lock')
        return button&&!button.hidden&&!button.disabled&&
          !document.getElementById('workspace').hidden&&
          document.visibilityState==='visible'
      })()`)
      if(visible){
        try{
          await browser.click("#session-lock")
          clickedLock=true
        }catch(error){
          // Only a genuinely concealed page may take the existing real
          // HTTP/CSRF lock route. Never ignore an ordinary failed click.
          const concealed=await browser.eval(`(()=>{
            const button=document.getElementById('session-lock')
            return !button||button.hidden||button.disabled||
              document.getElementById('workspace').hidden
          })()`)
          if(!concealed)throw error
        }
      }
    }
    if(clickedLock){
      await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
      await browser.wait("document.getElementById('status').textContent.includes('Oturum kilitlendi')")
    }else{
      // A genuinely concealed page cannot click a hidden button. Use the
      // same real public session-lock contract with the authenticated browser,
      // the current session's anti-CSRF proof and actual server transaction.
      const lock=await browser.eval(`(async()=>{
        const response=await fetch('/personal/session')
        if(response.status!==200)return {session_status:response.status,lock_status:null}
        const session=await response.json()
        const outcome=await fetch('/personal/session?action=lock',{
          method:'DELETE',headers:{'x-csrf-token':session.csrf_token}
        })
        return {session_status:response.status,lock_status:outcome.status}
      })()`)
      assert.equal(lock.session_status,200,"Private UI conceal is not a logout bypass")
      assert.equal(lock.lock_status,200,"Real same-origin CSRF-protected lock must succeed")
      await browser.send("Page.reload",{ignoreCache:true})
      await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
      process.stdout.write("PASS B22 Chrome: observer concealed stale Organization UI; same session explicitly locked over CSRF-protected HTTP and fresh Chrome reload\\n")
    }
    // The cookie is no longer set in Chrome. Probe the OLD exact opaque
    // credential explicitly over task-owned HTTPS to rule out UI-only hiding.
    const denied=await new Promise<number>((resolve,reject)=>{
      const req=tlsRequest(host+selected(organizations[0].id),{
        method:"GET",ca:readFileSync(crt),headers:{cookie:"da_session="+cookie}
      },res=>{res.resume();res.on("end",()=>resolve(res.statusCode??0))})
      req.on("error",reject);req.setTimeout(10000,()=>req.destroy(Error("B22 locked replay timeout")));req.end()
    })
    assert.ok([401,403].includes(denied),"Locked session's old cookie must never read Store data")
    const sessionHash=createHash("sha256").update(cookie).digest("hex")
    const locked=await q("select status from da_browser_session where id=$1",[sessionHash])
    assert.equal(locked.length,1)
    assert.equal(locked[0].status,"revoked","Real PG16 confirms session lock")
    const hidden=await browser.eval("({store:document.getElementById('org-stores').textContent,selection:document.getElementById('detail').textContent,local:Object.keys(localStorage),session:Object.keys(sessionStorage)})")
    assert.equal(hidden.store,"");assert.equal(hidden.selection,"")
    assert.deepEqual(hidden.local,[]);assert.deepEqual(hidden.session,[])
    process.stdout.write("PASS B22 Chrome: native pending Seller on page 2 approved, newer Owner Store separately approved, 30 older non-native records fail closed\n")
    process.stdout.write("PASS B22 Chrome: two Person browsers, platform staff-approved native Seller, Owner sees only approved Store; revoked staff denied\n")
    process.stdout.write("PASS B22 Chrome: Owner Store application creates pending native Seller and direct Organization link, replay deduped and foreign Organization denied\n")
    process.stdout.write("PASS B22 Chrome: native suspension hides only affected Store; unrelated Organization unaffected; approved Store reopens through native workflow\n")
    process.stdout.write("PASS B22 Chrome: native OPEN Seller with no approved_at remains hidden despite platform association and Member link\n")
    process.stdout.write("PASS B22 Chrome: locked personal session clears Store UI, old opaque cookie rejected and PG16 session revoked\n")
    process.stdout.write("PASS B22 Chrome: real MFA and dual-proof Member link with two Organization scopes; approved synthetic Store fixtures read and revoked access denied\n")
    process.stdout.write("NOT TESTED B22 Chrome: actual platform document reviewer/writer, buyer checkout, independent acceptance and atomic cross-module revocation\n")

    // Exercise the actual project-owned authorization hook on the installed
    // Mercur workflow. This zero-value task Cart has no legal Buyer attribution,
    // so denial must happen before any OrderGroup/order/payment side effect.
    const hookProbeCart=await cartService.createCarts({currency_code:"eur"})
    const {data:hookProbeRows}=await query.graph({
      entity:"cart",fields:["id","total","credit_line_total","completed_at"],
      filters:{id:hookProbeCart.id}
    })
    assert.equal(hookProbeRows.length,1)
    assert.equal(hookProbeRows[0].id,hookProbeCart.id)
    assert.equal(Number(hookProbeRows[0].total),0)
    assert.ok(Number(hookProbeRows[0].credit_line_total??0)>=0)
    assert.equal(hookProbeRows[0].completed_at,null)
    const hookRun=await completeCartWithSplitOrdersWorkflow(container).run({
      input:{cart_id:hookProbeCart.id},throwOnError:false
    })
    const hookErrorText=(hookRun.errors??[]).map((entry:any)=>
      String(entry.error?.message??entry.error??entry.message??"")).join("\n")
    assert.match(hookErrorText,/B22_CHECKOUT_AUTHORIZATION_DENIED/,
      "The real installed Mercur validate hook must fail closed for a Cart without legal Buyer/Customer/Store proof")
    assert.equal((await q("select count(*)::int n from order_group where cart_id=$1",
      [hookProbeCart.id]))[0].n,0)
    const {data:hookOrderLinks}=await query.graph({
      entity:"order_cart",fields:["order_id"],filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(hookOrderLinks.length,0)
    const {data:hookPaymentLinks}=await query.graph({
      entity:"cart_payment_collection",fields:["payment_collection_id"],
      filters:{cart_id:hookProbeCart.id}
    })
    assert.equal(hookPaymentLinks.length,0)
    const {data:hookCartAfter}=await query.graph({
      entity:"cart",fields:["id","completed_at"],filters:{id:hookProbeCart.id}
    })
    assert.equal(hookCartAfter.length,1)
    assert.equal(hookCartAfter[0].completed_at,null)
    process.stdout.write("PASS B22 Chrome: Mercur 2.3.7 real validate hook invokes the project-owned Foundation authorization; an unattributed zero-value Cart is denied before OrderGroup/Order/payment writes and remains open; no payment writer\n")
  }finally{
    for(const b of browsers)await b.close()
    if(server)await new Promise<void>(r=>server!.close(()=>r()))
    if(privateServer)await new Promise<void>(r=>privateServer!.close(()=>r()))
    if(previousPrivateOrigin===undefined)delete process.env.DOGRUADRES_PRIVATE_API
    else process.env.DOGRUADRES_PRIVATE_API=previousPrivateOrigin
    if(previousTlsCert===undefined)delete process.env.DOGRUADRES_TLS_CERT
    else process.env.DOGRUADRES_TLS_CERT=previousTlsCert
    if(previousTlsKey===undefined)delete process.env.DOGRUADRES_TLS_KEY
    else process.env.DOGRUADRES_TLS_KEY=previousTlsKey
    if(previousListenerPort===undefined)delete process.env.DOGRUADRES_FRONTDOOR_PORT
    else process.env.DOGRUADRES_FRONTDOOR_PORT=previousListenerPort
    if(app)await app.close()
    await pg.end()
    rmSync(temp,{recursive:true,force:true})
  }
}
