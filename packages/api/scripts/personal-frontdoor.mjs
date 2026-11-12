import http from 'node:http'
import https from 'node:https'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
// Node 24's supported type-stripping loads this dependency-free shared contract.
import {ingressConfig} from '../src/utils/ingress-config.ts'
import {signVisitorRateSource,VISITOR_RATE_HEADER} from '../src/utils/visitor-rate-source.ts'

/** Closed method/path relay, never a general-purpose reverse proxy. */
export function allowedPublicRequest(method,path){
  const personal={
    '/personal':['GET'], '/personal/session':['GET','POST','DELETE'],
    '/personal/challenge':['POST'], '/personal/register':['POST'], '/personal/organizations':['GET'],
    '/personal/organization-applications':['GET','POST'],
    '/personal/platform':['GET','POST'], '/personal/platform/smtp':['GET','POST'], '/personal/memberships':['GET','POST'],
    '/personal/invitations':['GET','POST'], '/personal/mfa':['GET','POST'], '/personal/mfa/enroll':['POST'], '/personal/mfa/manage':['POST'],
    '/personal/contexts':['GET'],
    '/personal/organization-stores':['GET'],
    '/personal/catalog':['GET'], '/personal/store-follows':['GET','POST'],
    '/personal/store-applications':['GET','POST'],
    '/personal/store-rename-requests':['GET','POST'],
    '/personal/store-owner-pause':['GET','POST'],
    '/personal/store-owner-closing':['GET','POST'],
    '/personal/store-platform-closing':['GET','POST'],
    '/personal/store-platform-closing-final-review':['POST'],
    '/personal/platform/store-closings':['GET','POST'],
    '/personal/platform/store-closing-reviews':['GET','POST'],
    '/personal/platform/store-closing-email-readiness':['GET'],
    '/personal/store-platform-closing-email-visit':['POST'],
      '/personal/store-draft-permissions':['GET','POST'],
    '/personal/platform/stores':['GET','POST'],
    '/personal/platform/store-renames':['GET','POST'],
    '/personal/store-buyer-blocks':['POST'],
    '/personal/store-product-permissions':['GET','POST'],
    '/personal/buyer-permissions':['GET','POST'],
    '/personal/buyer-context':['GET','POST'],
    '/personal/order-groups':['GET'],
    '/personal/product-drafts':['GET','POST'],
    '/personal/links':['GET','POST'],
    '/personal/audit-timeline':['GET'],
    '/personal/notifications':['GET','POST'],
    '/personal/launcher':['GET','POST'],
  }
  if(personal[path]?.includes(method))return true
  // #217 closed B4B: no unscoped catalog or seller/offer/search relay.
  // Region bootstrap supports the existing welcome/login locale middleware;
  // it contains no authenticated Buyer Organization pricing decision.
  const dashboard=/^\/dashboard(?:\/.*)?$/
  if(method==='GET' && (path==='/store/regions'||['/cloud/auth','/health'].includes(path)||dashboard.test(path)))return true
  if(['GET','POST','OPTIONS'].includes(method) && path==='/auth/verify-email')return true
  if(method==='POST' && (path==='/auth/verification/confirm'||/^\/auth\/(user|member|customer)\/emailpass\/(reset-password|update)$/.test(path)))return true
  if(method==='GET' && path==='/admin/api-keys')return 'machine'
  return false
}
// Never reflect arbitrary Origin or an unrestricted CORS wildcard. The
// storefront must be explicitly included in Medusa's configured STORE_CORS.
function verifiedStorefrontOrigin(origin,env) {
  if(typeof origin!=='string'||!origin)return null
  return (env.STORE_CORS??'').split(',').some(entry=>{
    const allowed=entry.trim()
    try{
      const url=new URL(allowed)
      const local=env.NODE_ENV!=='production' && url.protocol==='http:' &&
        ['localhost','127.0.0.1','[::1]'].includes(url.hostname)
      return allowed===url.origin && allowed===origin &&
        (url.protocol==='https:'||local)
    }catch{return false}
  })?origin:null
}
export function startFrontdoor(env=process.env){
  const config=ingressConfig(env),upstream=config.privateOrigin
  const handler=async(req,res)=>{
    res.setHeader('Cache-Control','no-store')
    res.setHeader('Referrer-Policy','no-referrer')
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
      const verifyEmail=url.pathname==='/auth/verify-email'
      const requestedOrigin=req.headers.origin
      const storeOrigin=verifyEmail?verifiedStorefrontOrigin(requestedOrigin,env):null
      if(verifyEmail && requestedOrigin && !storeOrigin){res.writeHead(403).end();return}
      if(req.method==='OPTIONS'){
        // No general OPTIONS proxy: the one single-use email token workflow
        // only needs a POST JSON browser preflight from a configured storefront.
        const method=req.headers['access-control-request-method']
        const asked=req.headers['access-control-request-headers']
        const requestedHeaders=typeof asked==='string'?asked.split(',').map(x=>x.trim().toLowerCase()):[]
        if(!verifyEmail||!storeOrigin||method!=='POST'||
          requestedHeaders.some(x=>!['content-type','accept'].includes(x))||
          requestedHeaders.includes('')){
          res.writeHead(403).end();return
        }
        res.setHeader('Access-Control-Allow-Origin',storeOrigin)
        res.setHeader('Vary','Origin')
        res.setHeader('Access-Control-Allow-Methods','GET, POST')
        res.setHeader('Access-Control-Allow-Headers','content-type, accept')
        res.writeHead(204).end();return
      }
      if(storeOrigin){
        res.setHeader('Access-Control-Allow-Origin',storeOrigin)
        res.setHeader('Vary','Origin')
      }
      // Both private B4B catalogue and historical order summary need
      // their own fixed privacy metadata at the public HTTPS boundary.
      // Never blindly forward arbitrary upstream Vary or X-Robots-Tag.
      if(req.method==='GET'&&
         ['/personal/catalog','/personal/order-groups'].includes(url.pathname)){
        res.setHeader('Vary','Cookie')
        res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive')
      }
      const headers={}
      for(const key of ['origin','content-type','cookie','x-csrf-token','x-publishable-api-key'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key]
      // Only purpose-bound password reset and scoped machine auth need this
      // header. No browser actor header or seller context is forwarded.
      if(mode==='machine'||url.pathname.endsWith('/emailpass/update'))headers.authorization=req.headers.authorization??''
      // Rate-limit source is derived ONLY from the public TLS socket. Never
      // forward incoming X-Forwarded-For or an incoming visitor-rate header.
      // The short-lived proof contains no raw client address and uses the
      // existing cookie secret with a distinct cryptographic purpose.
      if(req.method==='POST'&&['/personal/session','/personal/register'].includes(url.pathname))
        headers[VISITOR_RATE_HEADER]=signVisitorRateSource(
          req.socket.remoteAddress,env.COOKIE_SECRET??'',req.method,url.pathname)
      // The privacy observer retains the same session authorization as normal reads.
      if(req.method==='GET'&&url.pathname==='/personal/organizations'&&req.headers['x-da-observe']==='1')headers['x-da-observe']='1'
      const chunks=[];let size=0
      for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return}chunks.push(chunk)}
      const upstreamPath=url.pathname==='/dashboard'?'/dashboard/':url.pathname
      const response=await fetch(upstream+upstreamPath+url.search,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(config.upstreamTimeoutMs),...(size?{body:Buffer.concat(chunks)}:{})})
      // Do not rewrite auth payloads to hide tokens. Only routes whose native
      // contracts are safe are reachable at all; redirects fail closed.
      if(response.status>=300&&response.status<400){
        const loc=response.headers.get('location')??''
        if(loc.endsWith('/dashboard/')||loc==='/dashboard/'){res.writeHead(302,{'Location':'/dashboard/'}).end();return}
        res.writeHead(502).end();return
      }
      for(const key of ['content-type','content-security-policy','x-content-type-options'])if(response.headers.has(key))res.setHeader(key,response.headers.get(key))
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies)
      res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()))
    }catch(err){if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"Service unavailable"}')}
  }
  const server=config.tls?https.createServer({key:readFileSync(config.key),cert:readFileSync(config.cert),minVersion:'TLSv1.2'},handler):http.createServer(handler)
  server.requestTimeout=20000;server.headersTimeout=10000
  server.listen(config.port,config.host,()=>console.log('Validated front door listener ready'))
  return server
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startFrontdoor()
