import assert from "node:assert/strict"
import type { B06Chrome } from "./b06-ui-browser"
import { until } from "./b19-browser"

type Db=(sql:string,params?:unknown[])=>Promise<any[]>
type Reply={status:number;body:any}
const get=async(browser:B06Chrome,org:string):Promise<Reply>=>
  browser.callFunction(
    "async function(org){const r=await fetch('/personal/company-launcher?organization='+"+
    "encodeURIComponent(org),{cache:'no-store'});return {status:r.status,body:await r.json()}}",org)
const post=async(browser:B06Chrome,data:unknown,badCsrf=false):Promise<Reply>=>
  browser.callFunction(
    "async function(payload){const arg=JSON.parse(payload);"+
    "const s=await(await fetch('/personal/session')).json();"+
    "const r=await fetch('/personal/company-launcher',{method:'POST',"+
    "headers:{'content-type':'application/json','x-csrf-token':arg.bad?'not-csrf':s.csrf_token},"+
    "body:JSON.stringify(arg.data)});return {status:r.status,body:await r.json()}}",
    JSON.stringify({data,bad:badCsrf}))

/**
 * #203 real B20 acceptance, existing disposable B22 PG16+HTTPS+Chrome only.
 * This is run after the B22 fixture creates the second protected Gamma Owner:
 * Person X owns Gamma and another Organization; Person Y separately owns Gamma.
 * No fake HTTP result/Organization permission or native Seller grant is used.
 * Only this test's new Person x Org preference rows are deleted on exit.
 */
