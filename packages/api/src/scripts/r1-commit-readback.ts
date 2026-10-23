import {Client} from "@medusajs/framework/pg"
import {verify} from "node:crypto"
import {
 canonicalJsonStringify as canonical,computeSha256Digest as hash,verifySignedManifest,
 createVerifiedCommittedStateEvidence,type SignedTaskManifest,type SignedPreIntent,
 type TrustedOperatorRegistry,type CommittedEntityDigest,
} from "./operator-audit-protocol"
import {verifyR1CommitFacts} from "./r1-readiness"
export interface R1CommitReceipt {
 readonly recordVersion:"1.0.0"
 readonly ceremonyId:string
 readonly manifestDigestSha256:string
 readonly preIntentDigestSha256:string
 readonly sourceSha:string
 readonly postgresSystemIdentifier:string
 readonly transactionId:string
 readonly expectedPolicyVersion:number
 readonly committedAt:string
 readonly signatureBase64:string
}
export interface R1ReadbackCommission {
 readonly manifest:SignedTaskManifest
 readonly intent:SignedPreIntent
 readonly receipt:R1CommitReceipt
 /** Existing externally scoped registry, NEVER built from candidate intent/env here. */
 readonly registry:TrustedOperatorRegistry
}
/** Signature and scope only. No registry, approval, transaction or ARMED outcome is created. */
export function verifyR1ReadbackCommission(binding:R1ReadbackCommission, database:string, transactionHash:string, ceremonyId:string) {
 verifySignedManifest(binding.manifest,binding.registry)
 const m=binding.manifest.manifest as typeof binding.manifest.manifest & {actionScope?:string;runtimeResourceBinding?:{postgresSystemIdentifier?:string}}
 const {signatureBase64:rs,...r}=binding.receipt,{signatureBase64:is,...intent}=binding.intent
 const pem=binding.registry.getApprovedSignerPublicKey(binding.manifest.signerKeyFingerprint,m)
 if(!ceremonyId||r.recordVersion!=="1.0.0"||intent.recordVersion!=="1.0.0"||intent.executorType!=="automation_agent"||!pem||m.actionScope!=="ACTIVATE_MFA_DEPLOYMENT_LATCH"||m.targetDatabase!==database||
   !/^https:\/\/github\.com\/DenizOner\/DogruAdres\/issues\/(230|238)#issuecomment-\d+$/.test(m.authorizedOperator.approvalReference)||
   !m.runtimeResourceBinding?.postgresSystemIdentifier||r.postgresSystemIdentifier!==m.runtimeResourceBinding.postgresSystemIdentifier||
   r.ceremonyId!==ceremonyId||intent.ceremonyId!==ceremonyId||intent.proposedAction!=="ACTIVATE_MFA_DEPLOYMENT_LATCH"||
   intent.runId!==m.runId||intent.operatorId!==m.authorizedOperator.operatorId||
   intent.manifestDigestSha256!==hash(canonical(m))||r.manifestDigestSha256!==hash(canonical(m))||
   r.preIntentDigestSha256!==hash(canonical(binding.intent))||r.sourceSha!==m.targetCommitSha||transactionHash!==hash(canonical(r))||
   !verify(null,Buffer.from(canonical(intent)),pem,Buffer.from(is,"base64"))||
   !verify(null,Buffer.from(canonical(r)),pem,Buffer.from(rs,"base64")))
   throw Error("REFUSED: R1 intent/receipt scope or signature mismatch")
 const planned=Date.parse(intent.plannedTimestamp),committed=Date.parse(r.committedAt),issued=Date.parse(m.issuedAt),expires=Date.parse(m.expiresAt)
 if(![planned,committed,issued,expires].every(Number.isFinite)||expires<=issued||expires-issued>14400000||planned<issued||committed<planned||committed>expires||
   !/^[1-9][0-9]*$/.test(r.transactionId)||!Number.isSafeInteger(r.expectedPolicyVersion)||r.expectedPolicyVersion<1||r.expectedPolicyVersion>2147483647||BigInt(r.transactionId)>18446744073709551615n)
   throw Error("REFUSED: R1 receipt transaction/time invalid")
 return r
}
/** A NEW READ ONLY connection verifies actual cluster, PG xid8 committed status,
 * singleton row xmin/version and genuine relationships. Latch alone is insufficient.
 */
