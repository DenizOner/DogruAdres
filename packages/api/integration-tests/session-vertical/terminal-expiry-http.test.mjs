import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {request} from 'node:https'
import {createHmac,createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const dir=process.env.M0_TEST_EVIDENCE,file=process.env.M0_DUAL_FIXTURE_FILE
if(!dir||process.env.M0_LINK_ORIGIN!=='https://127.0.0.1:19102'||!/^dual-proof-[a-z0-9]+\.private\.json$/.test(file??''))throw Error('Explicit task target required')
const f=JSON.parse(readFileSync(dir+'/'+file,'utf8')).fixtures[0],ca=readFileSync(process.env.M0_TEST_CA_CERT??(dir+'/dual-proof-tls/cert.pem'))
function sql(q){const r=spawnSync('docker',['exec','dogruadres-m0ssi-20261020-a7f1-pg','psql','-U','m0ssi_user','-d','m0ssi_a7f1','-X','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});assert.equal(r.status,0);return r.stdout.trim()}
function code(secret){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2))),ctr=Buffer.alloc(8);ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(ctr).digest();return ((h.readUInt32BE(h[h.length-1]&15)&0x7fffffff)%1000000).toString().padStart(6,'0')}
function call(path,{body,cookie,csrf}={}){return new Promise((resolve,reject)=>{const r=request('https://127.0.0.1:19102'+path,{ca,servername:'localhost',method:body?'POST':'GET',headers:{Origin:'https://127.0.0.1:19102',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})}},res=>{const chunks=[];res.on('data',v=>chunks.push(v));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,json:()=>JSON.parse(Buffer.concat(chunks).toString())}))});r.on('error',reject);if(body)r.write(JSON.stringify(body));r.end()})}
test('new binding-read path commits terminal expiry and policy relaxation cannot resurrect it',async()=>{
 assert.equal(sql('select current_database()'),'m0ssi_a7f1')
 const p=await call('/personal/session',{body:{email:f.primary.email,password:f.primary.password}});assert.equal(p.status,202)
 const v=await call('/personal/challenge',{body:{code:code(f.primary.secret)},cookie:p.headers['set-cookie'][0].split(';')[0],csrf:p.json().csrf_token});assert.equal(v.status,200)
 const cookie=v.headers['set-cookie'].find(c=>c.startsWith('da_session=')).split(';')[0],hash=createHash('sha256').update(cookie.slice('da_session='.length)).digest('hex')
 const previous=sql("select absolute_lifetime_seconds from da_session_policy where id='current'");assert.match(previous,/^\d+$/)
 sql(`update da_browser_session set created_at=clock_timestamp()-interval '${previous} seconds' where id='${hash}'`)
 assert.equal((await call('/personal/links',{cookie})).status,403)
 assert.equal(sql(`select status from da_browser_session where id='${hash}'`),'expired')
 try{sql("update da_session_policy set absolute_lifetime_seconds=43200,version=version+1 where id='current'");assert.equal((await call('/personal/session',{cookie})).status,401)}finally{sql(`update da_session_policy set absolute_lifetime_seconds=${previous},version=version+1 where id='current'`)}
})
