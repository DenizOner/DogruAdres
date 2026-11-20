/**
 * #365 B22-08 — Native, task-owned A→Gamma stale-response negative.
 * Runs ONLY as a called child of the approved B22 real MFA Chrome/HTTPS/PG16
 * journey while Alpha has two independently approved OPEN Stores.
 *
 * Hold delivery of ONE genuine HTTP Response inside the disposable Chrome
 * page; do not mock the Response, mutate server transport, or patch product
 * code. This models JS response-order inversion, NOT server/CDP delay.
 */
import assert from "node:assert/strict"
import {B06Chrome} from "./b06-ui-browser"

export async function verifyB22MultiOrgStaleStoreResponse(input:{
  browser:B06Chrome;
  alpha:{id:string;name:string;storeIds:[string,string];storeNames:[string,string]};
  gamma:{id:string;name:string;storeId:string;storeName:string};
  q:(sql:string,args?:unknown[])=>Promise<any[]>;
}):Promise<void>{
  const {browser,alpha,gamma,q}=input
  assert.notEqual(alpha.id,gamma.id,"Two distinct Organizations required")
  assert.equal(new Set([...alpha.storeIds,gamma.storeId]).size,3,
    "Three independently approved Store identities required")
  const auditBefore=Number((await q(
    "select count(*)::int n from da_audit_event"))[0].n)
  const outboxBefore=Number((await q(
    "select count(*)::int n from da_audit_outbox"))[0].n)
  // Initial Alpha selection itself starts multiple legitimate list GETs
  // (primary stores, buyer-block picker, owner grants). Let them ALL settle.
  // Gate a single user-triggered native stores-refresh GET, not an arbitrary
  // first request from that parallel navigation batch.
  await browser.select(alpha.name,"owner")
  await browser.wait("!document.getElementById('workspace').hidden&&"+
    "!document.getElementById('org-stores-refresh').disabled&&"+
    "document.getElementById('org-stores').textContent.includes("+
      JSON.stringify(alpha.storeNames[0])+")&&"+
    "document.getElementById('org-stores').textContent.includes("+
      JSON.stringify(alpha.storeNames[1])+")")
  const httpStart=browser.http.length
  let installed=false
  try{
    // Only the requested ordinary Alpha list GET is held. Fetch still reaches
    // the real native API with its original credentials, headers and cookies.
    // The underlying Response stays unchanged and is delivered only once.
    const armed=await browser.callFunction(`function(alphaId,gammaId){
      if(globalThis.__da365StaleRace)throw Error('Race hook already armed')
      const state={
        original:window.fetch,alphaId,gammaId,alphaRequests:0,gammaRequests:0,
        alphaReady:false,gammaReady:false,alphaStatus:null,gammaStatus:null,
        alphaFailed:false,writes:0,released:false,releaseAlpha:null
      }
      globalThis.__da365StaleRace=state
      window.fetch=function(...args){
        const request=args[0],options=args[1]||{}
        const raw=typeof request==='string'?request:request.url
        const url=new URL(raw,location.origin)
        const method=String(options.method||(
          typeof request==='object'&&request.method)||'GET').toUpperCase()
        if(method==='POST')state.writes++
        const isList=url.pathname==='/personal/organization-stores'&&
          method==='GET'&&!url.searchParams.has('purpose')
        const org=url.searchParams.get('organization')
        if(isList&&org===alphaId){
          state.alphaRequests++
          if(state.alphaRequests===1){
            return Promise.resolve(Reflect.apply(state.original,window,args))
              .then(response=>{
                state.alphaStatus=response.status
                state.alphaReady=true
                return new Promise(resolve=>{
                  state.releaseAlpha=()=>{
                    if(state.released)return
                    state.released=true
                    resolve(response)
                  }
                })
              },error=>{state.alphaFailed=true;throw error})
          }
        }
        if(isList&&org===gammaId){
          state.gammaRequests++
          return Promise.resolve(Reflect.apply(state.original,window,args))
            .then(response=>{
              state.gammaReady=true;state.gammaStatus=response.status
              return response
            })
        }
        return Reflect.apply(state.original,window,args)
      }
      return true
    }`,alpha.id,gamma.id)
    assert.equal(armed,true,"A bounded real-fetch hook must be installed")
    installed=true

    // The current signed MFA browser profile is already the authorized Owner.
    // Selector clicks are real Chrome UI actions; no synthesized session or DTO.
    await browser.click("#org-stores-refresh")
    await browser.wait("!!globalThis.__da365StaleRace&&"+
      "(globalThis.__da365StaleRace.alphaReady||"+
      "globalThis.__da365StaleRace.alphaFailed)")
    const alphaState=await browser.eval(
      "({count:__da365StaleRace.alphaRequests,"+
      "status:__da365StaleRace.alphaStatus,"+
      "ready:__da365StaleRace.alphaReady})")
    assert.deepEqual(alphaState,{count:1,status:200,ready:true},
      "One real Alpha HTTPS 200 response must be held before switching")

    await browser.select(gamma.name,"owner")
    await browser.wait("!!globalThis.__da365StaleRace&&"+
      "globalThis.__da365StaleRace.gammaReady&&"+
      "globalThis.__da365StaleRace.gammaStatus===200&&"+
      "!document.getElementById('org-stores-panel').hidden&&"+
      "document.getElementById('org-stores').textContent.includes("+
        JSON.stringify(gamma.storeName)+")")
    const gammaState=await browser.eval(
      "({count:__da365StaleRace.gammaRequests,"+
      "status:__da365StaleRace.gammaStatus})")
    assert.ok(gammaState.count>=1&&gammaState.status===200,
      "Gamma must load its own real authorized native HTTPS 200 GET")

    const released=await browser.callFunction(`function(){
      const state=globalThis.__da365StaleRace
      if(!state||state.alphaRequests!==1||!state.alphaReady||
        !state.gammaReady||state.gammaStatus!==200||
        typeof state.releaseAlpha!=='function')return false
      state.releaseAlpha()
      return state.released
    }`)
    assert.equal(released,true,"Delayed Alpha genuine response must be delivered")
    // Let the previously awaiting fetch/json/epoch guards settle in Chrome.
    await new Promise(resolve=>setTimeout(resolve,250))

    const state=await browser.eval(
      "({alpha:__da365StaleRace.alphaRequests,"+
      "gamma:__da365StaleRace.gammaRequests,"+
      "writes:__da365StaleRace.writes,"+
      "released:__da365StaleRace.released})")
    assert.equal(state.alpha,1,"Exactly one Alpha ordinary GET may be gated")
    assert.ok(state.gamma>=1,"Gamma must have its own authorized GET")
    assert.equal(state.writes,0,"Organization switches may send no POST")
    assert.equal(state.released,true)

    const scopedView=await browser.eval(`(()=>{
      const ids=['org-stores','org-stores-status','store-rename-panel',
        'store-owner-pause-panel','store-block-panel',
        'store-price-group-panel','product-draft-panel']
      return ids.map(id=>{
        const root=document.getElementById(id)
        if(!root||root.hidden)return ''
        return root.textContent+' '+
          Array.from(root.querySelectorAll('option'))
            .map(option=>option.value+' '+option.textContent).join(' ')
      }).join(' ')
    })()`)
    assert.equal(typeof scopedView,"string")
    assert.ok(scopedView.includes(gamma.storeName),
      "Gamma's real native Store must remain present in the current private view")
    for(const secret of [...alpha.storeIds,...alpha.storeNames])
      assert.equal(scopedView.includes(secret),false,
        "A delayed Alpha response must never reveal prior Store data in Gamma private controls")
    const gammaSelected=await browser.eval(
      "JSON.parse(document.getElementById('detail').textContent||'{}').id")
    assert.equal(gammaSelected,gamma.id,
      "The active Organization must remain Gamma after stale Alpha delivery")
    const http=browser.http.slice(httpStart)
    assert.ok(http.filter(x=>x.path==="/personal/organization-stores"&&
      x.method==="GET"&&x.status===200&&x.tls).length>=2,
      "Both list reads must be real HTTPS GET 200 in Chrome network evidence")
    assert.equal(http.some(x=>x.method==="POST"),false,
      "No network POST is authorized during these selector switches")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_event"))[0].n),auditBefore,
      "Response inversion must not append durable audit writes")
    assert.equal(Number((await q(
      "select count(*)::int n from da_audit_outbox"))[0].n),outboxBefore,
      "Response inversion must not enqueue notifications or outbox writes")
  }finally{
    if(installed){
      // On every error, first settle any held native Response (avoid pending
      // Promise/credentials), then restore the ORIGINAL browser fetch.
      const restored=await browser.callFunction(`function(){
        const state=globalThis.__da365StaleRace
        if(!state||typeof state.original!=='function')return false
        try{
          if(typeof state.releaseAlpha==='function')state.releaseAlpha()
        }finally{
          window.fetch=state.original
          delete globalThis.__da365StaleRace
        }
        return window.fetch===state.original
      }`)
      assert.equal(restored,true,
        "Browser fetch cleanup must restore the original in every outcome")
    }
  }
    process.stdout.write(
      "PASS B22 Chrome: #365 B22-08 real Alpha HTTPS GET200 delivered after "+
      "Gamma GET200; no stale private Store DOM/controls, no browser POST, "+
      "audit/outbox unchanged; browser-local JS ordering only\n")
}
