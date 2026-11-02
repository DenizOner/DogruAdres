/** Real ephemeral HTTP negative tests; never print synthetic payload contents. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer,request} from 'node:http'
import {SmtpResponsePrivacyGuard} from './smtp-response-privacy-guard.ts'

const secret='b22-smtp-'+'a'.repeat(48)
const cipher='v1:'+'b'.repeat(80)
const route='/personal/platform/smtp'
async function expectPrivacyFailure(guard){
  try { guard.bindCiphertext(cipher) }
  catch(error) { assert.match(String(error?.message),/SMTP HTTPS egress privacy violations/) }
  await assert.rejects(guard.assertComplete(100),/SMTP HTTPS egress privacy violations/)
}
const json=(res,body)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}
const httpGet=port=>new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port,path:route},res=>{
    let body='';res.setEncoding('utf8')
    res.on('data',x=>body+=x)
    res.on('end',()=>resolve({status:res.statusCode,body}))
    res.on('error',reject)
    res.on('aborted',()=>reject(Error('aborted HTTP response')))
  })
  req.on('error',reject);req.end()
})
async function setup(responder){
  const guard=new SmtpResponsePrivacyGuard(secret)
  const server=createServer((req,res)=>{guard.observe(req,res);responder(req,res)})
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve)
  })
  const port=server.address().port
  const cleanup=async()=>{
    server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve))
  }
  return {guard,port,cleanup}
}

test('clean real JSON responses pass after retrospective ciphertext binding',async()=>{
  const s=await setup((req,res)=>json(res,{message:'safe',settings:{password:null}}))
  try {
    assert.equal((await httpGet(s.port)).status,200)
    s.guard.bindCiphertext(cipher)
    await s.guard.assertComplete()
  } finally {await s.cleanup()}
})

test('first save ciphertext leakage is caught after DB readback',async()=>{
  const s=await setup((req,res)=>json(res,{settings:{password_encrypted:cipher}}))
  try {
    await httpGet(s.port)
    s.guard.assertNoLeaks()
    assert.throws(()=>s.guard.bindCiphertext(cipher),/privacy violations/)
  } finally {await s.cleanup()}
})

test('unfinished second response cannot hide behind one completed response',async()=>{
  let count=0
  const s=await setup((req,res)=>{
    if(++count===1)return json(res,{ok:true})
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
    res.write('{"partial":"')
  })
  let req
  try {
    await httpGet(s.port)
    req=request({host:'127.0.0.1',port:s.port,path:route})
    const observed=new Promise(resolve=>req.once('response',resolve))
    req.on('error',()=>{})
    req.end()
    await observed
    await expectPrivacyFailure(s.guard)
  } finally {req?.destroy();await s.cleanup()}
})

test('pre-egress cancelled GET is harmless only when a completed JSON response also exists',async()=>{
  let count=0
  const s=await setup((req,res)=>{
    if(++count===1)return res.destroy() // no headers, write, or end
    json(res,{ok:true})
  })
  try {
    await assert.rejects(httpGet(s.port))
    assert.equal((await httpGet(s.port)).status,200)
    s.guard.bindCiphertext(cipher)
    await s.guard.assertComplete()
  } finally {await s.cleanup()}
})

test('early close after headers are sent is still rejected',async()=>{
  const s=await setup((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json'})
    res.flushHeaders()
    setImmediate(()=>res.destroy())
  })
  try {
    await assert.rejects(httpGet(s.port))
    await expectPrivacyFailure(s.guard)
  } finally {await s.cleanup()}
})

test('aborted response fails even if part of its body was written',async()=>{
  const s=await setup((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
    res.write('{"truncated":')
    setImmediate(()=>res.destroy())
  })
  try {
    await assert.rejects(httpGet(s.port))
    await expectPrivacyFailure(s.guard)
  } finally {await s.cleanup()}
})

for(const headerPath of ['setHeader','writeHead']){
  test('gzip '+headerPath+' is rejected',async()=>{
    const s=await setup((req,res)=>{
      if(headerPath==='setHeader'){
        res.setHeader('Content-Type','application/json')
        res.setHeader('Content-Encoding','gzip')
      } else res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'})
      res.end(Buffer.from('{}'))
    })
    try {await httpGet(s.port);await expectPrivacyFailure(s.guard)}
    finally {await s.cleanup()}
  })
}

test('Unicode-escaped JSON plaintext is rejected',async()=>{
  const escaped=[...secret].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('')
  const s=await setup((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json'})
    res.end('{"canary":"'+escaped+'"}')
  })
  try {await httpGet(s.port);await expectPrivacyFailure(s.guard)}
  finally {await s.cleanup()}
})

test('Unicode-escaped first-save ciphertext is rejected after retrospective binding',async()=>{
  const escaped=[...cipher].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('')
  const s=await setup((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json'})
    res.end('{"cipher":"'+escaped+'"}')
  })
  try {
    await httpGet(s.port)
    s.guard.assertNoLeaks()
    assert.throws(()=>s.guard.bindCiphertext(cipher),/privacy violations/)
  } finally {await s.cleanup()}
})

test('UTF-16LE JSON and unsupported charset are rejected',async()=>{
  const s=await setup((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-16le'})
    res.end(Buffer.from(JSON.stringify({canary:secret}),'utf16le'))
  })
  try {await httpGet(s.port);await expectPrivacyFailure(s.guard)}
  finally {await s.cleanup()}
})

test('base64-wrapped secret in valid JSON is rejected',async()=>{
  const s=await setup((req,res)=>json(res,{encoded:Buffer.from(secret).toString('base64')}))
  try {await httpGet(s.port);await expectPrivacyFailure(s.guard)}
  finally {await s.cleanup()}
})

test('lowercase percent-encoded first-save ciphertext is rejected after readback',async()=>{
  const s=await setup((req,res)=>json(res,{encoded:'v1%3a'+'b'.repeat(80)}))
  try {
    await httpGet(s.port)
    s.guard.assertNoLeaks()
    assert.throws(()=>s.guard.bindCiphertext(cipher),/privacy violations/)
    await assert.rejects(s.guard.assertComplete(100),/privacy violations/)
  } finally {await s.cleanup()}
})

test('partially percent-encoded plaintext is rejected in a real HTTP response',async()=>{
  const encoded=secret.replaceAll('-','%2d')
  const s=await setup((req,res)=>json(res,{encoded}))
  try {await httpGet(s.port);await expectPrivacyFailure(s.guard)}
  finally {await s.cleanup()}
})

test('nine concurrent unfinished responses cannot exceed shared 8 MiB raw buffer budget',async()=>{
  const fragment='{"payload":"'+ 'x'.repeat(960*1024)
  const requests=[]
  const s=await setup((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
    res.write(fragment)
    // Intentionally keep each response open to distinguish concurrent from
    // sequential completed/held buffers. Cleanup destroys these sockets.
  })
  try {
    await Promise.all(Array.from({length:9},()=>new Promise((resolve,reject)=>{
      const req=request({host:'127.0.0.1',port:s.port,path:route},res=>{
        res.on('error',()=>{})
        res.resume()
        resolve()
      })
      req.on('error',reject)
      requests.push(req)
      req.end()
    })))
    assert.ok(s.guard.peakBufferedBytes>0)
    assert.ok(s.guard.peakBufferedBytes<=8*1024*1024,'Combined observer body buffers must be bounded')
    await expectPrivacyFailure(s.guard)
  } finally {
    for(const req of requests)req.destroy()
    await s.cleanup()
  }
})

test('more than 128 SMTP responses fail without retaining additional response observers',async()=>{
  const s=await setup((req,res)=>json(res,{ok:true}))
  try {
    for(let i=0;i<129;i++)await httpGet(s.port)
    assert.ok(s.guard.peakBufferedBytes<=8*1024*1024)
    await expectPrivacyFailure(s.guard)
  } finally {await s.cleanup()}
})
