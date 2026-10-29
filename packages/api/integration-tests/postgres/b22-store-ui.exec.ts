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
import {mkdtempSync,readFileSync,rmSync} from "node:fs"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {spawnSync} from "node:child_process"
import {Client} from "@medusajs/framework/pg"
import {createPersonalHttpApp} from "../../src/scripts/personal-http-runtime"
import {approveSellerWorkflow,suspendSellerWorkflow,unsuspendSellerWorkflow} from "@mercurjs/core/workflows"
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
    app=await createPersonalHttpApp(container)
    server=tlsServer({cert:readFileSync(crt),key:readFileSync(key),minVersion:"TLSv1.2"},app.app)
    await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve)})
    const host="https://127.0.0.1:"+(server.address() as any).port
    process.env.DOGRUADRES_PUBLIC_ORIGIN=host
    const browser=new B06Chrome(host,"A");browsers.push(browser)
    await browser.start(crt)
    await browser.login(A.email,A.password,A.person)
    const cookie=await browser.token()
    assert.match(cookie??"",/^[A-Za-z0-9_-]{43}$/)
    const get=async(path:string,additional:Record<string,string>={})=>{
      return browser.eval(`(async()=>{
        const r=await fetch(${JSON.stringify(path)},{headers:${JSON.stringify(additional)}})
        return {status:r.status,body:await r.json(),cache:r.headers.get("cache-control")}
      })()`)
    }
    const selected=(org:string)=>"/personal/organization-stores?organization="+encodeURIComponent(org)
    // Native SellerMember is NOT a verified human association. Nothing visible.
    await browser.select(organizations[0].name,"owner")
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
    // No platform-approved Store yet; even the genuine verified actor grants none.
    assert.deepEqual((await get(selected(organizations[0].id))).body.stores,[])
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
    // Last active Organization must still work before the session is locked;
    // a false success due to the previously revoked Beta scope is unacceptable.
    await browser.select(organizations[0].name,"owner")
    await browser.wait("document.querySelectorAll('#org-stores p').length===2")
    assert.equal((await get(selected(organizations[0].id))).status,200)
    await browser.click("#session-lock")
    await browser.wait("document.getElementById('login').hidden===false && document.getElementById('workspace').hidden===true && document.getElementById('org-stores-panel').hidden===true && document.getElementById('org-stores').children.length===0")
    await browser.wait("document.getElementById('status').textContent.includes('Oturum kilitlendi')")
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
    process.stdout.write("PASS B22 Chrome: native suspension hides only affected Store; unrelated Organization unaffected; approved Store reopens through native workflow\n")
    process.stdout.write("PASS B22 Chrome: native OPEN Seller with no approved_at remains hidden despite platform association and Member link\n")
    process.stdout.write("PASS B22 Chrome: locked personal session clears Store UI, old opaque cookie rejected and PG16 session revoked\n")
    process.stdout.write("PASS B22 Chrome: real MFA and dual-proof Member link with two Organization scopes; approved synthetic Store fixtures read and revoked access denied\n")
    process.stdout.write("NOT TESTED B22 Chrome: actual platform document reviewer/writer, buyer checkout, independent acceptance and atomic cross-module revocation\n")
  }finally{
    for(const b of browsers)await b.close()
    if(server)await new Promise<void>(r=>server!.close(()=>r()))
    if(app)await app.close()
    await pg.end()
    rmSync(temp,{recursive:true,force:true})
  }
}
