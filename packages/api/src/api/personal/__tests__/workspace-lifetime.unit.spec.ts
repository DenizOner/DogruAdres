import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'

// Execute the shipped browser script; scheduling is controlled, not authorization.
function harness() {
  const source=readFileSync(join(__dirname,'../route.ts'),'utf8')
  const nodes=new Map<string,any>(),listeners=new Map<string,Function>(),pending:any[]=[]
  const el=(id:string)=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',hidden:id==='workspace',children:[],elements:{method:{},mobile_phone:{value:''}},setAttribute(){},focus(){},replaceChildren(){this.textContent='';this.children=[]},append(x:any){this.children.push(x)},querySelectorAll(){return []},reset(){},querySelector(){return {disabled:false}}})
    return nodes.get(id)
  }
  const document={hidden:false,getElementById:el,createElement:()=>({textContent:''}),addEventListener:(n:string,f:Function)=>listeners.set(n,f)}
  const context=createContext({document,window:{addEventListener:(n:string,f:Function)=>listeners.set(n,f)},location:new URL('https://app.example.invalid/personal'),URL,history:{replaceState(){}},URLSearchParams,setInterval:(f:Function)=>listeners.set('poll',f),fetch:(path:string,options:any)=>new Promise(resolve=>pending.push({path,options,resolve}))})
  const scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1])
  // Execute the early token capture too; workspace lifetime keeps its original assertions.
  // The retired Person-only launcher no longer adds server-side URL placeholders.
  for(const script of scripts)runInContext(script,context)
  runInContext('links=async()=>{};refreshMfa=async()=>{};refreshSmtp=async()=>{};notifications=async()=>{}',context)
  return {context,el,pending,listeners,document}
}
const tick=()=>new Promise<void>(r=>setImmediate(r))
async function answer(h:ReturnType<typeof harness>,path:string,data:any,ok=true){const p=h.pending.find(p=>p.path===path&&!p.answered)!;p.answered=true;p.resolve({ok,status:ok?200:403,json:async()=>data});await tick()}
async function loaded(h:ReturnType<typeof harness>){await answer(h,'/personal/session',{person_id:'private-person',csrf_token:'csrf'});await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[{id:'A',name:'private-org',role:'owner'}]})}

