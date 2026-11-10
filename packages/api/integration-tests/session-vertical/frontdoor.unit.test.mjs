import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {once} from 'node:events'
import {allowedPublicRequest,startFrontdoor} from '../../scripts/personal-frontdoor.mjs'

test("B22 Owner temporary pause permits only exact GET/POST first-party relay",()=>{
  for(const method of ["GET","POST"])
    assert.equal(allowedPublicRequest(method,"/personal/store-owner-pause"),true)
  for(const method of ["HEAD","OPTIONS","PUT","DELETE","PATCH"])
    assert.equal(allowedPublicRequest(method,"/personal/store-owner-pause"),false)
  for(const path of ["/personal/store-owner-pause/","/personal/store-owner-pause/sel_any",
    "/vendor/sellers/me","/admin/sellers/sel_test","/store/carts/cart_test/complete"])
    for(const method of ["GET","POST"])
      assert.equal(allowedPublicRequest(method,path),false)
})

test("B22 historic order read uses only the exact personal GET relay",()=>{
  assert.equal(allowedPublicRequest("GET","/personal/order-groups"),true)
  for(const method of ["POST","PUT","PATCH","DELETE","HEAD","OPTIONS"])
    assert.equal(allowedPublicRequest(method,"/personal/order-groups"),false)
  for(const path of ["/personal/order-groups/","/personal/order-groups/og_other",
    "/store/order-groups","/store/order-groups/og_other","/personal/ORDER-GROUPS"])
    assert.equal(allowedPublicRequest("GET",path),false)
})
test("B22 Store follow has exact private GET and CSRF POST ingress only",()=>{
  for(const method of ["GET","POST"])
    assert.equal(allowedPublicRequest(method,"/personal/store-follows"),true)
  for(const method of ["PUT","PATCH","DELETE","HEAD","OPTIONS"])
    assert.equal(allowedPublicRequest(method,"/personal/store-follows"),false)
  for(const path of ["/personal/store-follows/","/personal/store-follows/sel_other",
    "/store/sellers/sel_other/follow","/vendor/sellers/sel_other/follow"])
    for(const method of ["GET","POST"])
      assert.equal(allowedPublicRequest(method,path),false)
})

test("B22 Store applications and active Store read have exact public method/path contracts",()=>{
  for(const method of ["GET","POST"])
    for(const path of ["/personal/store-applications","/personal/store-draft-permissions"])
      assert.equal(allowedPublicRequest(method,path),true)
  assert.equal(allowedPublicRequest("GET","/personal/organization-stores"),true)
  assert.equal(allowedPublicRequest("GET","/personal/catalog"),true)
  assert.equal(allowedPublicRequest("POST","/personal/catalog"),false)
  for(const [path,method] of [
    ["/personal/store-draft-permissions","PATCH"],["/personal/store-draft-permissions","DELETE"],
    ["/personal/store-draft-permissions","OPTIONS"],["/personal/store-draft-permissions/other","POST"],
    ["/personal/store-applications","PATCH"],["/personal/store-applications","DELETE"],
    ["/personal/store-applications","OPTIONS"],["/personal/store-applications","HEAD"],
    ["/personal/store-applications/other","POST"],["/personal/organization-stores","POST"],
    ["/vendor/sellers","POST"],["/admin/sellers/sel_synthetic/approve","POST"]])
    assert.equal(allowedPublicRequest(method,path),false)
})

test('B19 notifications exposes only exact personal GET and POST',()=>{
  for(const method of ['GET','POST'])assert.equal(allowedPublicRequest(method,'/personal/notifications'),true)
  for(const method of ['PUT','PATCH','DELETE','OPTIONS','HEAD'])assert.equal(allowedPublicRequest(method,'/personal/notifications'),false)
  for(const path of ['/personal/notifications/','/personal/notifications/extra','/admin/notifications'])
    assert.equal(allowedPublicRequest('GET',path),false)
})

test('closed public method/path contract never exposes native login or refresh',()=>{
  for(const actor of ['user','member','customer'])for(const method of ['GET','POST'])
    assert.equal(allowedPublicRequest(method,`/auth/${actor}/emailpass`),false)
  for(const path of ['/auth/token/refresh','/auth/session','/auth/verification/request','/vendor/members/me','/store/customers/me','/hooks/private','/cloud/users','/plugin/private'])
    for(const method of ['GET','POST'])assert.equal(allowedPublicRequest(method,path),false)
})
test('B10 invitation adapter exposes only exact scoped GET and POST',()=>{
  for(const method of ['GET','POST'])assert.equal(allowedPublicRequest(method,'/personal/invitations'),true)
  for(const method of ['PUT','PATCH','DELETE','OPTIONS','HEAD'])
    assert.equal(allowedPublicRequest(method,'/personal/invitations'),false)
  for(const path of [
    '/personal/invitations/',
    '/personal/invitations/accept',
    '/personal/invitations/extra',
    '/dogruadres/invitations/accept',
    '/dogruadres/organizations/daorg_test/invitations',
    '/admin/dogruadres/invitations',
  ]) for(const method of ['GET','POST','OPTIONS'])
    assert.equal(allowedPublicRequest(method,path),false)
})

