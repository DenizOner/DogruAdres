import {Client} from "@medusajs/framework/pg"
import {createPublicKey,sign,verify} from "node:crypto"
import {open} from "node:fs/promises"
import path from "node:path"
import {canonicalJsonStringify as canonical,computeSha256Digest as hash,verifySignedManifest,createSignedPostCommitOutcome,verifyCeremonyAuditChain,type SignedTaskManifest,type SignedPreIntent,type TrustedOperatorRegistry,type AtomicNonceStorageAdapter} from "./operator-audit-protocol"
import {NativePostgresReadbackAdapter} from "./native-runtime-adapters"
import {readR1Readiness,MFA_RUNTIME_FLAGS} from "./r1-readiness"
import type {R1CommitReceipt} from "./r1-commit-readback"
export interface R1ActivationManifest extends SignedTaskManifest {
 manifest:SignedTaskManifest['manifest'] & {actionScope:string;runtimeResourceBinding:{postgresSystemIdentifier:string};expectedTransition:{from:false;to:true;fromVersion:number;toVersion:number};preconditions:Record<string,unknown>;runtimeFlags:Record<string,string>}
}
export interface R1ActivationInput {manifest:R1ActivationManifest;intent:SignedPreIntent;registry:TrustedOperatorRegistry}
/** Generic transaction coordinator; NOT an authority factory. The native entry must
 * supply its source-pinned commission. Disposable CI may supply TEST_FIXTURE only.
 * No module/application startup, fake Person/audit or migrations here.
 */
export function verifyR1ActivationInput(input:R1ActivationInput,env:NodeJS.ProcessEnv,nowIso=new Date().toISOString()) {
 const {manifest:signed,intent,registry}=input,m=signed.manifest
 verifySignedManifest(signed,registry)
 const pem=registry.getApprovedSignerPublicKey(signed.signerKeyFingerprint,m)
 const {signatureBase64,...body}=intent
 const now=Date.parse(nowIso),start=Date.parse(m.issuedAt),end=Date.parse(m.expiresAt),planned=Date.parse(intent.plannedTimestamp)
 if(!pem||m.actionScope!=="ACTIVATE_MFA_DEPLOYMENT_LATCH"||!/^r1-[a-zA-Z0-9_-]+$/.test(m.runId)||!/^[a-f0-9]{64}$/.test(m.nonce)||
  ![now,start,end,planned].every(Number.isFinite)||now<start||now>=end||end-start>7200000||planned<start||planned>now||
  intent.recordVersion!=="1.0.0"||intent.executorType!=="automation_agent"||intent.ceremonyId!==m.runId||intent.runId!==m.runId||intent.operatorId!==m.authorizedOperator.operatorId||
  intent.proposedAction!==m.actionScope||intent.manifestDigestSha256!==hash(canonical(m))||
  !verify(null,Buffer.from(canonical(body)),pem,Buffer.from(signatureBase64,"base64"))||
  MFA_RUNTIME_FLAGS.some(k=>env[k]!=="true"||m.runtimeFlags[k]!==env[k])||
  m.expectedTransition.from!==false||m.expectedTransition.to!==true||m.expectedTransition.fromVersion!==1||m.expectedTransition.toVersion!==2)
   throw Error("REFUSED: R1 signed intent/scope/window/actual flags mismatch")
 return pem
}
export async function writeImmutableR1Evidence(directory:string,label:string,data:unknown) {
 const bytes=Buffer.from(canonical(data)),digest=hash(bytes),file=path.join(directory,label+'-'+digest+'.json')
 const f=await open(file,'wx',0o600);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}
 return {file,sha256:digest}
}
/** Exactly one attempt; every possible UPDATE/COMMIT ambiguity is INDETERMINATE.
 * Runtime supplies fresh authority/native checks. No rollback/retry after a write attempt.
 */
