import http from 'node:http'
import {pathToFileURL} from 'node:url'

/** Closed method/path relay, never a general-purpose reverse proxy. */
export function allowedPublicRequest(method,path){
  const personal={
    '/personal':['GET'], '/personal/session':['GET','POST','DELETE'],
    '/personal/challenge':['POST'], '/personal/organizations':['GET'],
    '/personal/platform':['GET','POST'], '/personal/memberships':['GET','POST'],
    '/personal/contexts':['GET'],
  }
  if(personal[path]?.includes(method))return true
  // Installed public read-only Store route classes; customer/cart/order writers
  // are deliberately absent. Their legal Buyer Organization contract is open.
  const catalog=/^\/store\/(regions|products|product-categories|collections|currencies|locales|offers|sellers|reviews|product-attributes|product-options|product-tags|product-types|product-variants|shipping-options|payment-providers|return-reasons)(?:\/[^/]+)?$/
  if(method==='GET' && (catalog.test(path)||['/cloud/auth','/health'].includes(path)))return true
  if(method==='POST' && (path==='/auth/verification/confirm'||/^\/auth\/(user|member|customer)\/emailpass\/(reset-password|update)$/.test(path)))return true
  if(method==='GET' && path==='/admin/api-keys')return 'machine'
  return false
}
export function startFrontdoor(){
  const upstream=process.env.DOGRUADRES_PRIVATE_API
  if(upstream!=='http://127.0.0.1:19100'||process.env.DOGRUADRES_PUBLIC_ORIGIN!=='http://127.0.0.1:19101')throw Error('Explicit isolated topology required')
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store')
    try{
      const url=new URL(req.url??'',process.env.DOGRUADRES_PUBLIC_ORIGIN)
      if(url.origin!==process.env.DOGRUADRES_PUBLIC_ORIGIN||url.pathname.includes('%')||url.pathname.includes('//')){res.writeHead(400).end();return}
      const mode=allowedPublicRequest(req.method,url.pathname)
      if(!mode || mode==='machine'&&!/^Basic /i.test(req.headers.authorization??'')){res.writeHead(401,{'Content-Type':'application/json'}).end('{"message":"Public ingress denied"}');return}
      const headers={}
      for(const key of ['origin','content-type','cookie','x-csrf-token','x-publishable-api-key'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key]
      // Only purpose-bound password reset and scoped machine auth need this
      // header. No browser actor header or seller context is forwarded.
      if(mode==='machine'||url.pathname.endsWith('/emailpass/update'))headers.authorization=req.headers.authorization??''
      const chunks=[];let size=0
      for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return}chunks.push(chunk)}
      const response=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(15000),...(size?{body:Buffer.concat(chunks)}:{})})
      // Do not rewrite auth payloads to hide tokens. Only routes whose native
      // contracts are safe are reachable at all; redirects fail closed.
      if(response.status>=300&&response.status<400){res.writeHead(502).end();return}
      for(const key of ['content-type','content-security-policy','x-content-type-options'])if(response.headers.has(key))res.setHeader(key,response.headers.get(key))
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies)
      res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()))
    }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"Service unavailable"}')}
  })
  server.requestTimeout=20000;server.headersTimeout=10000
  server.listen(19101,'127.0.0.1',()=>console.log('Task public front door: 127.0.0.1:19101 -> private API 127.0.0.1:19100'))
  return server
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startFrontdoor()