test('MFA settings has exact GET/POST relay only',()=>{
  for(const method of ['GET','POST'])assert.equal(allowedPublicRequest(method,'/personal/mfa'),true)
  for(const method of ['HEAD','OPTIONS','PUT','PATCH','DELETE'])assert.equal(allowedPublicRequest(method,'/personal/mfa'),false)
  for(const path of ['/personal/mfa/','/personal/mfa/admin','/dogruadres/mfa','/admin/mfa'])
    assert.equal(allowedPublicRequest('POST',path),false)
})
test('MFA enrollment is POST-only and never a native MFA wildcard',()=>{
  assert.equal(allowedPublicRequest('POST','/personal/mfa/enroll'),true)
  for(const method of ['GET','HEAD','OPTIONS','PUT','DELETE'])
    assert.equal(allowedPublicRequest(method,'/personal/mfa/enroll'),false)
  for(const path of ['/personal/mfa/enroll/extra','/auth/mfa/start','/auth/mfa/disable'])
    assert.equal(allowedPublicRequest('POST',path),false)
})
test('email verification route allows exact CORS preflight without general OPTIONS forwarding',()=>{
  for(const method of ['GET','POST','OPTIONS'])
    assert.equal(allowedPublicRequest(method,'/auth/verify-email'),true)
  for(const method of ['PUT','PATCH','DELETE','HEAD'])
    assert.equal(allowedPublicRequest(method,'/auth/verify-email'),false)
  assert.equal(allowedPublicRequest('OPTIONS','/auth/verify-email/extra'),false)
})

test('Store approvals and Buyer blocks relay only their approved methods',()=>{
  for(const m of ['GET','POST'])assert.equal(allowedPublicRequest(m,'/personal/platform/stores'),true)
  assert.equal(allowedPublicRequest('POST','/personal/store-buyer-blocks'),true)
  for(const [p,m] of [
    ['/personal/platform/stores','DELETE'],['/personal/platform/stores','OPTIONS'],
    ['/personal/platform/stores/other','POST'],['/personal/store-buyer-blocks','GET'],
    ['/personal/store-buyer-blocks','PATCH'],['/personal/store-buyer-blocks/other','POST'],
  ])assert.equal(allowedPublicRequest(m,p),false)
})

test('personal, locale bootstrap and purpose-bound recovery remain; B4B catalog stays closed',()=>{
  for(const path of ['/personal','/personal/contexts','/personal/memberships','/personal/audit-timeline','/store/regions'])
    assert.equal(allowedPublicRequest('GET',path),true)
  for(const path of ['/store/products','/store/products/prod_test','/store/offers','/store/sellers','/store/product-categories','/store/reviews','/store/regions/region_test'])
    assert.equal(allowedPublicRequest('GET',path),false)
  assert.equal(allowedPublicRequest('POST','/store/search'),false)
  for(const path of ['/auth/user/emailpass/reset-password','/auth/customer/emailpass/update','/auth/verification/confirm'])
    assert.equal(allowedPublicRequest('POST',path),true)
  assert.equal(allowedPublicRequest('GET','/admin/api-keys'),'machine')
  assert.equal(allowedPublicRequest('POST','/admin/api-keys'),false)
  assert.equal(allowedPublicRequest('GET','/personal/private'),false)
})

test('audit timeline route has exact GET relay only', () => {
  assert.equal(allowedPublicRequest('GET', '/personal/audit-timeline'), true)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    assert.equal(allowedPublicRequest(method, '/personal/audit-timeline'), false)
  for (const path of ['/personal/audit-timeline/', '/personal/audit-timeline/extra', '/dogruadres/organizations/daorg_test/audit-timeline'])
    assert.equal(allowedPublicRequest('GET', path), false)
})

