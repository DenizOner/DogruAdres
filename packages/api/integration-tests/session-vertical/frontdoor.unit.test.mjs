import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {once} from 'node:events'
import {allowedPublicRequest,startFrontdoor} from '../../scripts/personal-frontdoor.mjs'

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
test('email verification route allows GET and POST and denies other methods',()=>{
  for(const method of ['GET','POST'])
    assert.equal(allowedPublicRequest(method,'/auth/verify-email'),true)
  for(const method of ['PUT','PATCH','DELETE','HEAD','OPTIONS'])
    assert.equal(allowedPublicRequest(method,'/auth/verify-email'),false)
})

test('personal, public catalog and purpose-bound recovery are explicit exceptions',()=>{
  for(const path of ['/personal','/personal/contexts','/personal/memberships','/personal/audit-timeline','/store/regions','/store/products','/store/products/prod_test','/store/sellers','/store/product-categories'])assert.equal(allowedPublicRequest('GET',path),true)
  for(const path of ['/auth/user/emailpass/reset-password','/auth/customer/emailpass/update','/auth/verification/confirm'])assert.equal(allowedPublicRequest('POST',path),true)
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
