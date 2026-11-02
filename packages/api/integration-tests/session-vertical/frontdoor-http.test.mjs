import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {request} from 'node:https'
const dir=process.env.M0_TEST_EVIDENCE,fixture=process.env.M0_RESET_FIXTURE,base=process.env.M0_PUBLIC_ORIGIN??'http://127.0.0.1:19101'
if(!['http://127.0.0.1:19101','https://127.0.0.1:19102'].includes(base))throw Error('Wrong isolated public target')
if(!dir||!/^recovery-[a-f0-9-]+\.private\.json$/.test(fixture??'')||process.env.M0_TEST_ORIGIN!=='http://127.0.0.1:19100')throw Error('Explicit task-only evidence required')
const c=JSON.parse(readFileSync(dir+'/contexts.private.json','utf8')),login=JSON.parse(readFileSync(dir+'/login.private.json','utf8')),reset=JSON.parse(readFileSync(dir+'/'+fixture,'utf8'))
function sql(q){const r=spawnSync('docker',['exec','dogruadres-m0ssi-20261020-a7f1-pg','psql','-U','m0ssi_user','-d','m0ssi_a7f1','-X','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});assert.equal(r.status,0);return r.stdout.trim()}
assert.equal(sql('select current_database()'),'m0ssi_a7f1')
async function call(path,{method='GET',body,headers={}}={}){
  const options={method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers}}
  if(!base.startsWith('https:'))return fetch(base+path,{...options,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})
  return new Promise((resolve,reject)=>{const req=request(base+path,{...options,ca:readFileSync(process.env.M0_TEST_CA_CERT??(dir+'/dual-proof-tls/cert.pem')),servername:'localhost',timeout:20000},r=>{const chunks=[];r.on('data',v=>chunks.push(v));r.on('end',()=>resolve({status:r.statusCode,json:()=>JSON.parse(Buffer.concat(chunks).toString())}))});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Task timeout')));if(body)req.write(JSON.stringify(body));req.end()})
}
test('public Store catalog retains genuine publishable-key behavior',async()=>{
  assert.equal((await call('/store/regions')).status,400)
  for(const route of ['/store/regions','/store/products','/store/product-categories'])assert.equal((await call(route,{headers:{'x-publishable-api-key':c.publishableKey}})).status,200)
})
test('public verification and purpose-bound recovery remain functional without actor login',async()=>{
  assert.equal((await call('/auth/user/emailpass/reset-password',{method:'POST',body:{identifier:'unknown-task-only@example.invalid'}})).status,201)
  const verification=await call('/auth/verification/confirm',{method:'POST',body:{code:reset.verification.code,code_provider:'token'}});assert.equal(verification.status,200);assert.equal((await verification.json()).token,undefined)
  assert.equal((await call('/auth/user/emailpass/update',{method:'POST',headers:{Authorization:'Bearer '+reset.token},body:{password:login.password}})).status,200)
  assert.equal((await call('/auth/user/emailpass/update',{method:'POST',headers:{Authorization:'Bearer '+reset.token},body:{password:login.password}})).status,401)
})
test('public machine access requires exact current scope; writers remain closed',async()=>{
  const {token}=JSON.parse(readFileSync(dir+'/machine.private.json','utf8')),Authorization='Basic '+Buffer.from(token+':').toString('base64')
  assert.equal((await call('/admin/api-keys',{headers:{Authorization}})).status,403)
  const id=randomUUID(),key=sql("select id from api_key where title='M0 isolated machine read' and deleted_at is null");assert.match(key,/^apk_[A-Za-z0-9]+$/)
  sql(`insert into da_machine_grant(id,api_key_id,method,resource) values ('${id}','${key}','GET','/admin/api-keys')`)
  try{assert.equal((await call('/admin/api-keys',{headers:{Authorization}})).status,200);assert.equal((await call('/admin/api-keys',{method:'POST',headers:{Authorization},body:{type:'secret',title:'deny'}})).status,401)}finally{sql(`update da_machine_grant set revoked_at=clock_timestamp() where id='${id}'`)}
  assert.equal((await call('/admin/api-keys',{headers:{Authorization}})).status,403)
})
