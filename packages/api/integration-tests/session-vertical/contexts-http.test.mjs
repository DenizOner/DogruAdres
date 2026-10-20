import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHmac,createHash,createDecipheriv} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const evidence=process.env.M0_TEST_EVIDENCE,base='http://127.0.0.1:19101',privateBase='http://127.0.0.1:19100'
if(!evidence||process.env.M0_TEST_ORIGIN!==privateBase)throw Error('Explicit disposable target required')
const c=JSON.parse(readFileSync(evidence+'/contexts.private.json','utf8')),login=JSON.parse(readFileSync(evidence+'/login.private.json','utf8')),secret=JSON.parse(readFileSync(evidence+'/totp.private.json','utf8')).secret
function sql(q){const r=spawnSync('docker',['exec','dogruadres-m0ssi-20261020-a7f1-pg','psql','-U','m0ssi_user','-d','m0ssi_a7f1','-X','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});assert.equal(r.status,0,'isolated SQL');return r.stdout.trim()}
assert.equal(sql('select current_database()'),'m0ssi_a7f1')
function totp(){let bits='';for(const ch of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest();return ((h.readUInt32BE(h[h.length-1]&15)&0x7fffffff)%1000000).toString().padStart(6,'0')}
async function call(path,{method='GET',body,headers={},target=base}={}){return fetch(target+path,{method,headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})}
function jwtFor(cookie,type){const hash=createHash('sha256').update(cookie.slice('da_session='.length)).digest('hex');const query=type==='user'?`select ciphertext from da_native_credential where session_id='${hash}' and retired_at is null`:`select c.ciphertext from da_actor_credential c join da_verified_actor_binding b on b.id=c.binding_id where c.session_id='${hash}' and c.retired_at is null and b.actor_type='${type}'`;const [iv,tag,data]=sql(query).split('.').map(v=>Buffer.from(v,'base64url'));const d=createDecipheriv('aes-256-gcm',createHash('sha256').update('native-credential:'+process.env.COOKIE_SECRET).digest(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString()}
test('real public/private ingress and native actor isolation',async t=>{
  let cookie,csrf
  await t.test('public login never returns native or actorless tokens; private native login remains supported',async()=>{
    for(const actor of ['user','member','customer'])for(const method of ['GET','POST']){const r=await call(`/auth/${actor}/emailpass`,{method,...(method==='POST'?{body:login}:{})});assert.equal(r.status,401);assert.equal((await r.json()).token,undefined)}
    assert.equal((await call('/auth/token/refresh',{method:'POST'})).status,401)
    const native=await call('/auth/user/emailpass',{method:'POST',body:login,target:privateBase});assert.equal(native.status,200);assert.equal(typeof(await native.json()).token,'string')
  })
  await t.test('opaque public session completes genuine MFA without browser actor credentials',async()=>{
    const r=await call('/personal/session',{method:'POST',body:login});assert.equal(r.status,202);const pending=r.headers.getSetCookie()[0].split(';')[0],p=await r.json()
    const m=await call('/personal/challenge',{method:'POST',body:{code:totp()},headers:{Cookie:pending,'x-csrf-token':p.csrf_token}});assert.equal(m.status,200)
    cookie=m.headers.getSetCookie().find(v=>v.startsWith('da_session=')).split(';')[0];const out=await m.json();assert.deepEqual(Object.keys(out),['csrf_token']);csrf=out.csrf_token
  })
  await t.test('real Seller A read succeeds and foreign Seller B fails with the same Person',async()=>{
    const a=await call('/personal/contexts?type=member&seller='+c.sellerA,{headers:{Cookie:cookie}});assert.equal(a.status,200);const data=await a.json();assert.equal(data.person_id,c.person_id);assert.equal(data.actor_id,c.member);assert.equal(data.seller.id,c.sellerA);assert.deepEqual(Object.keys(data).sort(),['actor_id','context','person_id','seller'])
    assert.equal((await call('/personal/contexts?type=member&seller='+c.sellerB,{headers:{Cookie:cookie,'x-seller-id':c.sellerA}})).status,403)
    assert.equal((await call('/personal/contexts?type=member&seller='+c.sellerA,{target:privateBase,headers:{Cookie:cookie,'x-seller-id':c.sellerB}})).status,400)
  })
  await t.test('real Customer is server-adapted without a browser token',async()=>{const r=await call('/personal/contexts?type=customer',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{person_id:c.person_id,context:'customer',actor_id:c.customer})})
  await t.test('native middleware rejects cross-actor impersonation; correct native actors succeed',async()=>{
    const user=jwtFor(cookie,'user'),member=jwtFor(cookie,'member'),customer=jwtFor(cookie,'customer')
    for(const token of [user,member])assert.equal((await call('/store/customers/me',{target:privateBase,headers:{Authorization:'Bearer '+token,'x-publishable-api-key':c.publishableKey}})).status,401)
    assert.equal((await call('/store/customers/me',{target:privateBase,headers:{Authorization:'Bearer '+customer,'x-publishable-api-key':c.publishableKey}})).status,200)
    assert.equal((await call('/vendor/members/me',{target:privateBase,headers:{Authorization:'Bearer '+customer,'x-seller-id':c.sellerA}})).status,401)
    // Mercur ensureSellerMiddleware throws NOT_ALLOWED (HTTP 400) when this
    // genuine member has no membership in the requested Seller.
    assert.equal((await call('/vendor/members/me',{target:privateBase,headers:{Authorization:'Bearer '+member,'x-seller-id':c.sellerB}})).status,400)
    assert.equal((await call('/store/customers/me',{headers:{Authorization:'Bearer '+customer,'x-publishable-api-key':c.publishableKey}})).status,401)
  })
  await t.test('unknown selectors fail closed; current Organization contexts remain request scoped',async()=>{
    assert.equal((await call('/personal/contexts?type=user',{headers:{Cookie:cookie}})).status,400)
    assert.equal((await call('/personal/contexts?type=customer&person_id='+c.person_id,{headers:{Cookie:cookie}})).status,400)
    const scopes=[c.orgs[0].id,'daorg_m0ssi_abc']
    const responses=await Promise.all(scopes.map(id=>call('/personal/organizations?id='+id,{headers:{Cookie:cookie}})));for(let i=0;i<responses.length;i++){assert.equal(responses[i].status,200);assert.equal((await responses[i].json()).organizations[0].id,scopes[i])}
  })
  await t.test('ordinary verified Person without a Customer binding cannot manufacture one',async()=>{
    const r=await call('/personal/session',{method:'POST',body:{email:c.ordinary_email,password:login.password}});assert.equal(r.status,200)
    const ordinary=r.headers.getSetCookie().find(v=>v.startsWith('da_session=')).split(';')[0],data=await r.json()
    assert.equal((await call('/personal/contexts?type=customer',{headers:{Cookie:ordinary}})).status,403)
    assert.equal((await call('/personal/session',{method:'DELETE',headers:{Cookie:ordinary,'x-csrf-token':data.csrf_token}})).status,200)
  })
  if(process.env.M0_TEST_BINDING_REVOCATION==='1')await t.test('committed binding revocation denies adapted and already-issued native credentials',async()=>{
    const token=jwtFor(cookie,'customer')
    assert.equal(sql(`select count(*) from da_verified_actor_binding where person_id='${c.person_id}' and actor_type='customer' and revoked_at is null`),'1','one-way fixture transition requires active binding')
    sql(`update da_verified_actor_binding set revoked_at=clock_timestamp() where person_id='${c.person_id}' and actor_type='customer' and revoked_at is null`)
    assert.equal((await call('/personal/contexts?type=customer',{headers:{Cookie:cookie}})).status,403)
    assert.equal((await call('/store/customers/me',{target:privateBase,headers:{Authorization:'Bearer '+token,'x-publishable-api-key':c.publishableKey}})).status,401)
    assert.equal((await call('/personal/contexts?type=member&seller='+c.sellerA,{headers:{Cookie:cookie}})).status,200)
  })
  await t.test('logout revokes all delegated native credentials and refresh',async()=>{
    const member=jwtFor(cookie,'member'),customer=jwtFor(cookie,'customer')
    assert.equal((await call('/personal/session',{method:'DELETE',headers:{Cookie:cookie,'x-csrf-token':csrf}})).status,200)
    assert.equal((await call('/vendor/members/me',{target:privateBase,headers:{Authorization:'Bearer '+member,'x-seller-id':c.sellerA}})).status,401)
    assert.equal((await call('/store/customers/me',{target:privateBase,headers:{Authorization:'Bearer '+customer,'x-publishable-api-key':c.publishableKey}})).status,401)
    for(const token of [member,customer])assert.equal((await call('/auth/token/refresh',{method:'POST',target:privateBase,headers:{Authorization:'Bearer '+token}})).status,401)
  })
})
