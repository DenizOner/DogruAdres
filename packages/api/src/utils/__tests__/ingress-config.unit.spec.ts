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
