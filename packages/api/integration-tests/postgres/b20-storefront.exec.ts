/** Independent Storefront prerequisite; never executes the prohibited native Vendor JWT-storage login. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash,randomBytes} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,symlinkSync,openSync,closeSync} from 'node:fs'
import {join,resolve,dirname} from 'node:path'
import {spawn,type ChildProcess} from 'node:child_process'
import {createServer} from 'node:http'
import {Client} from '@medusajs/framework/pg'
import {ApiLoader,expressLoader} from '@medusajs/framework/http'
import {createRegionsWorkflow,createSalesChannelsWorkflow,createApiKeysWorkflow,linkSalesChannelsToApiKeyWorkflow,createProductsWorkflow} from '@medusajs/medusa/core-flows'
import {B19Chrome,until} from './b19-browser'

export default async function({container}:any){
  const dir=process.env.B20_DIR!,api=process.cwd(),root=resolve(api,'../..'),storefront=join(root,'apps/storefront')
  const record=(n:string,v:any)=>writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2),{flag:'wx'})
  const projectRequire=createRequire(join('D:/DogruAdres/apps/vendor/package.json'))
  const vendorRoot=dirname(projectRequire.resolve('@mercurjs/vendor'))
  const sourceFiles=['chunk-UKLW4VDE.js','chunk-3JFOBIRE.js','index.d.ts']
  const sources=sourceFiles.map(n=>({file:n,source:readFileSync(join(vendorRoot,n),'utf8')}))
  const token=sources[0].source,login=sources[1].source
  assert.ok(token.includes('localStorage.setItem(key, value)')&&token.includes('credentials: "omit"')&&login.includes('setAuthToken(data.token)'))
  record('vendor-source-boundary',{head:process.env.B20_HEAD,version:JSON.parse(readFileSync(join(vendorRoot,'../package.json'),'utf8')).version,
    files:sources.map(s=>({file:s.file,sha256:createHash('sha256').update(s.source).digest('hex')})),
    status:'SECURITY BOUNDARY BLOCKED',observed:'Installed native login stores returned token in localStorage; client hardcodes credentials omit.',
    scope:'Source verified, not a performed native authorized panel action. No successful native login, token exchange, API gate relaxation or actor entitlement was created.'})
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
    // A task-only Next runtime root uses junctions to existing source/dependencies.
    // Next can generate its own tsconfig/next-env/cache without touching the source checkout's originals.
    const nextRoot=join(dir,'storefront-runtime');mkdirSync(nextRoot)
    for(const name of ['src','public','node_modules'])symlinkSync(join(storefront,name),join(nextRoot,name),'junction')
    for(const name of ['package.json','tsconfig.json','next-env.d.ts','postcss.config.mjs','tailwind.config.ts'])writeFileSync(join(nextRoot,name),readFileSync(join(storefront,name)))
    writeFileSync(join(nextRoot,'next.config.js'),'module.exports={reactStrictMode:true,images:{unoptimized:true},typescript:{ignoreBuildErrors:true}}')
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
    nextProcess=spawn(process.execPath,[child],{cwd:nextRoot,env:{...process.env,NODE_ENV:'development',MEDUSA_BACKEND_URL:backend,NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:key.token,NEXT_PUBLIC_DEFAULT_REGION:'de',NEXT_PUBLIC_VENDOR_URL:backend+'/seller',NEXT_PUBLIC_SITE_NAME:'B20 isolated Storefront',NEXT_TELEMETRY_DISABLED:'1',B20_TLS_CERT:join(tlsRoot,'server.pem'),B20_TLS_KEY:join(tlsRoot,'server-key.private.pem'),B20_NEXT_READY:ready},stdio:['ignore',log,log],windowsHide:true})
    const state=await until(async()=>{assert.equal(nextProcess!.exitCode,null,'Next runtime exited');try{return JSON.parse(readFileSync(ready,'utf8'))}catch{return false}},60000,'task Next ready')
    const origin='https://127.0.0.1:'+state.port
    chrome=new B19Chrome(origin,'B20 actual Storefront');await chrome.start()
    await chrome.send('Network.setBlockedURLs',{urls:['*vendor.mercurjs.com*','*i.imgur.com*','*fonts.googleapis.com*','*fonts.gstatic.com*']})
    await chrome.send('Page.navigate',{url:origin+'/de'})
    await chrome.wait("document.querySelector('main') && document.body.innerText.includes('Snag your style in a flash')",120000)
    const ui=await chrome.eval("({title:document.title,text:document.body.innerText.slice(0,3000),externalDemoLinks:[...document.querySelectorAll('a[href]')].filter(a=>a.href.includes('vendor.mercurjs.com')).length})")
    assert.equal(ui.externalDemoLinks,0)
    await chrome.screenshot(join(dir,'storefront-render.png'))
    record('storefront-result',{head:process.env.B20_HEAD,status:'TEST EXECUTED AND PASSED',origin,ui,http:chrome.http,limitation:'Storefront render and native synthetic catalog only; Vendor authorized action blocked by token-storage conflict; B20 launcher NOT IMPLEMENTED/NOT TESTED.'})
  }finally{
    await chrome?.close();if(nextProcess){nextProcess.kill();await until(async()=>nextProcess!.exitCode!==null||nextProcess!.signalCode!==null,10000,'task Next exit')}
    if(log!==undefined)closeSync(log)
    if(nativeServer.listening)await new Promise<void>(r=>nativeServer.close(()=>r()));await runtime.shutdown();await pg.end()
    assert.deepEqual(protectedFiles.map(p=>({path:p,hash:createHash('sha256').update(readFileSync(p)).digest('hex')})),before)
    record('storefront-protected-readback',{unchanged:true,files:before})
  }
}
