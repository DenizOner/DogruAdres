import {AccountLinking} from '../account-linking'
import {IdentitySessions} from '../identity-session'
describe('dual-proof Foundation contract (SQL mocks only)',()=>{
  afterEach(()=>jest.restoreAllMocks())
  const s={id:'session',person_id:'person',auth_identity_id:'primary',actor_type:'user',actor_id:'user'},proof={auth_identity_id:'secondary',actor_type:'member' as const,actor_id:'mem_actor',proof_fingerprint:'verified-native-version'}
  it('requires current primary strong authentication before issuing an intent',async()=>{jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(null);const execute=jest.fn();await expect(new AccountLinking({execute}).begin('token',proof,null)).resolves.toBeNull();expect(execute).not.toHaveBeenCalled()})
  it('rejects primary identity masquerading as independent secondary proof',async()=>{jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(s as any);await expect(new AccountLinking({execute:jest.fn()}).begin('token',{...proof,auth_identity_id:'primary'},null)).rejects.toThrow()})
  it('binds hashed intent to primary session and leaves MFA pending without invented evidence',async()=>{
    jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(s as any);const execute=jest.fn().mockResolvedValue([]),r=await new AccountLinking({execute}).begin('token',proof,'native_challenge')
    if(!r)throw Error("Verified primary fixture unexpectedly denied");expect(r.intent).toHaveLength(43);expect(r.challenge_required).toBe(true);expect(execute.mock.calls[0][0]).toContain('null,clock_timestamp()');expect(execute.mock.calls[0][1][0]).not.toBe(r.intent);expect(execute.mock.calls[0][1]).toContain('session')
  })
  it('rejects malformed intent without querying proof state',async()=>{jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(s as any);const execute=jest.fn();await expect(new AccountLinking({execute}).read('token','forged')).rejects.toThrow();expect(execute).not.toHaveBeenCalled()})
  it('does not unlink a protected sign-in identity',async()=>{
    jest.spyOn(IdentitySessions.prototype,'current').mockResolvedValue(s as any)
    const execute=jest.fn(async(q:string)=>q.startsWith('select actor_type')?[{actor_type:'member',actor_id:'mem'}]:q.startsWith('select * from da_verified')?[{auth_identity_id:'primary',actor_type:'member',actor_id:'mem'}]:q.startsWith('select auth_identity_id')?[{auth_identity_id:'primary'}]:[])
    await expect(new AccountLinking({execute}).unlink('token','binding')).rejects.toThrow();expect(execute.mock.calls.some(([q])=>q.startsWith('update da_verified'))).toBe(false)
  })
})
