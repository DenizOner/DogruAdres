import http from 'node:http'
import https from 'node:https'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
// Node 24's supported type-stripping loads this dependency-free shared contract.
import {ingressConfig} from '../src/utils/ingress-config.ts'

/** Closed method/path relay, never a general-purpose reverse proxy. */
export function allowedPublicRequest(method,path){
  const personal={
    '/personal':['GET'], '/personal/session':['GET','POST','DELETE'],
    '/personal/challenge':['POST'], '/personal/organizations':['GET'],
    '/personal/platform':['GET','POST'], '/personal/memberships':['GET','POST'],
    '/personal/invitations':['POST'], '/personal/mfa':['GET','POST'], '/personal/mfa/enroll':['POST'], '/personal/mfa/manage':['POST'],
    '/personal/contexts':['GET'],
    '/personal/links':['GET','POST'],
  }
  if(personal[path]?.includes(method))return true
  // Installed public read-only Store route classes; customer/cart/order writers
  // are deliberately absent. Their legal Buyer Organization contract is open.
  const catalog=/^\/store\/(regions|products|product-categories|collections|currencies|locales|offers|sellers|reviews|product-attributes|product-options|product-tags|product-types|product-variants|shipping-options|payment-providers|return-reasons)(?:\/[^/]+)?$/
  if(method==='GET' && (catalog.test(path)||['/cloud/auth','/health'].includes(path)))return true
  if(['GET','POST'].includes(method) && path==='/auth/verify-email')return true
  if(method==='POST' && (path==='/auth/verification/confirm'||/^\/auth\/(user|member|customer)\/emailpass\/(reset-password|update)$/.test(path)))return true
  if(method==='GET' && path==='/admin/api-keys')return 'machine'
  return false
}
export function startFrontdoor(env=process.env){
  const config=ingressConfig(env),upstream=config.privateOrigin
  const handler=async(req,res)=>{
    res.setHeader('Cache-Control','no-store')
    if(config.tls)res.setHeader('Strict-Transport-Security','max-age=31536000')
    try{
      const raw=req.url??'',authority=new URL(config.publicOrigin).host
      const securityHeaders=['host','origin','authorization','cookie','content-length','transfer-encoding']
      const names=req.rawHeaders.filter((_,i)=>i%2===0).map(v=>v.toLowerCase())
      const duplicate=securityHeaders.some(name=>names.filter(v=>v===name).length>1)
      const pathOnly=raw.split('?')[0]
      if(!raw.startsWith('/')||/[\\#]/.test(raw)||/%/.test(pathOnly)||raw.includes('//')||pathOnly.split('/').includes('..')||req.headers.host!==authority||duplicate){res.writeHead(400).end();return}
      const url=new URL(raw,config.publicOrigin)
      if(url.origin!==config.publicOrigin){res.writeHead(400).end();return}
      const mode=allowedPublicRequest(req.method,url.pathname)
      if(!mode || mode==='machine'&&!/^Basic /i.test(req.headers.authorization??'')){res.writeHead(401,{'Content-Type':'application/json'}).end('{"message":"Public ingress denied"}');return}
      const headers={}
      for(const key of ['origin','content-type','cookie','x-csrf-token','x-publishable-api-key'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key]
      // Only purpose-bound password reset and scoped machine auth need this
      // header. No browser actor header or seller context is forwarded.
      if(mode==='machine'||url.pathname.endsWith('/emailpass/update'))headers.authorization=req.headers.authorization??''
      const chunks=[];let size=0
      for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return}chunks.push(chunk)}
      const response=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(config.upstreamTimeoutMs),...(size?{body:Buffer.concat(chunks)}:{})})
      // Do not rewrite auth payloads to hide tokens. Only routes whose native
      // contracts are safe are reachable at all; redirects fail closed.
      if(response.status>=300&&response.status<400){res.writeHead(502).end();return}
      for(const key of ['content-type','content-security-policy','x-content-type-options'])if(response.headers.has(key))res.setHeader(key,response.headers.get(key))
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies)
      res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()))
    }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"Service unavailable"}')}
  }
  const server=config.tls?https.createServer({key:readFileSync(config.key),cert:readFileSync(config.cert),minVersion:'TLSv1.2'},handler):http.createServer(handler)
  server.requestTimeout=20000;server.headersTimeout=10000
  server.listen(config.port,config.host,()=>console.log('Validated front door listener ready'))
  return server
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startFrontdoor()
