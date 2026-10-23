/** Direct Node only; no medusa exec/loaders. External R1 source scope first. */
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {commissionR1SignerScope} from './r1-signer-scope'
import {executeR1Activation,verifyR1ActivationInput,type R1ActivationManifest} from './r1-activation'
import {NativeDockerResourceAdapter,NativeWindowsSecurityAdapter,NativeFileAtomicNonceAdapter} from './native-runtime-adapters'
import {assertRedisResourceMatchesGrant} from './reviewer-execution-grant'
import {verifyPathEffectiveSecurity,redactSensitiveData,type SignedPreIntent} from './operator-audit-protocol'
const exec=promisify(execFile)
async function main(){
 if(process.platform!=='win32')throw Error('REFUSED: Windows required')
 const manifestPath=process.env.M0_R1_MANIFEST_PATH,intentPath=process.env.M0_R1_INTENT_PATH,keyPath=process.env.M0_R1_OPERATOR_KEY_PATH
 if(!manifestPath||!intentPath||!keyPath||!process.env.DATABASE_URL)throw Error('REFUSED: protected R1 inputs missing')
 const signed=JSON.parse(await readFile(manifestPath,'utf8')) as R1ActivationManifest,intent=JSON.parse(await readFile(intentPath,'utf8')) as SignedPreIntent
 const m=signed.manifest as any,probe=new NativeDockerResourceAdapter(),git=async(...args:string[])=>(await exec('git',args)).stdout.trim()
 const actual=async()=>({sourceSha:await git('rev-parse','HEAD'),windowsSid:(await probe.getOperatorPrincipal()).windowsPrincipal})
 // Reject unreviewed final source BEFORE reading private key or opening DB.
 const registry=commissionR1SignerScope(signed,await actual()),input={manifest:signed,intent,registry}
 verifyR1ActivationInput(input,process.env)
 const directory=m.evidenceDirectory,nonceDirectory=path.join(directory,'nonce-claims'),security=new NativeWindowsSecurityAdapter()
 const norm=(p:string)=>path.resolve(p).toLowerCase()
 if(norm(await git('rev-parse','--show-toplevel'))!==norm('D:/DogruAdres-m0-session-vertical-20261020')||norm(await git('rev-parse','--path-format=absolute','--git-common-dir'))!==norm('D:/DogruAdres-publication-20261017-145345/.git')||norm(m.nonceDirectory)!==norm(nonceDirectory))throw Error('REFUSED: worktree/evidence mismatch')
 const [pg,redis]=m.runtimeResourceBinding.resources
 const adapter=new NativeDockerResourceAdapter(process.cwd(),{containerId:pg.id,imageId:pg.image,composeProject:pg.project,volumeName:pg.mounts[0].Name,volumeMountSource:pg.mounts[0].Source,volumeMountDestination:pg.mounts[0].Destination,loopbackHostPort:m.targetPort,postgresSystemIdentifier:m.runtimeResourceBinding.postgresSystemIdentifier})
 const assertAuthority=async()=>{
  commissionR1SignerScope(signed,await actual());verifyR1ActivationInput(input,process.env)
  if(await git('status','--porcelain=v2','--untracked-files=no'))throw Error('REFUSED: tracked worktree/index changed')
  for(const p of [keyPath,directory,nonceDirectory,manifestPath,intentPath])verifyPathEffectiveSecurity(await security.inspectPathSecurity(p),(await actual()).windowsSid)
  await adapter.inspectContainer(m.targetContainerName)
  const r=JSON.parse((await exec('docker',['inspect','--format','{{json .}}',redis.id])).stdout)
  assertRedisResourceMatchesGrant(r,{name:redis.name,id:redis.id,imageId:redis.image,project:redis.project,mounts:redis.mounts,ports:redis.ports})
 }
 await assertAuthority()
 await executeR1Activation(input,{connectionString:process.env.DATABASE_URL,privateKeyPem:await readFile(keyPath,'utf8'),evidenceDirectory:directory,nonce:new NativeFileAtomicNonceAdapter(nonceDirectory),env:process.env,assertAuthority})
 console.log('R1 ARMED_COMMITTED_VERIFIED; protected receipt/outcome persisted')
}
if(require.main===module)main().catch(e=>{console.error(redactSensitiveData(e instanceof Error?e.message:String(e)));process.exitCode=1})