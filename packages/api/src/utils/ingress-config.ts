/** Trusted process configuration only; never read a URL or proxy authority from a request. */
export function ingressConfig(env:Record<string,string|undefined>){
  const exact=(name:string)=>{const value=env[name];if(!value)throw Error('Missing ingress configuration');const u=new URL(value);if(u.origin!==value||u.username||u.password)throw Error('Invalid ingress origin');return u}
  const publicUrl=exact('DOGRUADRES_PUBLIC_ORIGIN'),privateUrl=exact('DOGRUADRES_PRIVATE_API')
  const loopback=(host:string)=>['127.0.0.1','[::1]','localhost'].includes(host)
  if(!loopback(privateUrl.hostname)||privateUrl.protocol!=='http:'||privateUrl.origin===publicUrl.origin)throw Error('Native API must be a distinct trusted loopback HTTP origin')
  const production=env.NODE_ENV==='production'
  const tls=publicUrl.protocol==='https:'
  if(!tls&&(production||publicUrl.protocol!=='http:'||!loopback(publicUrl.hostname)))throw Error('Public ingress requires HTTPS')
  const host=env.DOGRUADRES_FRONTDOOR_HOST??(!production?'127.0.0.1':undefined)
  const portText=env.DOGRUADRES_FRONTDOOR_PORT??(!production?publicUrl.port:undefined)
  if(!host||!['127.0.0.1','::1','0.0.0.0','::'].includes(host)||!portText||!/^\d+$/.test(portText))throw Error('Explicit listener configuration required')
  const port=Number(portText)
  if(port<1||port>65535||port!==Number(publicUrl.port||(tls?443:80))||(!tls&&!['127.0.0.1','::1'].includes(host)))throw Error('Unsafe listener configuration')
  if(tls&&(!env.DOGRUADRES_TLS_CERT||!env.DOGRUADRES_TLS_KEY))throw Error('Direct TLS certificate and key required')
  return Object.freeze({publicOrigin:publicUrl.origin,privateOrigin:privateUrl.origin,host,port,tls,cert:env.DOGRUADRES_TLS_CERT,key:env.DOGRUADRES_TLS_KEY})
}
