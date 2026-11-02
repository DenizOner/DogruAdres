import {ActorDelegation} from '../actor-delegation'
import {IdentitySessions} from '../identity-session'
import {createHash,createDecipheriv} from 'node:crypto'
import {getAuthContextFromJwtToken} from '@medusajs/framework/http'

describe('server-only verified actor delegation (unit evidence)',()=>{
  afterEach(()=>jest.restoreAllMocks())
  const session={id:'session',person_id:'person',now_ms:Date.now()}
  const binding={id:'binding',person_id:'person',actor_type:'member',actor_id:'mem_test',auth_identity_id:'auth_test'}
  it.each(['user','admin','',null])('rejects unsupported actor selector %s',async type=>{
    await expect(new ActorDelegation({execute:jest.fn()}).binding('token',type as string)).rejects.toThrow('Access denied')
  })
  it('does not use a binding without a live personal session',async()=>{
    jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(null)
    const execute=jest.fn();expect(await new ActorDelegation({execute}).binding('token','member')).toBeNull();expect(execute).not.toHaveBeenCalled()
  })
  it.each([{rows:[]},{rows:[binding,binding]}])('fails closed on missing or ambiguous verified bindings',async({rows})=>{
    jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(session as any)
    expect(await new ActorDelegation({execute:jest.fn().mockResolvedValue(rows)}).binding('token','member')).toBeNull()
  })
  it('requires current mapping and non-revoked verification in authoritative query',async()=>{
    jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(session as any)
    const execute=jest.fn().mockResolvedValue([binding]);expect(await new ActorDelegation({execute}).binding('token','member')).toMatchObject({binding})
    expect(execute.mock.calls[0][0]).toContain('b.revoked_at is null');expect(execute.mock.calls[0][0]).toContain('a.deleted_at is null')
  })
  it.each([{id:'foreign',app_metadata:{member_id:'mem_test'}},{id:'auth_test',app_metadata:{member_id:'foreign'}},{id:'auth_test',app_metadata:{customer_id:'mem_test'}}])('rejects mismatched genuine auth identity %j',async identity=>{
    jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(session as any)
    const execute=jest.fn().mockResolvedValue([binding])
    await expect(new ActorDelegation({execute}).credential('token','member',identity,{secret:'unit-only'})).rejects.toThrow('Access denied')
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('issues only server-encrypted 900-second actor credentials and keeps the native expiry boundary',async()=>{
    const before=process.env.COOKIE_SECRET;process.env.COOKIE_SECRET='unit-only-'+ 'x'.repeat(48)
    try{
      jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue({...session,last_strong_auth_at:null} as any)
      const execute=jest.fn(async(q:string,_p?:unknown[])=>q.startsWith('select b.*')?[binding]:[])
      const jwt=await new ActorDelegation({execute}).credential('token','member',{id:'auth_test',app_metadata:{member_id:'mem_test'}},{secret:'unit-only-signing'})
      const insert=execute.mock.calls.find(([q])=>q.startsWith('insert into da_actor_credential'))![1]!
      const [iv,tag,data]=(insert[3] as string).split('.').map(v=>Buffer.from(v,'base64url'))
      const d=createDecipheriv('aes-256-gcm',createHash('sha256').update('native-credential:'+process.env.COOKIE_SECRET).digest(),iv);d.setAuthTag(tag)
      expect(Buffer.concat([d.update(data),d.final()]).toString()).toBe(jwt)
      const issued=Math.floor(session.now_ms/1000)
      expect(getAuthContextFromJwtToken('Bearer '+jwt,'unit-only-signing',['bearer'],['member'],undefined,{clockTimestamp:issued+899})).toBeTruthy()
      expect(getAuthContextFromJwtToken('Bearer '+jwt,'unit-only-signing',['bearer'],['member'],undefined,{clockTimestamp:issued+900})).toBeNull()
      expect(getAuthContextFromJwtToken('Bearer '+jwt,'unit-only-signing',['bearer'],['customer'],undefined,{clockTimestamp:issued+1})).toBeNull()
      expect(insert[4]).toEqual(new Date((issued+900)*1000))
    }finally{if(before===undefined)delete process.env.COOKIE_SECRET;else process.env.COOKIE_SECRET=before}
  })
})
