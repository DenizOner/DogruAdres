import {test} from 'node:test'
import assert from 'node:assert/strict'
import {request} from 'node:https'
import {readFileSync} from 'node:fs'
const dir=process.env.M0_TEST_EVIDENCE
if(!dir||process.env.M0_LINK_ORIGIN!=='https://127.0.0.1:19102')throw Error('Explicit task TLS target required')
const ca=readFileSync(process.env.M0_TEST_CA_CERT??(dir+'/dual-proof-tls/cert.pem'))
function raw(path,{headers={Host:'127.0.0.1:19102'},body,trust=true}={}){return new Promise((resolve,reject)=>{const r=request({hostname:'127.0.0.1',port:19102,servername:'localhost',...(trust?{ca}:{}),path,method:body?'POST':'GET',headers,timeout:20000},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode,headers:response.headers}))});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('Task timeout')));if(body)r.write(body);r.end()})}
test('path normalization and authority confusion fail before the private backend',async()=>{
  for(const path of ['//personal','/personal%2fsession','/personal/../auth/user/emailpass','http://attacker.invalid/personal','/personal#fragment','/personal\\session'])assert.equal((await raw(path)).status,400)
  assert.equal((await raw('/personal',{headers:{Host:'attacker.invalid'}})).status,400)
})
test('duplicate security headers and oversized input are rejected',async()=>{
  assert.equal((await raw('/personal',{headers:['Host','127.0.0.1:19102','Origin','https://127.0.0.1:19102','Origin','https://attacker.invalid']})).status,400)
  const r=await raw('/personal/session',{headers:{Host:'127.0.0.1:19102','Content-Type':'application/json'},body:'x'.repeat(65537)});assert.equal(r.status,413);assert.ok(r.headers['strict-transport-security'])
})
test('task CA is explicit; default certificate verification remains enabled',async()=>{
  await assert.rejects(raw('/personal',{trust:false}),e=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(e.code))
})
