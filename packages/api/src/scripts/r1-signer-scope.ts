/** Existing #238 decision only. Never import R0-D approval or accept a local registry.
 * The decision permits the minimal executor correction, with a NEW exact-SHA intent.
 */
import {canonicalJsonStringify as canonical,computeSha256Digest as hash,computePublicKeyFingerprint,createTrustedOperatorRegistry,type PinnedOperatorApproval} from './operator-audit-protocol'
import type {R1ActivationManifest} from './r1-activation'
export const R1_SIGNER_SCOPE_REVIEW=Object.freeze({
 reference:'https://github.com/DenizOner/DogruAdres/issues/238#issuecomment-6366377036',
 reviewedSourceSha:'96bba32e4a1b347012a7c73032603977cd9c5860',
 windowsSid:'S-1-5-21-574943488-664265007-2626993283-1001',
 operatorId:'dogruadres-m0-r0d-automation-agent',
 fingerprint:'5830f54b1acb838f06a63314865f3c5c10afd306cc6dad63d16ca68ae7c8a72a',
 publicKeyPem:'-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAFpxVrvEDW20MYCcu6eLtKS6gXh2m7iAMpgQYE5N+UrI=\n-----END PUBLIC KEY-----\n',
 resourcesDigest:'2efba2064437bf364f99ec293bc36a9a7d7db27d266419f6871e8776b9721292',
})
export function commissionR1SignerScope(signed:R1ActivationManifest,actual:{sourceSha:string;windowsSid:string},now=new Date().toISOString()) {
 const a=R1_SIGNER_SCOPE_REVIEW,m=signed.manifest as R1ActivationManifest['manifest'] & {runtimeResourceBinding:{resources:unknown[]};candidateOnly?:boolean;testFixture?:unknown}
 if(!/^[a-f0-9]{40}$/.test(actual.sourceSha)||m.targetCommitSha!==actual.sourceSha)throw Error('REFUSED: R1 exact source SHA mismatch; old approval cannot authorize a changed source')
 if(m.testFixture||m.candidateOnly||m.authorizedOperator.executorType!=='automation_agent'||m.authorizedOperator.operatorId!==a.operatorId||m.authorizedOperator.approvalReference!==a.reference||
  !/^S-1-5-21-[0-9-]+$/.test(actual.windowsSid)||m.authorizedOperator.windowsSecurityPrincipal!==actual.windowsSid||actual.windowsSid!==a.windowsSid||signed.signerKeyFingerprint!==a.fingerprint||computePublicKeyFingerprint(a.publicKeyPem)!==a.fingerprint||
  m.actionScope!=='ACTIVATE_MFA_DEPLOYMENT_LATCH'||m.targetDatabase!=='da_r0b_e7a1_db'||m.targetHost!=='127.0.0.1'||m.targetPort!=='55732'||m.taskEnvironmentId!=='da-r0b-e7a1-env'||m.targetContainerName!=='da-r0b-e7a1-pg'||m.targetVolumeName!=='da-r0b-e7a1-pg-data'||
  m.preconditions.migrations!==234||m.preconditions.guards!==2||m.runtimeResourceBinding.postgresSystemIdentifier!=='7699743845625188386'||hash(canonical(m.runtimeResourceBinding.resources))!==a.resourcesDigest)
   throw Error('REFUSED: R1 source-pinned signer/resource/action scope mismatch')
 const pin:PinnedOperatorApproval={trustDomain:'dogruadres-m0-mfa',executorType:'automation_agent',operatorId:a.operatorId,runId:m.runId,windowsPrincipal:actual.windowsSid,approvalReference:a.reference,keyFingerprint:a.fingerprint,taskEnvironmentId:m.taskEnvironmentId,targetDatabase:m.targetDatabase,targetCommitSha:actual.sourceSha,validFrom:m.issuedAt,validUntil:m.expiresAt}
 return createTrustedOperatorRegistry({registrySchemaVersion:'1.1.0',trustDomain:pin.trustDomain,operators:[{executorType:pin.executorType,operatorId:pin.operatorId,windowsPrincipal:pin.windowsPrincipal,approvalReference:pin.approvalReference,publicKeyPem:a.publicKeyPem,keyFingerprint:a.fingerprint,validFrom:pin.validFrom,validUntil:pin.validUntil}]},pin,now)
}