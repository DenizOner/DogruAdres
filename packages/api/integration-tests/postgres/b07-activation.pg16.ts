/** TEST_FIXTURE / NOT_AUTHORITY. Only the EXISTING random disposable CLI CI DB.
 * No operator key, R0-B connection, runtime pin, issue grant or persistent signer.
 * #238/6366377036 explicitly permits this isolated positive/negative test data.
 */
import assert from 'node:assert/strict'
import {Client} from '@medusajs/framework/pg'
import {generateKeyPairSync,sign,randomBytes,createHash} from 'node:crypto'
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {canonicalJsonStringify as canonical,computePublicKeyFingerprint,createTrustedOperatorRegistry,createSignedPreIntent,type PinnedOperatorApproval} from '../../src/scripts/operator-audit-protocol'
import {executeR1Activation,verifyR1ActivationInput,type R1ActivationManifest} from '../../src/scripts/r1-activation'
import {commissionR1SignerScope} from '../../src/scripts/r1-signer-scope'
import {NativeFileAtomicNonceAdapter} from '../../src/scripts/native-runtime-adapters'
import {readR1Readiness,MFA_RUNTIME_FLAGS} from '../../src/scripts/r1-readiness'
async function main(){
 const u=new URL(process.env.DATABASE_URL??'postgres://invalid/invalid'),dbName=process.env.PG_MFA_NATIVE_TEST_DATABASE??''
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||process.env.PG_MFA_TEST_SENTINEL!=='mfa-pg16-disposable-ci-v1'||!/^mfa_cli_ci_[a-f0-9]{16}$/.test(dbName)||u.pathname!=='/'+dbName||u.hostname!=='127.0.0.1'||u.port!=='5432'||u.username!=='mfa_test')throw Error('REFUSED: TEST_FIXTURE requires existing GitHub disposable CLI database; NOT_AUTHORITY')
 // Only AFTER the non-protected CI target boundary. Generated key never leaves memory.
 const key=generateKeyPairSync('ed25519'),pem=key.publicKey.export({format:'pem',type:'spki'}).toString(),privatePem=key.privateKey.export({format:'pem',type:'pkcs8'}).toString(),fp=computePublicKeyFingerprint(pem)
 const control=new Client({connectionString:u.toString()});await control.connect();let facts:any
 try{facts=await readR1Readiness(control)}finally{await control.end()}
 const now=new Date().toISOString(),expires=new Date(Date.now()+300000).toISOString(),runId='r1-b07-TEST_FIXTURE-'+randomBytes(12).toString('hex'),sid='S-1-5-21-111-222-333-444',sha='c'.repeat(40)
 const manifest:R1ActivationManifest['manifest'] & {testFixture:string}={manifestVersion:'1.1.0',runId,nonce:randomBytes(32).toString('hex'),taskEnvironmentId:'TEST_FIXTURE_NOT_AUTHORITY',targetDatabase:dbName,targetHost:'127.0.0.1',targetPort:'5432',targetContainerName:'TEST_FIXTURE',targetVolumeName:'NONE',authorizedOperator:{executorType:'automation_agent',operatorId:'TEST_FIXTURE_NOT_AUTHORITY',windowsSecurityPrincipal:sid,approvalReference:'https://github.com/DenizOner/DogruAdres/issues/238#issuecomment-6366377036'},targetCommitSha:sha,issuedAt:now,expiresAt:expires,actionScope:'ACTIVATE_MFA_DEPLOYMENT_LATCH',runtimeResourceBinding:{postgresSystemIdentifier:facts.cluster},expectedTransition:{from:false,to:true,fromVersion:1,toVersion:2},preconditions:facts,runtimeFlags:Object.fromEntries(MFA_RUNTIME_FLAGS.map(k=>[k,'true'])),testFixture:'NOT_AUTHORITY'}
 const signed:R1ActivationManifest={manifest,signerKeyFingerprint:fp,signatureBase64:sign(null,Buffer.from(canonical(manifest)),privatePem).toString('base64')}
 const pin:PinnedOperatorApproval={trustDomain:'dogruadres-m0-mfa',executorType:'automation_agent',operatorId:manifest.authorizedOperator.operatorId,runId,windowsPrincipal:sid,approvalReference:manifest.authorizedOperator.approvalReference,keyFingerprint:fp,taskEnvironmentId:manifest.taskEnvironmentId,targetDatabase:dbName,targetCommitSha:sha,validFrom:now,validUntil:expires}
 const registry=createTrustedOperatorRegistry({registrySchemaVersion:'1.1.0',trustDomain:pin.trustDomain,operators:[{executorType:pin.executorType,operatorId:pin.operatorId,windowsPrincipal:sid,approvalReference:pin.approvalReference,publicKeyPem:pem,keyFingerprint:fp,validFrom:now,validUntil:expires}]},pin)
 const intent=createSignedPreIntent(runId,manifest,manifest.authorizedOperator.operatorId,privatePem),input={manifest:signed,intent,registry},env={...process.env,...manifest.runtimeFlags}
 const dir=await mkdtemp(path.join(os.tmpdir(),'r1-TEST_FIXTURE-')),nonce=new NativeFileAtomicNonceAdapter(dir)
 const deps={connectionString:u.toString(),privateKeyPem:privatePem,evidenceDirectory:dir,nonce,env,assertAuthority:async()=>{verifyR1ActivationInput(input,env)}}

 try { const result=await executeR1Activation(input,deps);assert.equal(result.outcome.status,'ARMED');const evidence=process.env.B07_EVIDENCE_DIR!;assert.ok(evidence.startsWith(process.env.RUNNER_TEMP!+'/'));await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,'activation.json'),JSON.stringify({label:'TEST_FIXTURE NOT_AUTHORITY',source:sha,status:result.outcome.status,entities:result.evidence.committedEntities.length,manifestSha256:createHash('sha256').update(canonical(manifest)).digest('hex'),armedSha256:createHash('sha256').update(canonical(result.outcome)).digest('hex'),at:new Date().toISOString()}));console.log('PASS B07 disposable native activation via existing R1 CAS/readback; TEST_FIXTURE NOT_AUTHORITY') } finally { await rm(dir,{recursive:true,force:true}) }
}
main().then(()=>process.exit(0)).catch((err)=>{console.error('B07 activation failed:',err instanceof Error?err.stack:String(err));process.exit(1)})