test('platform SMTP settings has exact GET/POST relay only', () => {
  for (const method of ['GET', 'POST']) assert.equal(allowedPublicRequest(method, '/personal/platform/smtp'), true)
  for (const method of ['HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) assert.equal(allowedPublicRequest(method, '/personal/platform/smtp'), false)
  for (const path of ['/personal/platform/smtp/', '/personal/platform/smtp/extra'])
    assert.equal(allowedPublicRequest('POST', path), false)
})

// Real HTTP boundary: no catalog/private Store requests may reach the backend,
// even if a publishable key, native Bearer or personal cookie is supplied.
test('closed B4B frontdoor rejects catalog and search before contacting native API',async()=>{
  const seen=[]
  const upstream=http.createServer((req,res)=>{
    seen.push(req.url)
    res.setHeader('Content-Type','application/json')
    res.end('{"regions":[]}')
  })
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
  const reservation=http.createServer()
  reservation.listen(0,'127.0.0.1');await once(reservation,'listening')
  const port=reservation.address().port
  await new Promise(r=>reservation.close(r))
  const origin='http://127.0.0.1:'+port
  const front=startFrontdoor({NODE_ENV:'test',DOGRUADRES_PUBLIC_ORIGIN:origin,
    DOGRUADRES_PRIVATE_API:'http://127.0.0.1:'+upstream.address().port,
    DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:String(port)})
  await once(front,'listening')
  try{
    for(const path of ['/store/products','/store/products/prod_synthetic','/store/offers',
      '/store/product-categories','/store/sellers','/store/products?fields=*']){
      const response=await fetch(origin+path,{headers:{
        'x-publishable-api-key':'pk_synthetic',authorization:'Bearer forged',
        cookie:'da_session=synthetic'}})
      assert.equal(response.status,401)
      assert.equal((await response.json()).message,'Public ingress denied')
    }
    const search=await fetch(origin+'/store/search',{method:'POST',headers:{
      'content-type':'application/json','x-publishable-api-key':'pk_synthetic'
    },body:'{}'})
    assert.equal(search.status,401)
    assert.equal(seen.length,0,'Denied catalog must never reach private upstream')
    const regions=await fetch(origin+'/store/regions',{headers:{
      'x-publishable-api-key':'pk_synthetic'}})
    assert.equal(regions.status,200,'Locale bootstrap remains usable')
    assert.deepEqual(seen,['/store/regions'])
  }finally{
    front.closeAllConnections();upstream.closeAllConnections()
    await Promise.all([new Promise(r=>front.close(r)),new Promise(r=>upstream.close(r))])
  }
})

// Verify privacy metadata at the actual public HTTP boundary, including
// denied requests. Never trust/cache/index an upstream override.
test('B22 scoped catalogue has fixed noindex and Cookie Vary at the frontdoor',async()=>{
  const seen=[]
  const upstream=http.createServer((req,res)=>{
    seen.push(req.url)
    res.setHeader('Content-Type','application/json')
    res.setHeader('Cache-Control','public, max-age=3600')
    res.setHeader('Vary','Accept')
    res.setHeader('X-Robots-Tag','index, follow')
    res.statusCode=req.headers.cookie?200:403
    res.end(req.headers.cookie?'{"stores":[]}':'{"message":"Access denied"}')
  })
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
  const reservation=http.createServer()
  reservation.listen(0,'127.0.0.1');await once(reservation,'listening')
  const port=reservation.address().port
  await new Promise(resolve=>reservation.close(resolve))
  const origin='http://127.0.0.1:'+port
  const front=startFrontdoor({NODE_ENV:'test',DOGRUADRES_PUBLIC_ORIGIN:origin,
    DOGRUADRES_PRIVATE_API:'http://127.0.0.1:'+upstream.address().port,
    DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:String(port)})
  await once(front,'listening')
  try{
    for(const [cookie,expected] of [['da_session=synthetic',200],['',403]]){
      const response=await fetch(origin+'/personal/catalog?organization_id=daorg_test',{
        headers:cookie?{cookie}:{}
      })
      assert.equal(response.status,expected)
      assert.match(response.headers.get('cache-control')??'',/no-store/)
      assert.equal(response.headers.get('vary'),'Cookie')
      assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive')
      await response.json()
    }
    assert.deepEqual(seen,[
      '/personal/catalog?organization_id=daorg_test',
      '/personal/catalog?organization_id=daorg_test'
    ])
    // Do not expand the public relay or apply catalogue-specific policy
    // indiscriminately to unrelated purpose-bound routes.
    const other=await fetch(origin+'/personal/session')
    assert.equal(other.status,403)
    assert.equal(other.headers.get('x-robots-tag'),null)
    assert.equal(other.headers.get('vary'),null)
    await other.json()
  }finally{
    front.closeAllConnections();upstream.closeAllConnections()
    await Promise.all([
      new Promise(resolve=>front.close(resolve)),
      new Promise(resolve=>upstream.close(resolve))
    ])
  }
})

// Real local relay, controlled upstream: header forwarding contract only.
test('observer header is forwarded only for exact GET organizations and value 1',async()=>{
  const seen=[];
  const upstream=http.createServer((req,res)=>{seen.push({url:req.url,observer:req.headers['x-da-observe']});res.setHeader('Content-Type','application/json');res.end('{}')});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const origin='http://127.0.0.1:'+port;
  const front=startFrontdoor({NODE_ENV:'test',DOGRUADRES_PUBLIC_ORIGIN:origin,DOGRUADRES_PRIVATE_API:'http://127.0.0.1:'+upstream.address().port,DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:String(port)});await once(front,'listening');
  try{
    for(const [path,value] of [['/personal/organizations','1'],['/personal/organizations?id=daorg_test','1'],['/personal/organizations','01'],['/personal/organizations','true'],['/personal/session','1'],['/personal/memberships?organization=daorg_test','1']]){
      const r=await fetch(origin+path,{headers:{'x-da-observe':value}});assert.equal(r.status,200);await r.text();
    }
    assert.deepEqual(seen.map(r=>r.observer),['1','1',undefined,undefined,undefined,undefined]);
    const r=await fetch(origin+'/personal/organizations',{method:'POST',headers:{'x-da-observe':'1'}});assert.equal(r.status,401);await r.text();assert.equal(seen.length,6);
  }finally{front.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>front.close(r)),new Promise(r=>upstream.close(r))]);}
});