describe('selected Organization native Seller UI (script regression, not backend proof)',()=>{
  it('requires Organization, sends the selected scope, and ignores late cross-Organization responses',async()=>{
    const h=harness();
    (h.context as any).FormData=class {get(name:string){return name==='seller'?'sel_fixture':null}};
    runInContext("api=async path=>{globalThis.sellerPath=path;return {organization_id:'daorg_A',seller:{id:'sel_fixture'}}}",h.context);
    const submit=()=>h.el('seller').onsubmit({preventDefault(){},target:{}});
    await submit();
    expect(h.el('status').textContent).toContain('Önce erişiminiz olan kuruluşu seçin');
    expect((h.context as any).sellerPath).toBeUndefined();

    runInContext("currentOrg='daorg_A';organizationRequest=1",h.context);
    await submit();
    expect((h.context as any).sellerPath).toBe('contexts?type=member&organization=daorg_A&seller=sel_fixture');
    expect(JSON.parse(h.el('actor-result').textContent).organization_id).toBe('daorg_A');

    runInContext("api=path=>new Promise(resolve=>{globalThis.resolveSeller=resolve})",h.context);
    const delayed=submit();
    runInContext("currentOrg='daorg_B';organizationRequest++",h.context);
    (h.context as any).resolveSeller({organization_id:'daorg_A',seller:{id:'sel_fixture'}});
    await delayed;
    expect(h.el('actor-result').textContent).toBe('');
  });
});
describe('B22 Buyer catalogue Seller-window navigation (shipped browser JS)',()=>{
  it('moves to a later bounded Store window, back to first, and never enables checkout',async()=>{
    const h=harness()
    h.el('workspace').hidden=false
    h.el('buyer-context-panel').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=(path)=>new Promise(resolve=>{(globalThis.catalogCalls??=[]).push({path,resolve})})",
      h.context)
    const first=runInContext("buyerCatalog('daorg_a',1,0)",h.context)
    const calls=(h.context as any).catalogCalls as any[]
    expect(calls[0].path).toContain('organization_id=daorg_a')
    expect(calls[0].path).toContain('page=0')
    calls[0].resolve({organization_id:'daorg_a',page:0,stores:[
      {id:'sel_a',name:'Visible A',products:[
        {offer_id:'offer_a',product_id:'prod_a',title:'Product A'}
      ]}
    ],prices_available:false,checkout_ready:false})
    await first
    expect(h.el('buyer-catalog-items').children).toHaveLength(1)
    expect(h.el('buyer-catalog-status').textContent).toContain('1/5')
    expect(h.el('buyer-catalog-prev').disabled).toBe(true)
    expect(h.el('buyer-catalog-next').disabled).toBe(false)

    h.el('buyer-catalog-next').onclick()
    expect(calls).toHaveLength(2)
    expect(calls[1].path).toContain('page=1')
    expect(h.el('buyer-catalog-next').disabled).toBe(true)
    calls[1].resolve({organization_id:'daorg_a',page:1,stores:[
      {id:'sel_later',name:'Visible Later',products:[
        {offer_id:'offer_later',product_id:'prod_later',title:'Product Later'}
      ]}
    ],prices_available:false,checkout_ready:false})
    await tick()
    expect(h.el('buyer-catalog-items').children).toHaveLength(1)
    expect(h.el('buyer-catalog-items').children[0].textContent).toContain('Product Later')
    expect(h.el('buyer-catalog-status').textContent).toContain('2/5')
    expect(h.el('buyer-catalog-prev').disabled).toBe(false)

    h.el('buyer-catalog-prev').onclick()
    expect(calls).toHaveLength(3)
    expect(calls[2].path).toContain('page=0')
    calls[2].resolve({organization_id:'daorg_a',page:0,stores:[],
      prices_available:false,checkout_ready:false})
    await tick()
    expect(h.el('buyer-catalog-status').textContent).toContain('1/5')
    expect(h.el('buyer-catalog-status').textContent).toContain('Bu dilimde gösterilebilir ürün yok')
    expect(h.el('buyer-catalog-prev').disabled).toBe(true)
    expect(h.el('buyer-catalog-panel').hidden).toBe(false)
  })
  it('rejects late previous-page and cross-Organization replies without leaking titles',async()=>{
    const h=harness()
    h.el('workspace').hidden=false
    h.el('buyer-context-panel').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=(path)=>new Promise(resolve=>{(globalThis.catalogCalls??=[]).push({path,resolve})})",
      h.context)
    const old=runInContext("buyerCatalog('daorg_a',1,0)",h.context)
    const next=runInContext("buyerCatalog('daorg_a',1,1)",h.context)
    const calls=(h.context as any).catalogCalls as any[]
    calls[1].resolve({organization_id:'daorg_a',page:1,stores:[],
      prices_available:false,checkout_ready:false})
    await next
    calls[0].resolve({organization_id:'daorg_a',page:0,stores:[
      {id:'sel_wrong',name:'Wrong',products:[
        {offer_id:'offer_wrong',product_id:'prod_wrong',title:'Must not render'}
      ]}
    ],prices_available:false,checkout_ready:false})
    await old
    expect(h.el('buyer-catalog-items').children).toHaveLength(0)
    expect(h.el('buyer-catalog-status').textContent).toContain('2/5')
    const switched=runInContext("buyerCatalog('daorg_a',1,2)",h.context)
    expect(calls[2].path).toContain('page=2')
    runInContext("organizationRequest++;currentOrg='daorg_b'",h.context)
    calls[2].resolve({organization_id:'daorg_a',page:2,stores:[
      {id:'sel_other',name:'Other',products:[
        {offer_id:'offer_other',product_id:'prod_other',title:'Private title'}
      ]}
    ],prices_available:false,checkout_ready:false})
    await switched
    expect(h.el('buyer-catalog-items').children).toHaveLength(0)
    expect(h.el('buyer-catalog-status').textContent).not.toContain('Private title')
  })
  it('fails closed on a response with the wrong page number',async()=>{
    const h=harness()
    h.el('workspace').hidden=false
    h.el('buyer-context-panel').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;api=async()=>({"+
      "organization_id:'daorg_a',page:2,stores:[],prices_available:false,checkout_ready:false"+
      "})",h.context)
    await runInContext("buyerCatalog('daorg_a',1,1)",h.context)
    expect(h.el('buyer-catalog-panel').hidden).toBe(true)
    expect(h.el('buyer-catalog-items').children).toHaveLength(0)
    expect(h.el('buyer-catalog-next').disabled).toBe(true)
  })
})
describe('B22 native Store price-group selector request lifetime',()=>{
  it('does not strand action buttons or show a stale result after switching Stores',async()=>{
    const h=harness()
    const form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_a'},
      buyer_organization_id:{value:'daorg_b'}
    }
    const buttons=[{disabled:false},{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    ;(h.document as any).createDocumentFragment=()=>({append(){}})
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=(path)=>new Promise(resolve=>{(globalThis.groupCalls??=[]).push({path,resolve})})",h.context)
    const oldAction=form.onsubmit({preventDefault(){},currentTarget:form,
      submitter:{value:'read'}})
    expect(buttons.every(button=>button.disabled)).toBe(true)
    expect(((h.context as any).groupCalls as any[])[0].path).toContain('buyer_organization_id=')
    fields.seller_id.value='sel_b'
    const changed=runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    await tick()
    expect(buttons.every(button=>button.disabled===false)).toBe(true)
    expect(fields.customer_group_id.value).toBe('')
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    const pending=(h.context as any).groupCalls as any[]
    expect(pending).toHaveLength(2)
    expect(pending[1].path).toContain('seller_id=sel_b')
    expect(pending[1].path).toContain('view=list')
    pending[0].resolve({status:'active'})
    await oldAction
    expect(h.el('store-price-group-status').textContent).not.toContain('kabul edilmiş')
    expect(buttons.every(button=>button.disabled===false)).toBe(true)
    pending[1].resolve({organization_id:'daorg_a',seller_id:'sel_b',groups:[]})
    await changed
    expect(buttons.every(button=>button.disabled===false)).toBe(true)
  })
  it('retains unknown A grant across A->B->A, ignores late POST and clears only after a settled scoped read',async()=>{
    const h=harness()
    const form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_a'},
      buyer_organization_id:{value:'daorg_b'}
    }
    const buttons=[{disabled:false},{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    ;(h.document as any).createDocumentFragment=()=>({append(){}})
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=(path,options)=>new Promise(resolve=>{(globalThis.groupCalls??=[]).push({path,options,resolve})})",
      h.context)
    const send=(action:string)=>form.onsubmit({
      preventDefault(){},currentTarget:form,submitter:{value:action}
    })
    const oldGrant=send('grant')
    let calls=(h.context as any).groupCalls as any[]
    expect(calls).toHaveLength(1)
    expect(calls[0].options.method).toBe('POST')
    expect(buttons.every(b=>b.disabled)).toBe(true)
    fields.seller_id.value='sel_b'
    const toB=runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    await tick()
    expect(buttons.every(b=>!b.disabled)).toBe(true)
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    fields.seller_id.value='sel_a'
    const toA=runInContext("storePriceGroupChoices('daorg_a','sel_a',1)",h.context)
    await tick()
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    expect(fields.customer_group_id.value).toBe('')
    expect(buttons.every(b=>!b.disabled)).toBe(true)
    calls=(h.context as any).groupCalls as any[]
    expect(calls.filter(c=>c.options?.method==='POST')).toHaveLength(1)
    // A recheck started BEFORE the grant settles must not erase its warning,
    // even if the grant finishes while this earlier read is in flight.
    fields.customer_group_id.value='cusgroup_a'
    const tooEarly=send('read')
    calls=(h.context as any).groupCalls as any[]
    expect(calls).toHaveLength(4)
    expect(calls[3].path).toContain('seller_id=sel_a')
    calls[0].resolve({status:'active'})
    await oldGrant
    calls[3].resolve({status:'active'})
    await tooEarly
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    expect(calls.filter(c=>c.options?.method==='POST')).toHaveLength(1)
    const validRead=send('read')
    calls=(h.context as any).groupCalls as any[]
    expect(calls).toHaveLength(5)
    calls[4].resolve({status:'active'})
    await validRead
    expect(h.el('store-price-group-status').textContent).toContain('kabul edilmiş')
    expect(h.el('store-price-group-status').textContent).not.toContain('Önceki mağazadaki işlem')
    expect(buttons.every(b=>!b.disabled)).toBe(true)
    calls[1].resolve({organization_id:'daorg_a',seller_id:'sel_b',groups:[]})
    calls[2].resolve({organization_id:'daorg_a',seller_id:'sel_a',groups:[]})
    await Promise.all([toB,toA])
    expect(calls.filter(c=>c.options?.method==='POST')).toHaveLength(1)
    expect(h.el('store-price-group-status').textContent).toContain('kabul edilmiş')
  })

  it('keeps a transport-uncertain write warning across Store switches without assuming a later read proves commit',async()=>{
    const h=harness()
    const form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_a'},
      buyer_organization_id:{value:'daorg_b'}
    }
    const buttons=[{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;api=async(path,options)=>{if(options?.method==='POST'){const e=new Error('503');e.uncertain=true;throw e}return {status:'active',organization_id:'daorg_a',seller_id:'sel_a',groups:[]}}",h.context)
    const send=(action:string)=>form.onsubmit({preventDefault(){},currentTarget:form,submitter:{value:action}})
    await send('grant')
    expect(h.el('store-price-group-status').textContent).toContain('Sonuç belirsiz')
    fields.seller_id.value='sel_b'
    await runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    fields.seller_id.value='sel_a'
    await runInContext("storePriceGroupChoices('daorg_a','sel_a',1)",h.context)
    fields.customer_group_id.value='cusgroup_a'
    await send('read')
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    expect(buttons.every(b=>!b.disabled)).toBe(true)
  })
  it('allows authorized verification after a terminal native 503, but blocks duplicate writes before that',async()=>{
    const h=harness()
    const form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_a'},
      buyer_organization_id:{value:'daorg_b'}
    }
    const buttons=[{disabled:false},{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=async(path,options)=>{"+
        "(globalThis.groupCalls??=[]).push({path,options});"+
        "if(options?.method==='POST'){const e=new Error('Outcome uncertain; recheck group');"+
          "e.uncertain=true;e.httpStatus=503;throw e}"+
        "if(path.includes('view=list'))return {organization_id:'daorg_a',"+
          "seller_id:path.includes('seller_id=sel_b')?'sel_b':'sel_a',groups:[]};"+
        "return {status:'active'}"+
      "}",h.context)
    const send=(action:string)=>form.onsubmit({
      preventDefault(){},currentTarget:form,submitter:{value:action}
    })
    await send('grant')
    expect(h.el('store-price-group-status').textContent).toContain('Sonuç belirsiz')
    fields.seller_id.value='sel_b'
    await runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    fields.seller_id.value='sel_a'
    await runInContext("storePriceGroupChoices('daorg_a','sel_a',1)",h.context)
    fields.customer_group_id.value='cusgroup_a'
    await send('grant')
    const calls=(h.context as any).groupCalls as any[]
    expect(calls.filter((c:any)=>c.options?.method==='POST')).toHaveLength(1)
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    await send('read')
    expect(h.el('store-price-group-status').textContent).toContain('kabul edilmiş')
    expect(h.el('store-price-group-status').textContent).not.toContain('Önceki mağazadaki işlem')
    expect(calls.filter((c:any)=>c.options?.method==='POST')).toHaveLength(1)
    expect(buttons.every((b:any)=>!b.disabled)).toBe(true)
  })
  it('does not let an early read overwrite a pending write during additional Store switches',async()=>{
    const h=harness()
    const form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_a'},
      buyer_organization_id:{value:'daorg_b'}
    }
    const buttons=[{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;api=(path,options)=>new Promise(resolve=>{(globalThis.groupCalls??=[]).push({path,options,resolve})})",h.context)
    const send=(action:string)=>form.onsubmit({preventDefault(){},currentTarget:form,submitter:{value:action}})
    const grant=send('grant')
    fields.seller_id.value='sel_b'
    const toB=runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    fields.seller_id.value='sel_a'
    const toA=runInContext("storePriceGroupChoices('daorg_a','sel_a',1)",h.context)
    fields.customer_group_id.value='cusgroup_a'
    const earlyRead=send('read')
    fields.seller_id.value='sel_b'
    const toBAgain=runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    const calls=(h.context as any).groupCalls as any[]
    calls.find(c=>c.path.includes('buyer_organization_id=')).resolve({status:'active'})
    await earlyRead
    fields.seller_id.value='sel_a'
    const backToA=runInContext("storePriceGroupChoices('daorg_a','sel_a',1)",h.context)
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    calls.find(c=>c.options?.method==='POST').resolve({status:'active'})
    await grant
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    for(const c of calls.filter(c=>c.path.includes('view=list')))c.resolve({organization_id:'daorg_a',seller_id:'sel_b',groups:[]})
    await Promise.all([toB,toA,toBAgain,backToA])
    expect(calls.filter(c=>c.options?.method==='POST')).toHaveLength(1)
  })
  it('F-01: late success belongs to the submitted Group/Buyer, never an edited selection',async()=>{
    const h=harness(),form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_x'},
      buyer_organization_id:{value:'daorg_y'}
    }
    const buttons=[{disabled:false},{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=(path,options)=>new Promise(resolve=>{(globalThis.groupCalls??=[]).push({path,options,resolve})})",h.context)
    const send=(action:string)=>form.onsubmit({
      preventDefault(){},currentTarget:form,submitter:{value:action}
    })
    const oldGrant=send('grant')
    const calls=(h.context as any).groupCalls as any[]
    expect(calls).toHaveLength(1)
    const original=JSON.parse(calls[0].options.body)
    expect([original.customer_group_id,original.buyer_organization_id])
      .toEqual(['cusgroup_x','daorg_y'])
    fields.customer_group_id.value='cusgroup_z'
    fields.buyer_organization_id.value='daorg_w'
    calls[0].resolve({status:'active'})
    await oldGrant
    expect(h.el('store-price-group-status').textContent).not.toContain('kabul edilmiş')
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    expect(runInContext("priceGroupUncertain.has(JSON.stringify(['daorg_a','sel_a','cusgroup_x','daorg_y']))",h.context)).toBe(true)
    // Current selection's authorized GET is not proof for the older write.
    const differentRead=send('read')
    calls[1].resolve({status:'revoked'})
    await differentRead
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    fields.customer_group_id.value='cusgroup_x'
    fields.buyer_organization_id.value='daorg_y'
    await send('grant')
    expect(calls.filter((x:any)=>x.options?.method==='POST')).toHaveLength(1)
    const scopedRead=send('read')
    calls[2].resolve({status:'active'})
    await scopedRead
    expect(h.el('store-price-group-status').textContent).toContain('kabul edilmiş')
    expect(h.el('store-price-group-status').textContent).not.toContain('Önceki mağazadaki işlem')
    expect(buttons.every(b=>!b.disabled)).toBe(true)
  })
  it('F-01: late terminal 503 cannot reject a different Group or Buyer selected in the form',async()=>{
    const h=harness(),form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_x'},
      buyer_organization_id:{value:'daorg_y'}
    }
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>[{disabled:false}]
    h.el('workspace').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1;"+
      "api=(path,options)=>new Promise((resolve,reject)=>{(globalThis.groupCalls??=[]).push({path,options,resolve,reject})})",h.context)
    const pending=form.onsubmit({preventDefault(){},currentTarget:form,submitter:{value:'grant'}})
    const calls=(h.context as any).groupCalls as any[]
    fields.customer_group_id.value='cusgroup_z'
    fields.buyer_organization_id.value='daorg_w'
    const error:any=new Error('Outcome uncertain; recheck group')
    error.uncertain=true;error.httpStatus=503
    calls[0].reject(error)
    await pending
    expect(h.el('store-price-group-status').textContent).not.toContain('İşlem reddedildi')
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    expect(runInContext("priceGroupUncertain.get(JSON.stringify(['daorg_a','sel_a','cusgroup_x','daorg_y']))?.settled",h.context)).toBe(true)
    expect(calls.filter((x:any)=>x.options?.method==='POST')).toHaveLength(1)
  })
  it('F-02: unreadable successful POST body stays uncertain across Store switches and cannot be resent',async()=>{
    const h=harness(),form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_x'},
      buyer_organization_id:{value:'daorg_y'}
    }
    const buttons=[{disabled:false},{disabled:false}]
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>buttons
    h.el('workspace').hidden=false
    ;(h.document as any).createDocumentFragment=()=>({append(){}})
    runInContext("currentOrg='daorg_a';organizationRequest=1",h.context)
    const send=(action:string)=>form.onsubmit({
      preventDefault(){},currentTarget:form,submitter:{value:action}
    })
    const grant=send('grant')
    const post=h.pending.find(p=>p.path==='/personal/store-price-groups'&&
      p.options?.method==='POST')!
    expect(post).toBeDefined()
    post.resolve({ok:true,status:200,json:async()=>{throw new SyntaxError('truncated JSON')}})
    await grant
    expect(h.el('store-price-group-status').textContent).toContain('Sonuç belirsiz')
    expect(h.el('store-price-group-status').textContent).not.toContain('İşlem reddedildi')
    fields.seller_id.value='sel_b'
    const toB=runInContext("storePriceGroupChoices('daorg_a','sel_b',1)",h.context)
    await tick()
    const listB=h.pending.find(p=>p.path.includes('view=list')&&p.path.includes('seller_id=sel_b'))!
    listB.resolve({ok:true,status:200,json:async()=>({organization_id:'daorg_a',seller_id:'sel_b',groups:[]})})
    await toB
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    fields.seller_id.value='sel_a'
    const toA=runInContext("storePriceGroupChoices('daorg_a','sel_a',1)",h.context)
    await tick()
    const listA=h.pending.find(p=>p.path.includes('view=list')&&p.path.includes('seller_id=sel_a'))!
    listA.resolve({ok:true,status:200,json:async()=>({organization_id:'daorg_a',seller_id:'sel_a',groups:[]})})
    await toA
    fields.customer_group_id.value='cusgroup_x'
    await send('grant')
    expect(h.pending.filter(p=>p.path==='/personal/store-price-groups'&&
      p.options?.method==='POST')).toHaveLength(1)
    const read=send('read')
    const readCall=h.pending.find(p=>p.path.includes('buyer_organization_id=daorg_y'))!
    readCall.resolve({ok:true,status:200,json:async()=>({status:'active'})})
    await read
    expect(h.el('store-price-group-status').textContent).toContain('Önceki mağazadaki işlem')
    expect(buttons.every(b=>!b.disabled)).toBe(true)
  })
  it('F-02: HTTP 200 with an invalid write status is uncertain rather than a rejected grant',async()=>{
    const h=harness(),form=h.el('store-price-group-form')
    const fields:Record<string,{value:string}>={
      seller_id:{value:'sel_a'},customer_group_id:{value:'cusgroup_x'},
      buyer_organization_id:{value:'daorg_y'}
    }
    form.elements={namedItem:(name:string)=>fields[name]}
    form.querySelectorAll=()=>[{disabled:false}]
    h.el('workspace').hidden=false
    runInContext("currentOrg='daorg_a';organizationRequest=1",h.context)
    const pending=form.onsubmit({preventDefault(){},currentTarget:form,submitter:{value:'grant'}})
    const post=h.pending.find(p=>p.path==='/personal/store-price-groups'&&p.options?.method==='POST')!
    post.resolve({ok:true,status:200,json:async()=>({unexpected:true})})
    await pending
    expect(h.el('store-price-group-status').textContent).toContain('Sonuç belirsiz')
    expect(runInContext("priceGroupUncertain.size",h.context)).toBe(1)
  })
})
describe('private workspace lifetime (script regression only)',()=>{
  it('polls with the no-touch header, stops while hidden, and clears private DOM',async()=>{
    const h=harness();await loaded(h)
    expect(h.el('workspace').hidden).toBe(false)
    const poll=h.listeners.get('poll')!();await tick()
    expect(h.pending.at(-1).options.headers['x-da-observe']).toBe('1')
    await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[{id:'A',name:'private-org',role:'owner'}]});await poll
    h.document.hidden=true;h.listeners.get('visibilitychange')!()
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('person').textContent).toBe('');expect(h.el('organizations').children).toHaveLength(0)
    expect(h.el('memberships-status').textContent).toBe('');expect(h.el('memberships').ariaBusy).toBe('false')
    expect(h.el('memberships-refresh').hidden).toBe(true);expect(h.el('memberships-refresh').disabled).toBe(true)
    const count=h.pending.length;await h.listeners.get('poll')!();expect(h.pending).toHaveLength(count)
  })
  it('ignores a private response that completes after pagehide',async()=>{
    const h=harness();await answer(h,'/personal/session',{person_id:'private-person',csrf_token:'csrf'})
    h.listeners.get('pagehide')!()
    await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[{id:'A',name:'old-secret',role:'owner'}]})
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('organizations').children).toHaveLength(0);expect(h.el('person').textContent).toBe('')
  })
  it('cannot restore membership rows or list status after pagehide during a pending list read',async()=>{
    const h=harness();await loaded(h)
    runInContext('loadTimeline=async()=>{}',h.context)
    const selection=runInContext("selectOrg('A')",h.context)
    await answer(h,'/personal/organizations?id=A',{organizations:[{id:'A',role:'owner'}]})
    expect(h.el('memberships').ariaBusy).toBe('true')
    h.listeners.get('pagehide')!()
    await answer(h,'/personal/memberships?organization=A',{memberships:[{id:'m',person_id:'old-private-person',role:'member',status:'active'}]})
    await selection
    expect(h.el('memberships').children).toHaveLength(0);expect(h.el('memberships-status').textContent).toBe('')
    expect(h.el('memberships').ariaBusy).toBe('false');expect(h.el('memberships-refresh').hidden).toBe(true)
  })
  it('conceals before revalidating persisted browser history',async()=>{
    const h=harness();await loaded(h)
    h.listeners.get('pageshow')!({persisted:true})
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('person').textContent).toBe('')
    expect(h.pending.at(-1).path).toBe('/personal/session')
  })
  it('clears private context when the visible observer is denied',async()=>{
    const h=harness();await loaded(h)
    const poll=h.listeners.get('poll')!();await tick();await answer(h,'/personal/organizations',{message:'Access denied'},false);await poll
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('organizations').children).toHaveLength(0);expect(h.el('person').textContent).toBe('')
  })
  it('does not touch the session by automatically loading after an observed scope change',async()=>{
    const h=harness();await loaded(h)
    const poll=h.listeners.get('poll')!();await tick();await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[]});await poll
    expect(h.el('workspace').hidden).toBe(true)
    expect(h.pending.filter(p=>p.path==='/personal/session')).toHaveLength(1)
    expect(h.el('person').textContent).toBe('')
  })

  it('locks the current browser through native session DELETE and conceals before completion',async()=>{
    const h=harness();await loaded(h)
    const request=h.el('session-lock').onclick()
    expect(h.el('workspace').hidden).toBe(true)
    expect(h.el('session-lock').hidden).toBe(true)
    expect(h.el('notification-bell').hidden).toBe(true)
    expect(h.el('notification-list').children).toHaveLength(0)
    expect(h.el('person').textContent).toBe('')
    expect(h.el('login').hidden).toBe(false)
    const sent=h.pending.find(p=>p.path==='/personal/session?action=lock'&&!p.answered)!
    expect(sent.options.method).toBe('DELETE')
    expect(sent.options.credentials).toBe('same-origin')
    expect(sent.options.headers['x-csrf-token']).toBe('csrf')
    await answer(h,'/personal/session?action=lock',{success:true})
    await request
    expect(h.el('status').textContent).toContain('Oturum kilitlendi.')
    expect(h.el('workspace').hidden).toBe(true)
  })
  it('does not claim a completed lock after a rejected native revoke',async()=>{
    const h=harness();await loaded(h)
    const request=h.el('session-lock').onclick()
    await answer(h,'/personal/session?action=lock',{message:'Access denied'},false)
    await request
    expect(h.el('workspace').hidden).toBe(true)
    expect(h.el('person').textContent).toBe('')
    expect(h.el('status').textContent).toContain('Kilitleme doğrulanamadı.')
    expect(h.el('status').textContent).not.toContain('Oturum kilitlendi.')
  })

})

