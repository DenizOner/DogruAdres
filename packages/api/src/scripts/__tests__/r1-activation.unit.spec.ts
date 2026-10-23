import {commissionR1SignerScope,R1_SIGNER_SCOPE_REVIEW} from '../r1-signer-scope'
import {verifyR1ActivationInput} from '../r1-activation'
describe('R1 source scope cannot silently inherit prior approval',()=>{
 it.each(['0'.repeat(40),'a'.repeat(40)])('rejects unreviewed source %s',sha=>expect(()=>commissionR1SignerScope({manifest:{targetCommitSha:sha}} as any,{sourceSha:sha,windowsSid:'S-1-5-21-1-2-3-4'})).toThrow(/source-reviewed/))
 it('pins only the actual reviewed source, resources and decision',()=>{expect(R1_SIGNER_SCOPE_REVIEW.reference).toContain('6366377036');expect(R1_SIGNER_SCOPE_REVIEW.reviewedSourceSha).toBe('96bba32e4a1b347012a7c73032603977cd9c5860');expect(R1_SIGNER_SCOPE_REVIEW.resourcesDigest).toBe('2efba2064437bf364f99ec293bc36a9a7d7db27d266419f6871e8776b9721292')})
 it('rejects unsigned authority before connection',()=>expect(()=>verifyR1ActivationInput({manifest:{manifest:{},signerKeyFingerprint:'0'.repeat(64)},registry:{getApprovedSignerPublicKey:()=>null}} as any,{})).toThrow())
 it('rejects local candidates even at historically reviewed source',()=>{const sha=R1_SIGNER_SCOPE_REVIEW.reviewedSourceSha;expect(()=>commissionR1SignerScope({manifest:{targetCommitSha:sha,candidateOnly:true,authorizedOperator:{}}} as any,{sourceSha:sha,windowsSid:'S-1-5-21-1-2-3-4'})).toThrow(/scope mismatch/)})
})