test('browser-facing privacy policy is fixed at the public header boundary',async()=>{
  const upstream=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.setHeader('Referrer-Policy','unsafe-url');res.end('<!doctype html><title>synthetic privacy fixture</title>')});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const origin='http://127.0.0.1:'+port;
  const front=startFrontdoor({NODE_ENV:'test',DOGRUADRES_PUBLIC_ORIGIN:origin,DOGRUADRES_PRIVATE_API:'http://127.0.0.1:'+upstream.address().port,DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:String(port)});await once(front,'listening');
  try{
    for(const path of ['/personal?invitation_token=synthetic-fixture','/auth/verify-email?token=synthetic-fixture']){
      const response=await fetch(origin+path);assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');await response.text();
    }
    const denied=await fetch(origin+'/auth/verification/request',{method:'POST'});assert.equal(denied.status,401);assert.equal(denied.headers.get('referrer-policy'),'no-referrer');await denied.text();
  }finally{front.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>front.close(r)),new Promise(r=>upstream.close(r))]);}
});

test('real public email CORS enforces configured Storefront origin and exact JSON preflight',async()=>{
  const seen=[]
  const upstream=http.createServer((req,res)=>{
    seen.push({url:req.url,method:req.method,origin:req.headers.origin})
    res.setHeader('Content-Type','application/json')
    res.end('{"ok":true}')
  })
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
  const reservation=http.createServer()
  reservation.listen(0,'127.0.0.1');await once(reservation,'listening')
  const port=reservation.address().port
  await new Promise(done=>reservation.close(done))
  const origin='http://127.0.0.1:'+port
  const storefront='http://localhost:8917'
  const front=startFrontdoor({
    NODE_ENV:'test',DOGRUADRES_PUBLIC_ORIGIN:origin,
    DOGRUADRES_PRIVATE_API:'http://127.0.0.1:'+upstream.address().port,
    DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:String(port),
    STORE_CORS:storefront,
  })
  await once(front,'listening')
  try{
    const preflight=await fetch(origin+'/auth/verify-email',{
      method:'OPTIONS',headers:{
        Origin:storefront,'Access-Control-Request-Method':'POST',
        'Access-Control-Request-Headers':'content-type',
      }
    })
    assert.equal(preflight.status,204)
    assert.equal(preflight.headers.get('access-control-allow-origin'),storefront)
    assert.equal(preflight.headers.get('vary'),'Origin')
    assert.equal(seen.length,0,'preflight must never reach native ingress')
    for(const method of ['GET','POST']){
      const response=await fetch(origin+'/auth/verify-email'+(method==='GET'?'?token=synthetic':''),
        {method,headers:{Origin:storefront,...(method==='POST'?{'Content-Type':'application/json'}:{})},
        ...(method==='POST'?{body:'{"token":"synthetic"}'}:{})})
      assert.equal(response.status,200)
      assert.equal(response.headers.get('access-control-allow-origin'),storefront)
    }
    assert.equal(seen.length,2)
    for(const headers of [
      {Origin:'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},
      {Origin:storefront,'Access-Control-Request-Method':'DELETE','Access-Control-Request-Headers':'content-type'},
      {Origin:storefront,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'},
    ]){
      const bad=await fetch(origin+'/auth/verify-email',{method:'OPTIONS',headers})
      assert.equal(bad.status,403)
      assert.equal(bad.headers.get('access-control-allow-origin'),null)
    }
    const badGet=await fetch(origin+'/auth/verify-email',{headers:{Origin:'https://evil.example'}})
    assert.equal(badGet.status,403)
    assert.equal(seen.length,2)
    const blocked=await fetch(origin+'/personal/platform/stores',{method:'DELETE'})
    assert.equal(blocked.status,401)
    assert.equal(seen.length,2)
  }finally{
    front.closeAllConnections();upstream.closeAllConnections()
    await Promise.all([new Promise(done=>front.close(done)),new Promise(done=>upstream.close(done))])
  }
})
