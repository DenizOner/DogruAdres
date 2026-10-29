/** B06-only reuse of the B04/B05 Chrome/CDP lifecycle. No mocked responses. */
import assert from 'node:assert/strict'
import {spawn,spawnSync,type ChildProcess} from 'node:child_process'
import {mkdtempSync,mkdirSync,rmSync,existsSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHmac} from 'node:crypto'
import {findChromeBinary,getFreePort,until,killProcess} from './native-verification-browser'

function otp(secret:string){
  let bits='';for(const c of secret.toUpperCase().replace(/=+$/,'')){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);assert.ok(n>=0);bits+=n.toString(2).padStart(5,'0')}
  const key=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2))),counter=Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const h=createHmac('sha1',key).update(counter).digest(),i=h[h.length-1]&15
  return ((h.readUInt32BE(i)&0x7fffffff)%1000000).toString().padStart(6,'0')
}
export class B06Chrome {
  private root=mkdtempSync(join(tmpdir(),'chrome-da-profile-b06-'))
  private chrome?:ChildProcess;private ws?:WebSocket;private id=0
  private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  private methods=new Map<string,string>()
  http:any[]=[]; phase='setup'; cleanup=false
  constructor(readonly origin:string,readonly actor:'A'|'B'){}
  async start(ca:string){
    const nss=join(this.root,'.pki','nssdb');mkdirSync(nss,{recursive:true})
    for(const args of [['-N','--empty-password','-d','sql:'+nss],['-A','-d','sql:'+nss,'-n','B06 task CA','-t','C,,','-i',ca]])
      assert.equal(spawnSync('certutil',args,{stdio:'ignore'}).status,0,'Task NSS trust setup')
    const port=await getFreePort()
    this.chrome=spawn(findChromeBinary(),['--headless=new',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--user-data-dir=${join(this.root,'profile')}`,'about:blank'],{stdio:'ignore',env:{...process.env,HOME:this.root}})
    await until(async()=> (await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).ok,15000,'B06 CDP')
    const tabs:any=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    this.ws=new WebSocket(tabs.find((t:any)=>t.type==='page').webSocketDebuggerUrl)
    await new Promise<void>((resolve,reject)=>{this.ws!.onopen=()=>resolve();this.ws!.onerror=()=>reject(Error('CDP unavailable'))})
    this.ws.onmessage=e=>{const m=JSON.parse(e.data.toString());if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error('CDP rejected')):p.resolve(m.result)}}
      if(m.method==='Network.requestWillBeSent')this.methods.set(m.params.requestId,m.params.request.method)
      if(m.method==='Network.responseReceived'){const r=m.params.response,u=new URL(r.url);if(u.origin===this.origin)this.http.push({phase:this.phase,method:this.methods.get(m.params.requestId),path:u.pathname,status:r.status,protocol:r.protocol,tls:r.securityDetails?{protocol:r.securityDetails.protocol,issuer:r.securityDetails.issuer}:null})}}
    for(const m of ['Page.enable','Runtime.enable','Network.enable','Security.enable'])await this.send(m)
    await this.send('Page.navigate',{url:this.origin+'/personal'})
    await this.wait("!!document.querySelector('#login')?.getClientRects().length")
    assert.ok(this.http.some(r=>r.path==='/personal'&&r.status===200&&r.tls),'Chrome trusted HTTPS navigation')
  }
  send(method:string,params:object={}):Promise<any>{return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method))},20000);this.pending.set(id,{resolve,reject,timer});this.ws!.send(JSON.stringify({id,method,params}))})}
  async eval(expression:string){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,'Browser evaluation failed');return r.result?.value}
  async wait(expression:string){await until(async()=>await this.eval(expression)===true,20000,'B06 '+this.phase)}
  async click(selector:string){const p=await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView();const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`);assert.ok(p,'Visible control '+selector);for(const type of ['mousePressed','mouseReleased'])await this.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1})}
  async input(selector:string,value:string){await this.click(selector);await this.send('Input.insertText',{text:value})}
  async login(email:string,password:string,person:string){
    this.phase='enrollment-login'
    await this.input('#login input[name=email]',email);await this.input('#login input[name=password]',password);await this.click('#login button')
    await this.wait("!document.getElementById('mfa-enrollment').hidden")
    await this.input('#mfa-enroll-start input[name=email]',email);await this.input('#mfa-enroll-start input[name=password]',password);await this.click('#mfa-enroll-start button')
    await this.wait("!document.getElementById('mfa-enroll-verify').hidden&&document.getElementById('mfa-seed').value.length>0")
    let seed=await this.eval("document.getElementById('mfa-seed').value")
    if(seed.startsWith('otpauth:'))seed=new URL(seed).searchParams.get('secret')!
    const enrollmentCounter=Math.floor(Date.now()/30000)
    await this.input('#mfa-enroll-verify input[name=code]',otp(seed));await this.click('#mfa-enroll-verify button')
    await this.wait("!document.getElementById('workspace').hidden")
    // One fresh code at a new counter, never a failed-OTP retry.
    await until(async()=>Math.floor(Date.now()/30000)>enrollmentCounter,35000,'Next native TOTP counter')
    // A fresh real password login and native challenge, without an extra logout journey.
    await this.eval("document.getElementById('workspace').hidden=true;document.getElementById('login').hidden=false")
    this.phase='native-challenge-login'
    await this.input('#login input[name=email]',email);await this.input('#login input[name=password]',password);await this.click('#login button')
    await this.wait("!document.getElementById('challenge').hidden")
    // Issue one native challenge response with enough of its FIRST TOTP
    // window remaining. Never retry a rejected code or bypass native MFA.
    await until(async()=>Date.now()%30000<10000,35000,'B06 fresh native TOTP window')
    await this.input('#challenge input[name=code]',otp(seed));seed='';await this.click('#challenge button')
    await this.wait(`!document.getElementById('workspace').hidden&&document.getElementById('person').textContent===${JSON.stringify('Person: '+person)}`)
  }
  async select(name:string,role:string){const n=await this.eval(`Array.from(document.querySelectorAll('#organizations button')).findIndex(b=>b.textContent===${JSON.stringify(name+' — '+role)})`);assert.ok(n>=0);await this.click(`#organizations button:nth-child(${n+1})`);await this.wait(`JSON.parse(document.getElementById('detail').textContent||'{}').role===${JSON.stringify(role)}`)}
  async ready(){await this.wait("document.getElementById('memberships-status').textContent==='Üyelik listesi güncellendi.'")}
  async post(body:object,badCsrf=false){return this.eval(`(async()=>{const s=await(await fetch('/personal/session')).json();const r=await fetch('/personal/memberships',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':${badCsrf?"'x'.repeat(43)":"s.csrf_token"}},body:JSON.stringify(${JSON.stringify(body)})});return {status:r.status}})()`)}
  async token(){const r=await this.send('Network.getCookies',{urls:[this.origin]});return r.cookies.find((c:any)=>c.name==='da_session')?.value}
  async button(text:string){const n=await this.eval(`Array.from(document.querySelectorAll('#memberships button')).findIndex(b=>b.textContent===${JSON.stringify(text)})`);assert.ok(n>=0);const selector=await this.eval(`(()=>{const e=Array.from(document.querySelectorAll('#memberships button'))[${n}];return '#memberships > :nth-child('+(Array.from(e.parentNode.children).indexOf(e)+1)+')'})()`);await this.click(selector)}
  async role(membership:string,role:'member'|'admin'){
    await this.ready();assert.equal(await this.eval("document.querySelectorAll('#memberships select').length"),1)
    await this.click('#memberships select');await this.send('Input.dispatchKeyEvent',{type:'keyDown',key:role==='admin'?'End':'Home',code:role==='admin'?'End':'Home'});await this.send('Input.dispatchKeyEvent',{type:'keyUp',key:role==='admin'?'End':'Home'});await this.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});await this.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'})
    assert.equal(await this.eval("document.querySelector('#memberships select').value"),role)
    await this.button('Rolü kaydet '+membership)
  }
  async reload(role:string){await this.send('Page.reload',{ignoreCache:true});await this.wait(`JSON.parse(document.getElementById('detail').textContent||'{}').role===${JSON.stringify(role)}`);assert.ok(await this.eval("location.protocol==='https:'"))}
  async screenshot(file:string){const r=await this.send('Page.captureScreenshot',{format:'png'});writeFileSync(file,Buffer.from(r.data,'base64'))}
  async close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Closing'))}this.pending.clear();this.ws?.close();if(this.chrome){killProcess(this.chrome);await until(async()=>this.chrome!.exitCode!==null||this.chrome!.signalCode!==null,8000,'B06 Chrome child termination')}rmSync(this.root,{recursive:true,force:true});assert.ok(!existsSync(this.root));this.cleanup=true}
}
