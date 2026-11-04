import {signVisitorRateSource,verifyVisitorRateSource,VISITOR_RATE_HEADER} from "../visitor-rate-source"
import {visitorRateAddress} from "../../api/personal/security"
import {ingressConfig} from '../ingress-config'
describe('portable trusted ingress configuration',()=>{
  const dev={DOGRUADRES_PUBLIC_ORIGIN:'http://127.0.0.1:19991',DOGRUADRES_PRIVATE_API:'http://127.0.0.1:19990'}
  it('keeps the production/default deadline at 15 seconds',()=>expect(ingressConfig(dev).upstreamTimeoutMs).toBe(15000))
  it.each(['1000','30000','60000'])('accepts bounded explicit development deadline %s',value=>expect(ingressConfig({...dev,DOGRUADRES_DEV_UPSTREAM_TIMEOUT_MS:value}).upstreamTimeoutMs).toBe(Number(value)))
  it.each(['0','999','60001','1.5','NaN','Infinity',''])('rejects malformed or unbounded development deadline %s',value=>expect(()=>ingressConfig({...dev,DOGRUADRES_DEV_UPSTREAM_TIMEOUT_MS:value})).toThrow('Invalid development upstream timeout'))
  it('never permits the development override in production',()=>expect(()=>ingressConfig({...dev,NODE_ENV:'production',DOGRUADRES_DEV_UPSTREAM_TIMEOUT_MS:'30000'})).toThrow('Development upstream timeout cannot change production'))
  it('accepts explicit alternate isolated ports',()=>expect(ingressConfig(dev)).toMatchObject({port:19991,privateOrigin:dev.DOGRUADRES_PRIVATE_API,tls:false}))
  it.each([{}, {...dev,DOGRUADRES_PRIVATE_API:'https://attacker.invalid'}, {...dev,DOGRUADRES_PRIVATE_API:dev.DOGRUADRES_PUBLIC_ORIGIN},{...dev,DOGRUADRES_PUBLIC_ORIGIN:'http://example.invalid'}, {...dev,DOGRUADRES_PUBLIC_ORIGIN:'http://127.0.0.1:19991/path'}, {...dev,DOGRUADRES_FRONTDOOR_PORT:'9000'}, {...dev,DOGRUADRES_FRONTDOOR_HOST:'0.0.0.0'}, {...dev,NODE_ENV:'production'}])('rejects unsafe/missing config %#',env=>expect(()=>ingressConfig(env)).toThrow())
  it('requires explicit production listener and direct TLS materials',()=>{
    const prod={...dev,NODE_ENV:'production',DOGRUADRES_PUBLIC_ORIGIN:'https://app.example.invalid',DOGRUADRES_FRONTDOOR_HOST:'0.0.0.0',DOGRUADRES_FRONTDOOR_PORT:'443',DOGRUADRES_TLS_CERT:'/external/cert.pem',DOGRUADRES_TLS_KEY:'/external/key.pem'}
    expect(Object.isFrozen(ingressConfig(prod))).toBe(true);expect(ingressConfig(prod).tls).toBe(true)
    expect(()=>ingressConfig({...prod,DOGRUADRES_TLS_KEY:undefined})).toThrow()
  })
})

describe("signed TLS visitor source — abuse throttling only",()=>{
  const secret="S".repeat(64),now=1730000000000
  const a=()=>signVisitorRateSource("127.0.0.2",secret,"POST","/personal/register",now)
  const b=()=>signVisitorRateSource("127.0.0.3",secret,"POST","/personal/register",now)
  it("has separate stable private quotas, without carrying a raw client address",()=>{
    expect(a()).toBe(signVisitorRateSource("::ffff:127.0.0.2",secret,"POST","/personal/register",now))
    expect(a()).not.toBe(b())
    expect(a()).not.toContain("127.0.0.2")
    expect(verifyVisitorRateSource(a(),secret,"POST","/personal/register",now))
      .toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(verifyVisitorRateSource(a(),secret,"POST","/personal/register",now))
      .not.toBe(verifyVisitorRateSource(b(),secret,"POST","/personal/register",now))
  })
  it("denies a forged, expired or wrong-route source instead of accepting public XFF",()=>{
    const signed=a()
    const forged=signed.slice(0,-1)+(signed.endsWith("A")?"B":"A")
    for(const sample of [forged,"v1.0."+"x".repeat(88),"127.0.0.3",undefined])
      expect(verifyVisitorRateSource(sample,secret,"POST","/personal/register",now)).toBeNull()
    expect(verifyVisitorRateSource(signed,secret,"POST","/personal/session",now)).toBeNull()
    expect(verifyVisitorRateSource(signed,secret,"POST","/personal/register",now+180000)).toBeNull()
    expect(()=>signVisitorRateSource("127.0.0.2","weak","POST","/personal/register",now)).toThrow()
  })
  it("requires loopback for the signed proof and keeps direct HTTP on its own shared quota",()=>{
    const old=process.env.COOKIE_SECRET
    process.env.COOKIE_SECRET=secret
    try{
      const req=(remoteAddress:string,header?:string)=>({
        method:"POST",path:"/personal/register",
        socket:{remoteAddress},headers:header?{[VISITOR_RATE_HEADER]:header}:{}
      }) as any
      // The dynamic timestamp used by the actual request must be current.
      const current=signVisitorRateSource("127.0.0.2",secret,"POST","/personal/register")
      const alt=signVisitorRateSource("127.0.0.3",secret,"POST","/personal/register")
      expect(visitorRateAddress(req("127.0.0.1",current)))
        .not.toBe(visitorRateAddress(req("127.0.0.1",alt)))
      expect(visitorRateAddress(req("127.0.0.1",current)))
        .toBe(visitorRateAddress(req("::1",current)))
      expect(visitorRateAddress(req("203.0.113.5",current))).toBeNull()
      expect(visitorRateAddress(req("127.0.0.1","forged"))).toBeNull()
      expect(visitorRateAddress(req("127.0.0.1"))).toMatch(/^private-direct:/)
      expect(visitorRateAddress(req("127.0.0.1",{toString:()=>"spoofed"} as any))).toBeNull()
    }finally{
      if(old===undefined)delete process.env.COOKIE_SECRET
      else process.env.COOKIE_SECRET=old
    }
  })
})
