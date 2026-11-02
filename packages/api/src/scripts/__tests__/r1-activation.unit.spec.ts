import {commissionR1SignerScope,R1_SIGNER_SCOPE_REVIEW} from '../r1-signer-scope'
import {verifyR1ActivationInput} from '../r1-activation'
import {R1_ANCESTOR_MUTATION_MASK} from '../r1-native-custody'
import {readFileSync} from 'node:fs'
import path from 'node:path'
describe('R1 source scope cannot silently inherit prior approval',()=>{
 it.each(['0'.repeat(40),'a'.repeat(40)])('rejects unreviewed source %s',sha=>expect(()=>commissionR1SignerScope({manifest:{targetCommitSha:R1_SIGNER_SCOPE_REVIEW.reviewedSourceSha}} as any,{sourceSha:sha,windowsSid:'S-1-5-21-1-2-3-4'})).toThrow(/source SHA mismatch/))
 it('pins only the actual reviewed source, resources and decision',()=>{expect(R1_SIGNER_SCOPE_REVIEW.reference).toContain('6366377036');expect(R1_SIGNER_SCOPE_REVIEW.reviewedSourceSha).toBe('96bba32e4a1b347012a7c73032603977cd9c5860');expect(R1_SIGNER_SCOPE_REVIEW.resourcesDigest).toBe('2efba2064437bf364f99ec293bc36a9a7d7db27d266419f6871e8776b9721292')})
 it('rejects unsigned authority before connection',()=>expect(()=>verifyR1ActivationInput({manifest:{manifest:{},signerKeyFingerprint:'0'.repeat(64)},registry:{getApprovedSignerPublicKey:()=>null}} as any,{})).toThrow())
 it('rejects local candidates even at historically reviewed source',()=>{const sha=R1_SIGNER_SCOPE_REVIEW.reviewedSourceSha;expect(()=>commissionR1SignerScope({manifest:{targetCommitSha:sha,candidateOnly:true,authorizedOperator:{}}} as any,{sourceSha:sha,windowsSid:'S-1-5-21-1-2-3-4'})).toThrow(/scope mismatch/)})
})

describe('R1 protected evidence ancestor ACL mutation denial',()=>{
 it('covers create, modify, delete and ACL takeover rights, not ordinary read',()=>{
  const rights=[0x0002,0x0004,0x0010,0x0040,0x0100,0x10000,0x40000,0x80000]
  for(const right of rights)expect(R1_ANCESTOR_MUTATION_MASK & right).toBe(right)
  expect(R1_ANCESTOR_MUTATION_MASK & 0x0001).toBe(0)
  expect(R1_ANCESTOR_MUTATION_MASK).toBe(0xD0156)
 })
})

// These are SOURCE-ONLY safeguards. Linux Jest does not compile C# or execute Windows Authz.
describe('native Authz unsafe SID path remains fail closed at source level',()=>{
 const source=readFileSync(path.join(__dirname,'..','r1-authz.cs'),'utf8')
 const check=source.slice(source.indexOf('public static uint Check(byte[] descriptor, string alternate)'))
 it('refuses a reconstructed sandbox SID before native API invocation',()=>{
  expect(check).toContain('if (!String.IsNullOrEmpty(alternate))')
  expect(check).toContain('BLOCKED: actual sandbox reader token is not commissioned')
  expect(check.indexOf('if (!String.IsNullOrEmpty(alternate))')).toBeLessThan(check.indexOf('if (!AuthzInitializeResourceManager('))
  expect(source).not.toContain('AuthzInitializeContextFromSid(')
 })
 it('allocates and frees all three Authz result buffers',()=>{
  expect(check).toContain('granted = Marshal.AllocHGlobal(sizeof(int))')
  expect(check).toContain('sacl = Marshal.AllocHGlobal(sizeof(int))')
  expect(check).toContain('error = Marshal.AllocHGlobal(sizeof(int))')
  expect(check).toContain('Mask = granted, Sacl = sacl, Error = error')
  expect(check).toContain('Marshal.FreeHGlobal(sacl)')
 })
})