export async function verifyB20CompanyLauncher(input:{
  owner:B06Chrome;other:B06Chrome;q:Db;
  ownerPersonId:string;otherPersonId:string;
  organizationId:string;organizationName:string
}):Promise<void>{
  assert.equal(process.env.CI,"true","B20 requires existing task-owned CI runner")
  assert.equal(process.env.NODE_ENV,"test","B20 must never use production")
  assert.equal(process.env.B22_UI_AUTO_SCOPE,"b22-ui","B20 requires isolated B22 browser scope")
  const {owner,other,q,ownerPersonId,otherPersonId,
    organizationId,organizationName}=input
  assert.notEqual(ownerPersonId,otherPersonId)
  const otherOrganizations=await q(
    "select o.id,o.name from da_organization o join da_organization_membership m "+
    "on m.organization_id=o.id where m.person_id=$1 and m.role='owner' "+
    "and m.protected_owner=true and m.status='active' and m.revoked_at is null "+
    "and o.status='active' and o.id<>$2 order by o.id limit 1",
    [ownerPersonId,organizationId])
  assert.equal(otherOrganizations.length,1,
    "Real Person X needs a second independently active Owner Organization")
  const secondOrg=otherOrganizations[0]
  const scopes=[organizationId,secondOrg.id]
  const legacyBefore=await q(
    "select person_id,app_ids,collapsed_ids,version from da_launcher_preference "+
    "where person_id in ($1,$2) order by person_id",[ownerPersonId,otherPersonId])
  const before=await q(
    "select person_id,organization_id from da_company_launcher_preference "+
    "where (person_id=$1 and organization_id in ($3,$4)) "+
    "or (person_id=$2 and organization_id=$3)",
    [ownerPersonId,otherPersonId,organizationId,secondOrg.id])
  assert.equal(before.length,0,
    "Task acceptance must never overwrite an existing company preference")
  const defaults=["organization","store-applications","memberships"]
  try{
    const xGamma=await get(owner,organizationId)
    const xSecond=await get(owner,secondOrg.id)
    const yGamma=await get(other,organizationId)
    for(const value of [xGamma,xSecond,yGamma]){
      assert.equal(value.status,200,"Only active protected Owner sees existing functions")
      assert.deepEqual(value.body.app_ids,defaults)
      assert.deepEqual(value.body.available_ids,defaults)
      assert.deepEqual(value.body.collapsed_ids,[])
      assert.equal(value.body.version,0,"Fresh Person+Org pair gets standard layout")
    }
    assert.equal(xGamma.body.organization_id,organizationId)
    assert.equal(xSecond.body.organization_id,secondOrg.id)
    assert.equal(yGamma.body.organization_id,organizationId)
    assert.equal((await get(owner,"daorg_UNAUTHORIZED_NOT_REAL")).status,403,
      "A fabricated or foreign Organization cannot expose a company launcher")
    assert.equal((await post(owner,{
      organization:organizationId,app_ids:["organization","store-applications","memberships"],
      collapsed_ids:[],expected_version:0,person_id:otherPersonId
    })).status,400,"Never accept a forged Person selector")
    assert.equal((await post(owner,{
      organization:organizationId,app_ids:defaults,collapsed_ids:[],expected_version:0
    },true)).status,403,"CSRF denied before a preference write")
    assert.equal((await post(owner,{
      organization:organizationId,app_ids:["vendor","organization","memberships"],
      collapsed_ids:[],expected_version:0
    })).status,400,"Legacy Vendor navigation cannot become a company app")
    const anonymous=await owner.callFunction(
      "async function(org){const r=await fetch('/personal/company-launcher?organization='+"+
      "encodeURIComponent(org),{credentials:'omit',cache:'no-store'});return r.status}",
      organizationId)
    assert.equal(anonymous,403,"No-cookie reader denied")

    // A real Owner selects its Organization in the genuine Chrome UI. The
    // Staff tab can otherwise keep this Chrome document.visibilityState hidden,
    // which intentionally suppresses asynchronous private launcher rendering.
    await owner.send("Page.bringToFront")
    await owner.wait("document.visibilityState==='visible'")
    await owner.select(organizationName,"owner")
    await owner.wait("!document.getElementById('company-launcher-panel').hidden && "+
      "document.querySelectorAll('#company-launcher-list > li').length===3")
    const accessible=await owner.eval("(()=>{const list=document.getElementById('company-launcher-list');"+
      "const p=document.getElementById('company-launcher-status');"+
      "return {list:!!list,role:p.getAttribute('role'),"+
      "controls:Array.from(list.querySelectorAll('button')).filter(b=>"+
      "b.textContent==='Yukarı'||b.textContent==='Aşağı').length}})()")
    assert.deepEqual(accessible,{list:true,role:"status",controls:6})
    // Real CDP keyboard activation rather than a mouse click: traverse the
    // actual tab order, activate the app control, and retain usable focus.
    // This guards WCAG 2.2 focus after re-rendering the saved arrangement.
    const key=async(keyName:string,code:string,virtualKey:number)=>{
      for(const type of ["keyDown","keyUp"] as const)
        await owner.send("Input.dispatchKeyEvent",{
          type,key:keyName,code,windowsVirtualKeyCode:virtualKey,
          nativeVirtualKeyCode:virtualKey,
          // CDP requires the Enter character with keyDown to activate a native button.
          // Without it keyDown/keyUp only updates keyboard state, not onclick.
          ...(type==="keyDown"&&keyName==="Enter"?{text:"\r"}:{}),
        })
    }
    const tabTo=async(selector:string)=>{
      await owner.eval("document.querySelector('#select-org button').focus()")
      for(let n=0;n<20;n++){
        await key("Tab","Tab",9)
        if(await owner.eval("document.activeElement?.matches("+
          JSON.stringify(selector)+")===true"))return
      }
      assert.fail("Real keyboard Tab did not reach the scoped company control")
    }
    // #203 personal landing is authenticated, but never requires an Org selector.
    // Reuse the real Owner Chrome session; verify native fragment links through
    // actual CDP keyboard input. Zero-Org browser acceptance remains separately OPEN.
    const entry=await owner.eval("(()=>{const root=document.getElementById('workspace');"+
      "const nav=document.getElementById('personal-entry');"+
      "return {authenticated:!root.hidden,inside:root.contains(nav),"+
      "links:Array.from(nav.querySelectorAll('a')).map(a=>a.getAttribute('href')),"+
      "jobUnavailable:nav.textContent.includes('İş İlanları Panosu — henüz kullanıma açık değil.'),"+
      "targetOrg:!!document.getElementById('organizations-title'),"+
      "targetDraft:!!document.getElementById('organization-draft-title')}})()")
    assert.deepEqual(entry,{
      authenticated:true,inside:true,
      links:['#organizations-title','#organization-draft-title'],
      jobUnavailable:true,targetOrg:true,targetDraft:true,
    })
    // Protect unsaved private Organization DRAFT inputs through both real
    // keyboard navigations. Snapshot/restore only DOM state in the disposable
    // Chrome fixture; never submit, create an Org, or alter protected data.
    const draftSelectors=[
      '#organization-draft-form input[name=legal_name]',
      '#organization-draft-form input[name=landline_phone]',
    ]
    const draftBefore=await owner.eval("(()=>{const fields=["+
      "'#organization-draft-form input[name=legal_name]',"+
      "'#organization-draft-form input[name=landline_phone]'];"+
      "return fields.map(s=>document.querySelector(s)?.value??null)})()")
    assert.equal(Array.isArray(draftBefore)&&draftBefore.length===2&&
      draftBefore.every((v:unknown)=>typeof v==='string'),true,
      "Both private Organization DRAFT fields must exist")
    const syntheticName='B20 özel test — henüz kaydedilmedi & 203'
    const syntheticPhone='0212 000 2030'
    const draftInputPreserved=()=>owner.eval(
      "(()=>{const f=document.getElementById('organization-draft-form');"+
      "return !f.hidden && f.elements.namedItem('legal_name').value==="+
      JSON.stringify(syntheticName)+" && f.elements.namedItem('landline_phone').value==="+
      JSON.stringify(syntheticPhone)+"})()")
    try{
      // Real CDP text entry, not mock DOM or artificial form submission.
      for(const selector of draftSelectors)
        await owner.eval("document.querySelector("+JSON.stringify(selector)+").value=''")
      await owner.input(draftSelectors[0],syntheticName)
      await owner.input(draftSelectors[1],syntheticPhone)
      assert.equal(await draftInputPreserved(),true,
        "Real Chrome must contain both unsaved draft values before navigation")
      const initialEntryUrl=await owner.eval("location.href")
      await owner.eval(`document.querySelector('#personal-entry a[href="#organizations-title"]').focus()`)
      await key("Enter","Enter",13)
      assert.equal(await owner.eval("location.href"),initialEntryUrl,
        "Keyboard shortcut must not fire the security popstate navigation guard")
      const firstFocus=await owner.eval("({focused:document.activeElement?.id,"+
        "tag:document.activeElement?.tagName,workspaceHidden:document.getElementById('workspace').hidden})")
      assert.deepEqual(firstFocus,{focused:'organizations-title',tag:'H2',workspaceHidden:false},
        "Native Enter must move focus to the first personal workspace destination")
      assert.equal(await draftInputPreserved(),true,
        "Navigating to existing Organizations must preserve private unsaved draft bytes")
      await owner.eval(`document.querySelector('#personal-entry a[href="#organizations-title"]').focus()`)
      await key("Tab","Tab",9)
      await owner.wait("document.activeElement?.getAttribute('href')==='#organization-draft-title'")
      await key("Enter","Enter",13)
      assert.equal(await owner.eval("location.href"),initialEntryUrl,
        "Second personal destination must preserve authenticated URL and scope")
      const draftFocus=await owner.eval("({focused:document.activeElement?.id,"+
        "tag:document.activeElement?.tagName,workspaceHidden:document.getElementById('workspace').hidden})")
      assert.deepEqual(draftFocus,{focused:'organization-draft-title',tag:'H2',workspaceHidden:false},
        "Real Chrome second native link must retain heading focus")
      assert.equal(await draftInputPreserved(),true,
        "Returning to new Organization DRAFT must preserve both unsaved field bytes")
      assert.equal(await owner.eval(
        "document.getElementById('organization-draft-panel').hidden"),false,
        "Keyboard navigation opens the existing allowed company application form")
      // Neither fragment navigation nor showing the missing Job Board adds authority.
      assert.equal((await get(owner,organizationId)).status,200)
    }finally{
      // Restore even on test failure, never write these synthetic values to DB.
      await owner.callFunction(
        "function(previous){const values=JSON.parse(previous);"+
        "const form=document.getElementById('organization-draft-form');"+
        "form.elements.namedItem('legal_name').value=values[0];"+
        "form.elements.namedItem('landline_phone').value=values[1]}",
        JSON.stringify(draftBefore))
    }


    await tabTo("#company-launcher-list > li:nth-child(3) button[data-company-action='up']")
    await key("Enter","Enter",13)
    await until(async()=> {
      const result=await get(owner,organizationId)
      return result.status===200 && result.body.version===1
    },15000,"Real Chrome B20 keyboard reorder persisted")
    const ordered=await get(owner,organizationId)
    assert.deepEqual(ordered.body.app_ids,
      ["organization","memberships","store-applications"])
    await owner.wait("document.activeElement?.closest('#company-launcher-list > li')?."+
      "dataset.companyApp==='memberships' && document.activeElement?."+
      "dataset.companyAction==='up' && !document.activeElement?.disabled")
    await tabTo("#company-launcher-list > li:nth-child(2) button[data-company-action='toggle']")
    await key(" ","Space",32)
    await until(async()=> {
      const result=await get(owner,organizationId)
      return result.status===200 && result.body.version===2
    },15000,"Real Chrome B20 keyboard collapse persisted")
    let folded=await get(owner,organizationId)
    assert.deepEqual(folded.body.collapsed_ids,["memberships"])
    await owner.wait("document.activeElement?.closest('#company-launcher-list > li')?."+
      "dataset.companyApp==='memberships' && document.activeElement?."+
      "dataset.companyAction==='toggle' && document.activeElement?."+
      "getAttribute('aria-expanded')==='false'")
    // No additional Tab: the same focused control must accept repeated Space.
    await key(" ","Space",32)
    await until(async()=> {
      const result=await get(owner,organizationId)
      return result.status===200 && result.body.version===3
    },15000,"Same focused toggle can expand using keyboard again")
    folded=await get(owner,organizationId)
    assert.deepEqual(folded.body.collapsed_ids,[])
    await owner.wait("document.activeElement?.closest('#company-launcher-list > li')?."+
      "dataset.companyApp==='memberships' && document.activeElement?."+
      "dataset.companyAction==='toggle' && document.activeElement?."+
      "getAttribute('aria-expanded')==='true'")
    await key(" ","Space",32)
    await until(async()=> {
      const result=await get(owner,organizationId)
      return result.status===200 && result.body.version===4
    },15000,"Keyboard collapses again without losing focus")
    folded=await get(owner,organizationId)
    assert.deepEqual(folded.body.collapsed_ids,["memberships"])
    await owner.wait("document.activeElement?.closest('#company-launcher-list > li')?."+
      "dataset.companyApp==='memberships' && document.activeElement?."+
      "dataset.companyAction==='toggle' && document.activeElement?."+
      "getAttribute('aria-expanded')==='false'")
    assert.equal((await post(owner,{
      organization:organizationId,app_ids:defaults,
      collapsed_ids:[],expected_version:1
    })).status,409,"Stale update cannot overwrite newer version")
    const savedOther=await post(owner,{
      organization:secondOrg.id,
      app_ids:["memberships","organization","store-applications"],
      collapsed_ids:["organization"],expected_version:0
    })
    assert.equal(savedOther.status,200)
    assert.equal(savedOther.body.version,1)
    assert.deepEqual((await get(owner,organizationId)).body.app_ids,
      ["organization","memberships","store-applications"],
      "Changing Organization B must never overwrite Person X/Organization A")
    assert.equal((await get(other,organizationId)).body.version,0,
      "Person Y's preference for Organization A must be independent")
    const stored=await q(
      "select person_id,organization_id,app_ids,collapsed_ids,version "+
      "from da_company_launcher_preference where person_id=$1 "+
      "and organization_id in ($2,$3) order by organization_id",
      [ownerPersonId,organizationId,secondOrg.id])
    assert.equal(stored.length,2,"Person X has exactly two separate DB preferences")
    assert.deepEqual(stored.map(x=>Number(x.version)).sort(),[1,4])
    assert.equal((await q(
      "select count(*)::int n from da_company_launcher_preference "+
      "where person_id=$1 and organization_id=$2",
      [otherPersonId,organizationId]))[0].n,0,
      "Another Person's read never creates a preference row")
    await owner.select(secondOrg.name,"owner")
    await owner.wait("!document.getElementById('company-launcher-panel').hidden")
    await owner.select(organizationName,"owner")
    await owner.wait("!document.getElementById('company-launcher-panel').hidden")
    const restored=await owner.eval("({names:Array.from(document.querySelectorAll("+
      "'#company-launcher-list li strong')).map(x=>x.textContent),"+
      "folded:document.querySelector('#company-launcher-list li:nth-child(2) "+
      "button[aria-expanded]')?.getAttribute('aria-expanded')})")
    assert.deepEqual(restored,{
      names:["Kuruluş bilgileri","Üyelik yönetimi","Mağaza başvuruları"],
      folded:"false"
    },"A→B→A restores only the original company's saved visible order/collapse")
    assert.deepEqual(await q(
      "select person_id,app_ids,collapsed_ids,version from da_launcher_preference "+
      "where person_id in ($1,$2) order by person_id",
      [ownerPersonId,otherPersonId]),legacyBefore,
      "Legacy Person-only data must remain bit-for-bit unchanged")
    process.stdout.write("PASS B20 Chrome/HTTPS/PG16: Person X two real Organizations, Person Y same Org private standard, owner-only existing apps, accessible reorder/collapse, A-B-A DB persistence, CSRF403/foreign403/no-cookie403/forged400/CAS409, legacy preferences untouched\n")
  }finally{
    // These exact Person+Org rows were absent at the verified start of this
    // CI-only test; do not delete any preexisting/unknown or legacy data.
    await q("delete from da_company_launcher_preference "+
      "where person_id=$1 and organization_id in ($2,$3)",
      [ownerPersonId,organizationId,secondOrg.id])
  }
}