export async function readR1CommittedState(connectionString:string,binding:R1ReadbackCommission,database:string,transactionHash:string,ceremonyId:string) {
 const r=verifyR1ReadbackCommission(binding,database,transactionHash,ceremonyId)
 const url=new URL(connectionString),m=binding.manifest.manifest
 if(url.hostname!==m.targetHost||url.port!==m.targetPort||decodeURIComponent(url.pathname.slice(1))!==database)
   throw Error("REFUSED: R1 readback connection substitution")
 const db=new Client({connectionString});await db.connect()
 try {
  await db.query("BEGIN READ ONLY")
  const state=(await db.query(`SELECT current_database() AS database,
    (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
    (SELECT count(*)::int FROM da_session_policy) AS policies,
    (SELECT mfa_activated FROM da_session_policy WHERE id='current') AS latch,
    (SELECT version::int FROM da_session_policy WHERE id='current') AS version,
    (SELECT xmin::text FROM da_session_policy WHERE id='current') AS "rowXmin",
    pg_xact_status($1::xid8) AS "transactionStatus",
    (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='da_session_policy'::regclass AND NOT tgisinternal AND tgenabled='O'
      AND tgname IN ('da_mfa_activation_guard_rows','da_mfa_activation_guard_truncate')) AS guards`,[r.transactionId])).rows[0]
  if(state.database!==database||state.cluster!==r.postgresSystemIdentifier||state.policies!==1||state.guards!==2)
    throw Error("REFUSED: R1 readback target/guard mismatch")
  verifyR1CommitFacts(state,{transactionId:r.transactionId,expectedVersion:r.expectedPolicyVersion})
  const rows=(await db.query(`SELECT u.id AS uid,a.id AS aid,p.id AS pid,m.id AS mid,b.auth_identity_id AS bid,
      m.actor_id,m.actor_type,b.verified_at,b.revoked_at FROM public.user u
    JOIN auth_identity a ON a.app_metadata->>'user_id'=u.id AND a.deleted_at IS NULL
    JOIN da_actor_mapping m ON m.actor_id=u.id AND m.actor_type='user' AND m.deleted_at IS NULL
    JOIN da_person p ON p.id=m.person_id AND p.deleted_at IS NULL AND p.disabled_at IS NULL
    JOIN da_login_binding b ON b.auth_identity_id=a.id AND b.person_id=p.id AND b.actor_id=u.id AND b.actor_type='user'
      AND b.verified_at IS NOT NULL AND b.revoked_at IS NULL WHERE u.deleted_at IS NULL ORDER BY u.id`)).rows
  if(rows.length!==2||['uid','aid','pid','mid','bid'].some(k=>new Set(rows.map(x=>x[k])).size!==2))
    throw Error("REFUSED: R1 committed relationships mismatch")
  const entities:CommittedEntityDigest[]=rows.flatMap(row=>[
    {entityType:"user" as const,entityId:row.uid,digestSha256:hash(canonical({id:row.uid,authIdentityId:row.aid}))},
    {entityType:"person" as const,entityId:row.pid,digestSha256:hash(canonical({id:row.pid}))},
    {entityType:"actor_mapping" as const,entityId:row.mid,digestSha256:hash(canonical({id:row.mid,person:row.pid,actor:row.uid,type:row.actor_type}))},
    {entityType:"login_binding" as const,entityId:row.bid,digestSha256:hash(canonical({id:row.bid,person:row.pid,actor:row.uid,verified:row.verified_at instanceof Date?row.verified_at.toISOString():row.verified_at,revoked:row.revoked_at}))},
  ])
  const snapshot=hash(canonical({state,entities}));await db.query("COMMIT")
  return createVerifiedCommittedStateEvidence(ceremonyId,database,transactionHash,"ARMED",{
    verifierIdentity:"independent_database_readback_adapter",readbackTimestamp:new Date().toISOString(),querySnapshotSha256:snapshot,
  },entities,r.committedAt)
 }finally{await db.end()}
}