export async function executeR1Activation(input:R1ActivationInput,deps:{connectionString:string;privateKeyPem:string;evidenceDirectory:string;nonce:AtomicNonceStorageAdapter;assertAuthority:()=>Promise<void>;env:NodeJS.ProcessEnv}) {
 const pem=verifyR1ActivationInput(input,deps.env),m=input.manifest.manifest
 if(createPublicKey(deps.privateKeyPem).export({type:'spki',format:'pem'}).toString().trim()!==pem.trim())throw Error('REFUSED: R1 signing key substitution')
 const url=new URL(deps.connectionString)
 if(url.hostname!==m.targetHost||url.port!==m.targetPort||decodeURIComponent(url.pathname.slice(1))!==m.targetDatabase)throw Error('REFUSED: R1 connection substitution')
 await deps.assertAuthority()
 const lock=await open(path.join(deps.evidenceDirectory,'r1-exclusive.checkpoint.json'),'wx',0o600)
 let attempted=false,txid:string|undefined,db:Client|undefined
 const checkpoint=async(status:string)=>{await lock.truncate(0);await lock.write(Buffer.from(canonical({status,runId:m.runId,sourceSha:m.targetCommitSha,manifestDigest:hash(canonical(m)),transactionId:txid??null})),0,undefined,0);await lock.sync()}
 try{
  await checkpoint('PREFLIGHT')
  db=new Client({connectionString:deps.connectionString});await db.connect()
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'")
  await db.query("SELECT pg_advisory_xact_lock(hashtext('dogruadres-mfa-platform'))")
  const row=(await db.query("SELECT mfa_activated,version::int AS version FROM da_session_policy WHERE id='current' FOR UPDATE")).rows
  const facts=await readR1Readiness(db)
  const expected=m.preconditions
  for(const key of ['database','cluster','migrations','users','identities','people','mappings','bindings','factors','recovery','guards'])if(String(facts[key])!==String(expected[key]))throw Error('REFUSED: R1 clean state '+key)
  if(row.length!==1||row[0].mfa_activated!==false||row[0].version!==1||facts.other_sessions!==0||facts.cluster!==m.runtimeResourceBinding.postgresSystemIdentifier||facts.users!==2||facts.identities!==2||facts.people!==2||facts.mappings!==2||facts.bindings!==2||facts.factors!==0||facts.recovery!==0||facts.guards!==2)throw Error('REFUSED: R1 clean state/latch/exclusivity mismatch')
  const relations=(await db.query(`SELECT count(*)::int n,count(DISTINCT u.id)::int u,count(DISTINCT a.id)::int a,count(DISTINCT p.id)::int p FROM public.user u JOIN auth_identity a ON a.app_metadata->>'user_id'=u.id AND a.deleted_at IS NULL JOIN da_actor_mapping m ON m.actor_id=u.id AND m.actor_type='user' AND m.deleted_at IS NULL JOIN da_person p ON p.id=m.person_id AND p.deleted_at IS NULL AND p.disabled_at IS NULL JOIN da_login_binding b ON b.auth_identity_id=a.id AND b.person_id=p.id AND b.actor_id=u.id AND b.actor_type='user' AND b.verified_at IS NOT NULL AND b.revoked_at IS NULL WHERE u.deleted_at IS NULL`)).rows[0]
  if(Object.values(relations).some(v=>v!==2))throw Error('REFUSED: R1 relationships invalid')
  await deps.assertAuthority();verifyR1ActivationInput(input,deps.env)
  if(!await deps.nonce.claimIfAbsent({nonce:m.nonce,runId:m.runId,expiresAt:m.expiresAt}))throw Error('REFUSED: R1 nonce already consumed')
  txid=(await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id
  await checkpoint('WRITE_INTENT_DURABLE')
  attempted=true
  const changed=await db.query("UPDATE da_session_policy SET mfa_activated=true,version=version+1 WHERE id='current' AND mfa_activated=false AND version=1 RETURNING version::int AS version")
  if(changed.rowCount!==1||changed.rows[0].version!==2)throw Error('R1 CAS failed')
  if((await db.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n!==0)throw Error('R1 concurrent consumer appeared')
  verifyR1ActivationInput(input,deps.env)
  await db.query('COMMIT');await db.end();db=undefined
  const receiptBody={recordVersion:'1.0.0' as const,ceremonyId:m.runId,manifestDigestSha256:hash(canonical(m)),preIntentDigestSha256:hash(canonical(input.intent)),sourceSha:m.targetCommitSha,postgresSystemIdentifier:m.runtimeResourceBinding.postgresSystemIdentifier,transactionId:txid!,expectedPolicyVersion:2,committedAt:new Date().toISOString()}
  const receipt:R1CommitReceipt={...receiptBody,signatureBase64:sign(null,Buffer.from(canonical(receiptBody)),deps.privateKeyPem).toString('base64')}
  const receiptFile=await writeImmutableR1Evidence(deps.evidenceDirectory,'r1-receipt',receipt)
  const adapter=new NativePostgresReadbackAdapter(deps.connectionString,{...input,receipt})
  const transactionHash=hash(canonical(receiptBody))
  const result=await createSignedPostCommitOutcome(m.runId,input.intent,adapter,m.targetDatabase,transactionHash,deps.privateKeyPem)
  if(!await verifyCeremonyAuditChain(input.intent,result.outcome,pem,adapter,m.targetDatabase))throw Error('R1 independent second readback rejected')
  await writeImmutableR1Evidence(deps.evidenceDirectory,'r1-armed',{previousSha256:receiptFile.sha256,...result})
  await checkpoint('ARMED_COMMITTED_VERIFIED')
  return {receipt,...result}
 }catch(error){
  if(attempted){await checkpoint('INDETERMINATE');throw Error('INDETERMINATE: R1 write/commit/readback uncertain; preserve evidence; NO RETRY')}
  if(db)await db.query('ROLLBACK').catch(()=>{})
  await checkpoint('REFUSED_NO_WRITE');throw error
 }finally{await db?.end().catch(()=>{});await lock.close()}
}