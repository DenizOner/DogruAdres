/** Isolated B22 SMTP test-only HTTPS egress privacy observer. No response data is logged. */
import assert from "node:assert/strict"
import type {IncomingMessage,ServerResponse} from "node:http"
import {setTimeout as pause} from "node:timers/promises"

const MAX_BODY=1024*1024
const MAX_HELD=8*1024*1024
const MAX_RESPONSES=128

type Tracked={chunks:Buffer[];size:number;ended:boolean;finished:boolean;directHeaders:Map<string,string>}

export class SmtpResponsePrivacyGuard {
  readonly secret:string
  private ciphertext=""
  private readonly active=new Set<Tracked>()
  private readonly held:Buffer[]=[]
  private heldBytes=0
  private started=0
  private finished=0
  private failures=new Set<string>()
  constructor(secret:string){
    assert.match(secret,/^b22-smtp-[0-9a-f]{48}$/,"Only task-owned canary is permitted")
    this.secret=secret
  }
  private fail(reason:string){this.failures.add(reason)}
  private checkBody(body:Buffer){
    let parsed:unknown
    try {
      const decoded=new TextDecoder("utf-8",{fatal:true}).decode(body)
      parsed=JSON.parse(decoded)
    } catch {this.fail("uninspectable UTF-8 JSON response");return}
    const semantic=JSON.stringify(parsed)
    const secrets=[this.secret,...(this.ciphertext?[this.ciphertext]:[])]
    for(const value of secrets){
      const variants=[value,encodeURIComponent(value),Buffer.from(value,"utf8").toString("base64"),
        Buffer.from(value,"utf8").toString("hex")]
      if(variants.some(v=>body.includes(Buffer.from(v,"utf8"))||semantic.includes(v)))
        this.fail(value===this.secret?"SMTP plaintext response leak":"SMTP ciphertext response leak")
    }
  }
  private checkHeaders(res:ServerResponse,record:Tracked){
    // writeHead(status,headers) may bypass getHeader(), so compare both paths.
    const get=(key:string)=>record.directHeaders.get(key)??res.getHeader(key)
    const encoding=get("content-encoding")
    if(encoding!==undefined&&String(encoding).trim().toLowerCase()!=="identity")
      this.fail("unsupported SMTP response content encoding")
    const media=get("content-type")
    if(typeof media!=="string"||!/^(?:application\/json)(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(media.trim()))
      this.fail("unsupported SMTP response content type or charset")
  }
  observe(req:IncomingMessage,res:ServerResponse){
    if((req.url??"").split("?")[0]!=="/personal/platform/smtp")return
    const record:Tracked={chunks:[],size:0,ended:false,finished:false,directHeaders:new Map()}
    this.started++
    if(this.started>MAX_RESPONSES)this.fail("SMTP response count exceeded bound")
    this.active.add(record)
    const originalWrite=res.write.bind(res),originalEnd=res.end.bind(res)
    const originalWriteHead=res.writeHead.bind(res)
    ;(res as any).writeHead=(...args:any[])=>{
      const headerArg=args.find((x,i)=>i>0&&x!==null&&typeof x==="object")
      if(headerArg){
        const pairs:Array<[unknown,unknown]>=Array.isArray(headerArg)
          ?Array.from({length:Math.floor(headerArg.length/2)},(_,i)=>[headerArg[i*2],headerArg[i*2+1]])
          :Object.entries(headerArg)
        for(const [key,value] of pairs)record.directHeaders.set(String(key).toLowerCase(),String(value))
      }
      return (originalWriteHead as any)(...args)
    }
    const collect=(chunk:unknown,encoding?:string)=>{
      if(chunk===undefined||chunk===null||typeof chunk==="function")return
      if(typeof chunk!=="string"&&!Buffer.isBuffer(chunk)&&!(chunk instanceof Uint8Array)){
        this.fail("unsupported SMTP response chunk");return
      }
      const bytes=typeof chunk==="string"?Buffer.from(chunk,(encoding??"utf8") as BufferEncoding):Buffer.from(chunk)
      record.size+=bytes.length
      if(record.size>MAX_BODY){this.fail("SMTP response exceeded body bound");return}
      record.chunks.push(bytes)
    }
    ;(res as any).write=(chunk:unknown,...args:any[])=>{
      collect(chunk,typeof args[0]==="string"?args[0]:undefined)
      return (originalWrite as any)(chunk,...args)
    }
    ;(res as any).end=(chunk:unknown,...args:any[])=>{
      collect(chunk,typeof args[0]==="string"?args[0]:undefined)
      record.ended=true
      return (originalEnd as any)(chunk,...args)
    }
    res.once("finish",()=>{
      record.finished=true
      this.finished++
      this.active.delete(record)
      if(!record.ended)this.fail("SMTP response finish without end")
      this.checkHeaders(res,record)
      if(record.size<=MAX_BODY){
        const body=Buffer.concat(record.chunks)
        if(this.ciphertext){this.checkBody(body);body.fill(0)}
        else if(this.heldBytes+body.length<=MAX_HELD){
          this.checkBody(body)
          this.heldBytes+=body.length
          this.held.push(body)
        }else{this.fail("SMTP pre-ciphertext response buffer exceeded bound");body.fill(0)}
      }
      for(const chunk of record.chunks)chunk.fill(0)
      record.chunks=[]
    })
    res.once("close",()=>{
      if(!record.finished){
        // Only method and numeric status: never include URL, headers or body.
        this.fail("SMTP response closed before finish: "+String(req.method??"unknown")+
          " status="+String(res.statusCode))
        this.active.delete(record)
      }
      for(const chunk of record.chunks)chunk.fill(0)
      record.chunks=[]
    })
    res.once("error",()=>{this.fail("SMTP response transport error")})
  }
  bindCiphertext(value:string){
    assert.match(value,/^v1:/,"Only persisted task ciphertext may be bound")
    assert.equal(this.ciphertext,"","Ciphertext already bound")
    this.ciphertext=value
    for(const body of this.held){this.checkBody(body);body.fill(0)}
    this.held.length=0
    this.heldBytes=0
    this.assertNoLeaks()
  }
  assertNoLeaks(){
    assert.deepEqual([...this.failures],[],"SMTP HTTPS egress privacy violations")
  }
  async assertComplete(timeoutMs=1500){
    const deadline=Date.now()+timeoutMs
    while(this.active.size&&Date.now()<deadline)await pause(20)
    if(this.active.size)this.fail("SMTP response never reached terminal finish")
    if(!this.finished||this.started!==this.finished)this.fail("SMTP responses not fully inspected")
    if(!this.ciphertext)this.fail("SMTP persisted ciphertext never bound")
    this.assertNoLeaks()
  }
}
