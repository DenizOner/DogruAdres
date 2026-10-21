import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {request} from 'node:https'
import {createHmac,createHash,createDecipheriv} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const dir=process.env.M0_TEST_EVIDENCE,origin=process.env.M0_LINK_ORIGIN
if(!dir||origin!=='https://127.0.0.1:19102')throw Error('Explicit isolated HTTPS target required')
const fixtureFile=process.env.M0_DUAL_FIXTURE_FILE??'dual-proof.private.json'
if(!/^dual-proof(?:-[a-z0-9]+)?\.private\.json$/.test(fixtureFile))throw Error('Invalid fixture file')
const {fixtures:[a,b],race}=JSON.parse(readFileSync(dir+'/'+fixtureFile,'utf8')),ca=readFileSync(process.env.M0_TEST_CA_CERT??(dir+'/dual-proof-tls/cert.pem'))
const publishable=JSON.parse(readFileSync(dir+'/contexts.private.json','utf8')).publishableKey
function sql(q){const r=spawnSync('docker',['exec','dogruadres-m0ssi-20261020-a7f1-pg','psql','-U','m0ssi_user','-d','m0ssi_a7f1','-X','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});assert.equal(r.status,0);return r.stdout.trim()}
assert.equal(sql('select current_database()'),'m0ssi_a7f1')
function totp(secret){let bits='';for(const ch of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(v=>parseInt(v,2))),ctr=Buffer.alloc(8);ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(ctr).digest();return ((h.readUInt32BE(h[h.length-1]&15)&0x7fffffff)%1000000).toString().padStart(6,'0')}
async function call(path,{method='GET',body,s,headers={}}={}){return new Promise((resolve,reject)=>{
  const req=request(origin+path,{ca,servername:'localhost',method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(s?{Cookie:s.cookie,'x-csrf-token':s.csrf}:{}),...headers},timeout:20000},r=>{const chunks=[];r.on('data',v=>chunks.push(v));r.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:r.statusCode,headers:r.headers,text,json:()=>JSON.parse(text)})})});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Task request timeout')));if(body)req.write(JSON.stringify(body));req.end()
})}
async function login(f){const r=await call('/personal/session',{method:'POST',body:{email:f.primary.email,password:f.primary.password}});assert.equal(r.status,202);const pending={cookie:r.headers['set-cookie'][0].split(';')[0],csrf:r.json().csrf_token};const v=await call('/personal/challenge',{method:'POST',s:pending,body:{code:totp(f.primary.secret)}});assert.equal(v.status,200);const cookie=v.headers['set-cookie'].find(v=>v.startsWith('da_session='));assert.match(cookie,/Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.deepEqual(Object.keys(v.json()),['csrf_token']);return {cookie:cookie.split(';')[0],csrf:v.json().csrf_token}}
async function begin(s,actor,type){const r=await call('/personal/links',{method:'POST',s,body:{action:'begin',actor_type:type,email:actor.email,password:actor.password}});assert.equal(r.status,202);return r.json()}
const finish=(s,p,actor)=>call('/personal/links',{method:'POST',s,body:{action:'complete',intent:p.intent,...(p.challenge_required?{code:totp(actor.secret)}:{})}})
function native(cookie,type){const hash=createHash('sha256').update(cookie.slice('da_session='.length)).digest('hex'),value=sql(`select c.ciphertext from da_actor_credential c join da_verified_actor_binding b on b.id=c.binding_id where c.session_id='${hash}' and b.actor_type='${type}' and b.revoked_at is null and c.retired_at is null`),[iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64url'));const d=createDecipheriv('aes-256-gcm',createHash('sha256').update('native-credential:'+process.env.COOKIE_SECRET).digest(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString()}
test('HTTPS dual ownership with real native providers and PostgreSQL',async t=>{
  assert.equal((await call('/health')).status,200,'Startup must succeed before any business or fixture assertion')
  let sa,sb,member,customer,bmember,old
  const persons=sql('select count(*) from da_person')
  await t.test('anonymous and public native token paths are denied; TLS certificate is verified',async()=>{
    assert.equal((await call('/personal/links')).status,403)
    for(const actor of ['user','member','customer'])for(const method of ['GET','POST'])assert.equal((await call(`/auth/${actor}/emailpass`,{method,...(method==='POST'?{body:{email:a.primary.email,password:a.primary.password}}:{})})).status,401)
    assert.equal((await call('/auth/token/refresh',{method:'POST'})).status,401)
    assert.equal((await call('/personal',{headers:{Host:'attacker.invalid'}})).status,400)
  })
  await t.test('two independent genuine MFA identities get distinct opaque Secure sessions',async()=>{sa=await login(a);sb=await login(b);assert.notEqual(sa.cookie,sb.cookie);for(const [s,f]of[[sa,a],[sb,b]])assert.equal((await call('/personal/session',{s})).json().person_id,f.person_id)})
  await t.test('two different Persons racing the same unbound actor commit exactly one canonical owner',async()=>{
    assert.ok(race,'Use a fresh manifest from linking-fixture.ts')
    const x=await begin(sa,race,'customer'),y=await begin(sb,race,'customer'),results=await Promise.all([finish(sa,x,race),finish(sb,y,race)])
    assert.deepEqual(results.map(r=>r.status).sort(),[201,403]);const winner=results.findIndex(r=>r.status===201),s=winner===0?sa:sb,f=winner===0?a:b,binding=results[winner].json().binding
    assert.equal(sql(`select person_id from da_actor_mapping where actor_type='customer' and actor_id='${race.actor_id}'`),f.person_id)
    assert.equal(sql(`select count(*) from da_audit_event a join da_security_outbox o on o.audit_event_id=a.id where a.target_id='${binding.id}' and a.action='identity.actor_linked'`),'1')
    assert.equal((await call('/personal/links',{method:'POST',s,body:{action:'unlink',binding_id:binding.id}})).status,200)
    // A supported native purpose-bound password update invalidates the pending
    // version attestation; no password or provider metadata enters Foundation.
    const pending=await begin(s,race,'customer')
    assert.equal((await call('/auth/customer/emailpass/update',{method:'POST',headers:{Authorization:'Bearer '+race.reset_token},body:{password:race.changed_password}})).status,200)
    assert.equal((await finish(s,pending,race)).status,403)
    assert.equal(sql(`select count(*) from da_verified_actor_binding where actor_type='customer' and actor_id='${race.actor_id}' and revoked_at is null`),'0')
  })
  await t.test('primary-only password, wrong actor type, CSRF, Origin and injected authority fail closed',async()=>{
    const input={action:'begin',actor_type:'member',email:a.member.email,password:a.member.password}
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{...input,password:'wrong'}})).status,403)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{...input,email:a.primary.email,password:a.primary.password}})).status,403)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{...input,person_id:b.person_id}})).status,400)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:input,headers:{Origin:'https://attacker.invalid'}})).status,403)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:input,headers:{'x-csrf-token':'x'.repeat(43)}})).status,403)
  })
  await t.test('pending secondary MFA has no authority; wrong-Person intent and wrong code denied',async()=>{
    const p=await begin(sa,a.member,'member');assert.equal(p.challenge_required,true)
    // Canonical ownership tombstones may exist from a prior lifecycle run;
    // pending proof must never install an ACTIVE permission-bearing binding.
    assert.equal(sql(`select count(*) from da_verified_actor_binding where actor_type='member' and actor_id='${a.member.actor_id}' and revoked_at is null`),'0')
    assert.equal((await finish(sb,p,a.member)).status,403)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'complete',intent:p.intent}})).status,403)
    const wrong=(String((Number(totp(a.member.secret))+1)%1000000)).padStart(6,'0')
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'complete',intent:p.intent,code:wrong}})).status,403)
    const r=await finish(sa,p,a.member);assert.equal(r.status,201);member=r.json().binding
    assert.equal((await finish(sa,p,a.member)).status,403)
  })
  await t.test('concurrent customer intents commit one mapping, binding, audit and outbox',async()=>{
    const p=await begin(sa,a.customer,'customer'),q=await begin(sa,a.customer,'customer'),results=await Promise.all([finish(sa,p,a.customer),finish(sa,q,a.customer)])
    assert.deepEqual(results.map(r=>r.status).sort(),[201,403]);customer=results.find(r=>r.status===201).json().binding
    assert.equal(sql(`select count(*) from da_actor_mapping where actor_type='customer' and actor_id='${a.customer.actor_id}' and person_id='${a.person_id}'`),'1')
    assert.equal(sql(`select count(*) from da_audit_event a join da_security_outbox o on o.audit_event_id=a.id where a.target_id='${customer.id}' and a.action='identity.actor_linked' and a.actor_person_id='${a.person_id}'`),'1')
  })
  await t.test('foreign canonical Person cannot transfer a correctly authenticated existing actor',async()=>{
    const p=await begin(sb,a.member,'member');assert.equal((await finish(sb,p,a.member)).status,403)
    const own=await begin(sb,b.member,'member'),r=await finish(sb,own,b.member);assert.equal(r.status,201);bmember=r.json().binding
    assert.equal((await call('/personal/links',{method:'POST',s:sb,body:{action:'unlink',binding_id:member.id}})).status,403)
  })
  await t.test('separate Organization, Seller and Customer scopes remain native-authorized',async()=>{
    for(const [s,f,foreign]of[[sa,a,b],[sb,b,a]]){assert.equal((await call('/personal/organizations?id='+f.organization,{s})).status,200);assert.equal((await call('/personal/organizations?id='+foreign.organization,{s})).status,403);assert.equal((await call('/personal/contexts?type=member&seller='+f.seller,{s})).status,200);assert.equal((await call('/personal/contexts?type=member&seller='+foreign.seller,{s,headers:{'x-seller-id':f.seller}})).status,403)}
    const r=await call('/personal/contexts?type=customer',{s:sa});assert.equal(r.status,200);assert.equal(r.json().actor_id,a.customer.actor_id);old=native(sa.cookie,'customer')
  })
  await t.test('unlink preserves tombstone, retires credential and rejects native replay/refresh',async()=>{
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'unlink',binding_id:customer.id}})).status,200)
    assert.equal((await call('/personal/contexts?type=customer',{s:sa})).status,403)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'unlink',binding_id:customer.id}})).status,403)
    for(const [path,method]of[['/store/customers/me','GET'],['/auth/token/refresh','POST']])assert.equal((await fetch('http://127.0.0.1:19100'+path,{method,headers:{Authorization:'Bearer '+old,'x-publishable-api-key':publishable}})).status,401)
    assert.equal(sql(`select count(*) from da_verified_actor_binding where id='${customer.id}' and revoked_at is not null`),'1')
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'unlink',binding_id:a.primary.id}})).status,403)
  })
  await t.test('fresh dual proof creates a new same-owner binding, never resurrects the old record',async()=>{
    const p=await begin(sa,a.customer,'customer'),r=await finish(sa,p,a.customer);assert.equal(r.status,201);const next=r.json().binding;assert.notEqual(next.id,customer.id)
    assert.equal(sql(`select count(*) from da_verified_actor_binding where id='${customer.id}' and revoked_at is not null`),'1')
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'unlink',binding_id:next.id}})).status,200)
  })
  await t.test('expired pending proof and stale primary strong authentication cannot authorize linking',async()=>{
    const p=await begin(sa,a.customer,'customer');sql(`update da_actor_link_intent set expires_at=clock_timestamp()-interval '1 second' where id='${createHash('sha256').update(p.intent).digest('hex')}'`);assert.equal((await finish(sa,p,a.customer)).status,403)
    const hash=createHash('sha256').update(sa.cookie.slice('da_session='.length)).digest('hex');sql(`update da_browser_session set last_strong_auth_at=clock_timestamp()-interval '300 seconds' where id='${hash}'`)
    assert.equal((await call('/personal/links',{method:'POST',s:sa,body:{action:'begin',actor_type:'customer',email:a.customer.email,password:a.customer.password}})).status,403)
    sa=await login(a)
  })
  await t.test('logout invalidates pending proofs; unlink evidence is atomic and no Person is manufactured',async()=>{
    const p=await begin(sa,a.customer,'customer');assert.equal((await call('/personal/session',{method:'DELETE',s:sa})).status,200);assert.equal((await finish(sa,p,a.customer)).status,403)
    assert.equal((await call('/personal/links',{method:'POST',s:sb,body:{action:'unlink',binding_id:bmember.id}})).status,200)
    const current=await login(a);assert.equal((await call('/personal/links',{method:'POST',s:current,body:{action:'unlink',binding_id:member.id}})).status,200)
    assert.equal(sql(`select count(*) from da_audit_event a left join da_security_outbox o on o.audit_event_id=a.id where a.resource='actor-binding' and o.id is null`),'0');assert.equal(sql('select count(*) from da_person'),persons)
  })
})
