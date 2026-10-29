/** Genuine Storefront rendering and expected raw-native denial; Option A positive lives in b20-single-login.exec.ts. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash,randomBytes} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,symlinkSync,openSync,closeSync,cpSync,readdirSync} from 'node:fs'
import {join,resolve,dirname} from 'node:path'
import {spawn,type ChildProcess} from 'node:child_process'
import {createServer} from 'node:http'
import {createServer as createNetServer} from 'node:net'
import {request as httpsRequest} from 'node:https'
import {Client} from '@medusajs/framework/pg'
import {ApiLoader,expressLoader} from '@medusajs/framework/http'
import {createRegionsWorkflow,createSalesChannelsWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow,createProductsWorkflow} from '@medusajs/medusa/core-flows'
import {B19Chrome,until} from './b19-browser'

export default async function({container}:any){
  const dir=process.env.B20_DIR!,api=process.cwd(),root=resolve(api,'../..'),storefront=join(root,'apps/storefront')
  const record=(n:string,v:any)=>writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2),{flag:'wx'})
  // A boundary-only probe needs no frontend dependency or native token storage.
  if(process.env.B20_NATIVE_BOUNDARY_ONLY==='true')return nativeBoundary(container,record)
  // Resolve only the exact installed dependency through this worktree's dependency tree.
  const installed=join(root,'node_modules','.bun')
  const candidates=readdirSync(installed).filter(n=>n.startsWith('@mercurjs+vendor@2.3.7+'))
  assert.equal(candidates.length,1,'Exact installed Vendor 2.3.7 dependency must be unambiguous')
  const vendorPackage=join(installed,candidates[0],'node_modules/@mercurjs/vendor')
  assert.equal(JSON.parse(readFileSync(join(vendorPackage,'package.json'),'utf8')).version,'2.3.7')
  const vendorRoot=join(vendorPackage,'dist')
  const sourceFiles=['chunk-UKLW4VDE.js','chunk-3JFOBIRE.js','index.d.ts']
  const sources=sourceFiles.map(n=>({file:n,source:readFileSync(join(vendorRoot,n),'utf8')}))
  const token=sources[0].source,login=sources[1].source
  assert.ok(token.includes('localStorage.setItem(key, value)')&&token.includes('credentials: "omit"')&&login.includes('setAuthToken(data.token)'))
  record('vendor-source-boundary',{head:process.env.B20_HEAD,version:JSON.parse(readFileSync(join(vendorRoot,'../package.json'),'utf8')).version,
    files:sources.map(s=>({file:s.file,sha256:createHash('sha256').update(s.source).digest('hex')})),
    status:'SOURCE VERIFIED - NATIVE BROWSER LOGIN NOT AUTHORIZED',observed:'Installed native login stores returned token in localStorage under key mercur_vendor_auth_token; client hardcodes credentials omit.',
    scope:'Source inspection only. Option A forbids browser actor JWTs and a second native login; this is not an approved positive acceptance path.'})
  const pg=new Client({connectionString:process.env.DATABASE_URL});await pg.connect()
  assert.equal((await pg.query('select current_database() db')).rows[0].db,process.env.B20_DATABASE)
  assert.match((await pg.query('select version() v')).rows[0].v,/PostgreSQL 16\./)
  const fReq=createRequire(require.resolve('@medusajs/framework')),express=fReq('express'),app=express()
  app.disable('x-powered-by');app.use((req:any,_res:any,next:any)=>{req.scope=container.createScope();next()})
  const runtime=await expressLoader({app,container})
  const nativeServer=createServer(app)
  let nextProcess:ChildProcess|undefined,chrome:B19Chrome|undefined,log:number|undefined
  const protectedFiles=['next-env.d.ts','tsconfig.json','next.config.ts'].map(n=>join(storefront,n))
  const before=protectedFiles.map(p=>({path:p,hash:createHash('sha256').update(readFileSync(p)).digest('hex')}))
  try{
    await new ApiLoader({app,container,sourceDir:[join(dirname(require.resolve('@medusajs/medusa')),'api'),join(dirname(require.resolve('@mercurjs/core')),'api'),join(api,'src/api')]}).load()
    await new Promise<void>(r=>nativeServer.listen(0,'127.0.0.1',r))
    const backend='http://127.0.0.1:'+(nativeServer.address() as any).port
    const {result:[channel]}=await createSalesChannelsWorkflow(container).run({input:{salesChannelsData:[{name:'B20 synthetic catalog'}]}})
    const {result:[region]}=await createRegionsWorkflow(container).run({input:{regions:[{name:'B20 synthetic region',currency_code:'eur',countries:['de'],payment_providers:['pp_system_default']}]}})
    const {result:[key]}=await createApiKeysWorkflow(container).run({input:{api_keys:[{title:'B20 disposable Storefront',type:'publishable',created_by:''}]}})
    await linkSalesChannelsToApiKeyWorkflow(container).run({input:{id:key.id,add:[channel.id]}})
    const {result:[product]}=await createProductsWorkflow(container).run({input:{products:[{title:'B20 Synthetic Catalog Item',handle:'b20-synthetic-item',status:'published',sales_channels:[{id:channel.id}],options:[{title:'Size',values:['One']}],variants:[{title:'One',options:{Size:'One'},manage_inventory:false,prices:[{currency_code:'eur',amount:10}]}]}]}})
    const requests:any[]=[]
    for(const path of ['/store/regions','/store/products?region_id='+region.id]){
      const r=await fetch(backend+path,{headers:{'x-publishable-api-key':key.token}}),data=await r.json()
      requests.push({path,status:r.status});assert.equal(r.status,200)
      if(path.startsWith('/store/products'))assert.ok(data.products.some((p:any)=>p.id===product.id))
    }
    record('native-catalog',{status:'PASS',requests,region:region.id,product:product.id,sql:(await pg.query('select id,title,status from product where id=$1',[product.id])).rows})
    // A task-only Next runtime root snapshots project source and reuses existing dependencies.
    // Next can generate its own tsconfig/next-env/cache without touching the source checkout's originals.
    const nextRoot=join(dir,'storefront-runtime');mkdirSync(nextRoot)
    // Next's route discovery must see a real task-owned source tree, not an app-root junction.
    cpSync(join(storefront,'src'),join(nextRoot,'src'),{recursive:true,errorOnExist:true})
    for(const name of ['public','node_modules'])symlinkSync(join(storefront,name),join(nextRoot,name),'junction')
    for(const name of ['package.json','tsconfig.json','next-env.d.ts','postcss.config.mjs','tailwind.config.ts'])writeFileSync(join(nextRoot,name),readFileSync(join(storefront,name)))
    writeFileSync(join(nextRoot,'next.config.js'),'module.exports={outputFileTracingRoot:__dirname,reactStrictMode:true,images:{unoptimized:true},typescript:{ignoreBuildErrors:true}}')
    const tlsRoot='D:/DogruAdres/.worktrees/m0-vertical-evidence-20261020-a7f1/chrome-recovery-tls-20261021'
    const child=join(dir,'storefront-server.cjs')
    writeFileSync(child,`
const fs=require('node:fs'),https=require('node:https'),path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.join(process.cwd(),'package.json')),next=req('next');
const app=next({dev:true,dir:process.cwd(),hostname:'127.0.0.1',port:0});
(async()=>{await app.prepare();const handler=app.getRequestHandler();const server=https.createServer({cert:fs.readFileSync(process.env.B20_TLS_CERT),key:fs.readFileSync(process.env.B20_TLS_KEY)},async(req,res)=>{
if(req.url==='/personal'){const r=await fetch(process.env.MEDUSA_BACKEND_URL+'/personal');res.writeHead(r.status,{'content-type':'text/html'});res.end(await r.text());return;}return handler(req,res)});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync(process.env.B20_NEXT_READY,JSON.stringify({pid:process.pid,port:server.address().port})));
const close=async()=>{server.close();await app.close();process.exit(0)};process.on('SIGTERM',close);})().catch(e=>{console.error(e);process.exit(1)});
`)
    const ready=join(dir,'storefront-ready.json');log=openSync(join(dir,'storefront.log'),'wx')
    // Determine vendor panel port now so NEXT_PUBLIC_VENDOR_URL is set correctly before Next starts.
    const vendorPort:number=await new Promise<number>((res,rej)=>{const s=createNetServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as any).port;s.close(()=>res(p))});s.on('error',rej)})
    const vendorOrigin='http://127.0.0.1:'+vendorPort
    nextProcess=spawn(process.execPath,[child],{cwd:nextRoot,env:{...process.env,NODE_ENV:'development',MEDUSA_BACKEND_URL:backend,NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:key.token,NEXT_PUBLIC_DEFAULT_REGION:'de',NEXT_PUBLIC_VENDOR_URL:vendorOrigin,NEXT_PUBLIC_SITE_NAME:'B20 isolated Storefront',NEXT_TELEMETRY_DISABLED:'1',B20_TLS_CERT:join(tlsRoot,'server.pem'),B20_TLS_KEY:join(tlsRoot,'server-key.private.pem'),B20_NEXT_READY:ready},stdio:['ignore',log,log],windowsHide:true})
    const state=await until(async()=>{assert.equal(nextProcess!.exitCode,null,'Next runtime exited');try{return JSON.parse(readFileSync(ready,'utf8'))}catch{return false}},60000,'task Next ready')
    const origin='https://127.0.0.1:'+state.port
    // Compile the genuine Next page before the shared browser helper's 25s CDP navigation deadline.
    const rendered=await new Promise<{status:number;hasPage:boolean}>((resolve,reject)=>{
      const r=httpsRequest(origin+'/de',{ca:readFileSync(join(tlsRoot,'server.pem'))},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode!,hasPage:body.includes('Snag your style in a flash')}))})
      r.setTimeout(180000,()=>r.destroy(Error('Storefront compilation/render timeout')));r.on('error',reject);r.end()
    })
    record('storefront-http-render',rendered);assert.equal(rendered.status,200);assert.ok(rendered.hasPage)
    chrome=new B19Chrome(origin,'B20 actual Storefront');await chrome.start()
    await chrome.send('Network.setBlockedURLs',{urls:['*vendor.mercurjs.com*','*i.imgur.com*','*fonts.googleapis.com*','*fonts.gstatic.com*']})
    await chrome.send('Page.navigate',{url:origin+'/de'})
    await chrome.wait("document.querySelector('main') && document.body.innerText.includes('Snag your style in a flash')",120000)
    const ui=await chrome.eval("({title:document.title,text:document.body.innerText.slice(0,3000),externalDemoLinks:[...document.querySelectorAll('a[href]')].filter(a=>a.href.includes('vendor.mercurjs.com')).length})")
    assert.equal(ui.externalDemoLinks,0)
    await chrome.screenshot(join(dir,'storefront-render.png'))
    record('storefront-result',{head:process.env.B20_HEAD,status:'TEST EXECUTED AND PASSED',origin,ui,http:chrome.http})

    record('vendor-panel-result',{head:process.env.B20_HEAD,status:'BLOCKED',reason:'Installed Vendor App requires browser native token transport; no approved opaque-session transport seam established. No second native login performed.',approvedPositive:'integration-tests/postgres/b20-single-login.exec.ts',fullB20:'BLOCKED'})
  }catch(error){
    record('storefront-failure',{message:error instanceof Error?error.message:String(error),http:chrome?.http??[],nextExit:nextProcess?.exitCode})
    throw error
  }finally{
    await chrome?.close();if(nextProcess){nextProcess.kill();await until(async()=>nextProcess!.exitCode!==null||nextProcess!.signalCode!==null,10000,'task Next exit')}
    if(log!==undefined)closeSync(log)
    if(nativeServer.listening)await new Promise<void>(r=>nativeServer.close(()=>r()));await runtime.shutdown();await pg.end()
    assert.deepEqual(protectedFiles.map(p=>({path:p,hash:createHash('sha256').update(readFileSync(p)).digest('hex')})),before)
    record('storefront-protected-readback',{unchanged:true,files:before})
  }
}

/** Exercise the installed native contract without changing the ingress policy. */
async function nativeBoundary(container:any,record:(name:string,value:any)=>void){
  const pg=new Client({connectionString:process.env.DATABASE_URL})
  await pg.connect()
  let runtime:any,server:ReturnType<typeof createServer>|undefined
  try{
    assert.equal((await pg.query('select current_database() db')).rows[0].db,process.env.B20_DATABASE)
    assert.match((await pg.query('select version() v')).rows[0].v,/PostgreSQL 16\./)
    const fReq=createRequire(require.resolve('@medusajs/framework')),app=fReq('express')()
    app.use((req:any,_res:any,next:any)=>{req.scope=container.createScope();next()})
    runtime=await expressLoader({app,container})
    await new ApiLoader({app,container,sourceDir:[join(dirname(require.resolve('@medusajs/medusa')),'api'),join(dirname(require.resolve('@mercurjs/core')),'api'),join(process.cwd(),'src/api')]}).load()
    server=createServer(app)
    await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r))
    const origin='http://127.0.0.1:'+(server.address() as any).port
    const seller=container.resolve('seller'),auth=container.resolve('auth')
    const email='b20-native-'+randomBytes(8).toString('hex')+'@example.invalid',password=randomBytes(32).toString('base64url')
    const [member]=await seller.createMembers([{email,first_name:'Synthetic',last_name:'B20',is_active:true}])
    const [account]=await seller.createSellers([{name:'B20 boundary synthetic seller',email,currency_code:'eur'}])
    await seller.updateSellers([{id:account.id,status:'open'}])
    await seller.createSellerMembers([{seller_id:account.id,member_id:member.id}])
    const identity=await auth.register('emailpass',{body:{email,password}})
    assert.ok(identity.success)
    await auth.updateAuthIdentities({id:identity.authIdentity.id,app_metadata:{member_id:member.id}})
    const login=await fetch(origin+'/auth/member/emailpass',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})})
    assert.equal(login.status,200,'Native Member authentication must execute successfully')
    const loginData=await login.json();assert.ok(loginData.token)
    // Check only safe actor metadata; never persist or print the credential.
    const actor=JSON.parse(Buffer.from(loginData.token.split('.')[1],'base64url').toString('utf8'))
    assert.equal(actor.actor_type,'member');assert.equal(actor.actor_id,member.id)
    const observations:Array<{path:string;status:number;message?:string}>=[]
    for(const path of ['/vendor/members/me','/vendor/sellers/me']){
      const response=await fetch(origin+path,{headers:{authorization:'Bearer '+loginData.token}})
      const body=await response.json()
      observations.push({path,status:response.status,message:body.message})
    }
    const anonymous=await fetch(origin+'/vendor/sellers/me')
    const state={members:await seller.listMembers({id:member.id,is_active:true}),memberships:await seller.listSellerMembers({member_id:member.id}),sellers:await seller.listSellers({id:account.id,status:'open'})}
    assert.equal(state.members.length,1);assert.equal(state.memberships.length,1);assert.equal(state.sellers.length,1)
    for(const observation of observations)assert.equal(observation.status,401,'Raw native bearer must remain denied')
    record('native-boundary-result',{head:process.env.B20_HEAD,status:'PASS',nativeLoginStatus:login.status,
      actorClass:'native active Member with open Seller membership',nativeActorMatches:true,memberId:member.id,sellerId:account.id,
      verifiedNativeState:{activeMembers:state.members.length,memberships:state.memberships.length,openSellers:state.sellers.length},
      observations,anonymousStatus:anonymous.status,
      source:'src/api/personal/security.ts nativeIngress',
      frontend:'NOT TESTED - raw bearer negative only',
      conclusion:'Expected raw native bearer denial. Approved positive is the personal opaque-session server-only adapter; full Vendor frontend remains NOT TESTED.'})
    assert.equal(anonymous.status,401)
  }finally{
    if(server?.listening)await new Promise<void>(r=>server!.close(()=>r()))
    if(runtime)await runtime.shutdown()
    await pg.end()
  }
}