describe("M0 canonical Person mobile workspace lifetime",()=>{
  it.each([true,false])("does not repeat uncertain mobile POST; readback succeeds=%s",async readbackSucceeds=>{
    const h=harness(),form=h.el('person-mobile-form')
    h.el('workspace').hidden=false
    runInContext("currentPersonId='daprs_A';viewEpoch=3;"+
      "api=(path,options)=>new Promise((resolve,reject)=>{(globalThis.mobileCalls??=[]).push({path,options,resolve,reject})})",
      h.context)
    const initial=runInContext("refreshPersonMobile()",h.context)
    const calls=(h.context as any).mobileCalls as any[]
    calls[0].resolve({mobile_phone:"+905551234567",version:1,phone_verified:false})
    await initial
    expect(form.hidden).toBe(false)
    form.elements.mobile_phone.value="+905551234568"
    const save=form.onsubmit({preventDefault(){},target:form})
    expect(calls[1].options.method).toBe('POST')
    calls[1].reject(new Error('connection lost after possible commit'))
    await tick()
    expect(calls[2].path).toBe('profile')
    expect(calls[2].options).toBeUndefined()
    if(readbackSucceeds){
      calls[2].resolve({mobile_phone:"+905551234568",version:2,phone_verified:false})
    }else{
      calls[2].reject(new Error('readback unavailable'))
    }
    await save
    expect(calls.filter(c=>c.options?.method==='POST')).toHaveLength(1)
    if(readbackSucceeds){
      expect(form.hidden).toBe(false)
      expect(form.elements.mobile_phone.value).toBe("+905551234568")
      expect(h.el('person-mobile-status').textContent).toContain('Güncel telefon kaydını kontrol edin')
      expect(h.el('person-mobile-status').textContent).not.toContain('İşlem sonucu yeniden kontrol edildi')
    }else{
      expect(form.hidden).toBe(true)
      expect(form.elements.mobile_phone.value).toBe('')
      expect(h.el('status').textContent).toContain('sonucu doğrulanamadı')
      expect(h.el('status').textContent).not.toContain('yeniden kontrol edildi')
    }
  })
  it("loads only a verified current Person contact and clears it before another Person may render",async()=>{
    const h=harness()
    h.el('workspace').hidden=false
    runInContext("currentPersonId='daprs_A';viewEpoch=2;"+
      "api=path=>new Promise(resolve=>(globalThis.profileReads??=[]).push({path,resolve}))",
      h.context)
    const old=runInContext("refreshPersonMobile()",h.context)
    const reads=(h.context as any).profileReads as any[]
    expect(reads[0].path).toBe('profile')
    runInContext("clearPersonMobile();currentPersonId='daprs_B';viewEpoch++",h.context)
    reads[0].resolve({mobile_phone:"+905551234567",version:1,phone_verified:false})
    await old
    expect(h.el('person-mobile-form').hidden).toBe(true)
    expect(h.el('person-mobile-form').elements.mobile_phone.value).toBe('')
    const fresh=runInContext("refreshPersonMobile()",h.context)
    reads[1].resolve({mobile_phone:"+905551234568",version:2,phone_verified:false})
    await fresh
    expect(h.el('person-mobile-form').hidden).toBe(false)
    expect(h.el('person-mobile-form').elements.mobile_phone.value).toBe("+905551234568")
    expect(h.el('person-mobile-status').textContent).toContain('doğrulanmadı')
  })
  it("fails closed for a malformed profile version or false phone-verification claim",async()=>{
    const h=harness()
    h.el('workspace').hidden=false
    runInContext("currentPersonId='daprs_A';viewEpoch=3;"+
      "api=async()=>({mobile_phone:'+905551234567',version:'1',phone_verified:true})",h.context)
    await runInContext("refreshPersonMobile()",h.context)
    expect(h.el('person-mobile-form').hidden).toBe(true)
    expect(h.el('person-mobile-form').elements.mobile_phone.value).toBe('')
  })
})
