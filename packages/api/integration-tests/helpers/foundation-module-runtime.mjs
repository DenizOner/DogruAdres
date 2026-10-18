/** AF-1D1 SOURCE ONLY / NOT TESTED. Explicit future invocation from packages/api:
 * node integration-tests/helpers/foundation-module-runtime.mjs --run
 * No runner, project config, SQL driver, Docker or service is initialized on import.
 * Future external manifest (NO credentials), supplied via AF1_MODULE_AUTHORIZATION:
 * {version:1,task:"AF-1D1",runId:<16 hex>,expiresAt:<canonical UTC ISO>,sourceCommit,
 * fileHashes:{<both relative harness paths>:<sha256>},database:"af1d1_<runId>",
 * databaseOid:<integer>,systemIdentifier:<decimal string>,
 * permissions:["connect","ensure-database","migrate-up","drop-owned-schema"],
 * exclusiveInstance:true,postgres:{id:<64 hex>,name:"dogruadres-af1d1-<runId>-postgres",
 * imageId:"sha256:<64 hex>",port:<dedicated high loopback port>,
 * volume:"dogruadres-af1d1-<runId>-data",mounts:<exact Docker Mounts array>}}
 * DATABASE_URL is transient and NEVER logged. No default target is allowed.
 * Operator attestation alone is insufficient: exact container/volume labels,
 * bindings, mounts, DB OID and PostgreSQL system identity are independently read.
 * Future authorization MUST cover ensureDatabase/migrations and DROP SCHEMA CASCADE
 * performed by Medusa's test runner. No original/G1 instance or storage is eligible.
 * Only one dedicated PostgreSQL instance/database; no Redis, API, auth fixtures.
 * Require exclusive operator custody: do not replace containers, bindings, volumes
 * or credentials during execution. This guard is NOT an OS sandbox or TOCTOU proof.
 * The Jest child independently repeats preflight before importing test-utils.
 * Any interrupted/failed execution requires retention and separately authorized
 * reconciliation/disposal of the EXACT task-owned instance, never wildcard cleanup.
 */
import assert from 'node:assert/strict'
import { readFileSync, realpathSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const self=fileURLToPath(import.meta.url), api=resolve(dirname(self),'../..'), root=resolve(api,'../..')
const sourcePaths=['packages/api/integration-tests/helpers/foundation-module-runtime.mjs','packages/api/integration-tests/modules/foundation-audit.evidence.cjs']
const require=createRequire(import.meta.url)
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const inspect=(kind,id)=>JSON.parse(execFileSync('docker',[kind,'inspect',id],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}))[0]
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim()
const generic=()=>new Error('AF1_MODULE_PREFLIGHT_OR_SHUTDOWN_UNCONFIRMED: details withheld; do not initialize or retry')
export async function verify() {
  let db, primary, result
  try {
    assert.equal(process.env.NODE_ENV,'test')
    assert(process.env.AF1_MODULE_AUTHORIZATION && process.env.DATABASE_URL)
    const bytes=readFileSync(process.env.AF1_MODULE_AUTHORIZATION), m=JSON.parse(bytes)
    if(process.env.AF1_MODULE_MANIFEST_SHA) assert.equal(digest(bytes),process.env.AF1_MODULE_MANIFEST_SHA)
    assert.equal(m.version,1); assert.equal(m.task,'AF-1D1'); assert.match(m.runId,/^[a-f0-9]{16}$/)
    assert.equal(m.exclusiveInstance,true)
    assert.deepEqual([...m.permissions].sort(),['connect','drop-owned-schema','ensure-database','migrate-up'])
    assert.match(m.expiresAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.equal(new Date(m.expiresAt).toISOString(),m.expiresAt)
    const remaining=Date.parse(m.expiresAt)-Date.now()
    assert(remaining>=1800000 && remaining<=86400000,'At least 30 minutes authorization required for bounded runner lifecycle')
    assert.equal(realpathSync(root).toLowerCase(),realpathSync('D:/DogruAdres-af1a').toLowerCase())
    assert.equal(git('branch','--show-current'),'feature/af-1-foundation-audit-outbox')
    assert.match(m.sourceCommit,/^[a-f0-9]{40}$/); assert.equal(git('rev-parse','HEAD'),m.sourceCommit)
    assert.equal(git('status','--porcelain=v1','-uall'),'','Reviewed committed clean source required')
    assert.deepEqual(Object.keys(m.fileHashes).sort(),[...sourcePaths].sort())
    for(const path of sourcePaths) assert.equal(digest(readFileSync(resolve(root,path))),m.fileHashes[path])
    for(const file of ['.env','.env.test','.env.local','.env.test.local']) assert(!existsSync(resolve(api,file)))
    const u=new URL(process.env.DATABASE_URL)
    assert.equal(u.protocol,'postgres:'); assert.equal(u.hostname,'127.0.0.1'); assert.equal(u.search,''); assert.equal(u.hash,'')
    assert(u.username && u.password,'Fresh dedicated database credentials required; values withheld')
    assert.equal(m.database,`af1d1_${m.runId}`); assert.equal(u.pathname,`/${m.database}`)
    assert(Number.isInteger(m.postgres.port) && m.postgres.port>=49152 && m.postgres.port<=65535)
    assert(![55437,56379].includes(m.postgres.port)); assert.equal(Number(u.port),m.postgres.port)
    assert(Number.isSafeInteger(m.databaseOid) && m.databaseOid>0); assert.match(m.systemIdentifier,/^[0-9]{10,25}$/)
    const p=m.postgres; assert.match(p.id,/^[a-f0-9]{64}$/); assert.match(p.imageId,/^sha256:[a-f0-9]{64}$/)
    assert.equal(p.name,`dogruadres-af1d1-${m.runId}-postgres`); assert.equal(p.volume,`dogruadres-af1d1-${m.runId}-data`)
    const c=inspect('container',p.id)
    assert.equal(c.Id,p.id); assert.equal(c.Name,`/${p.name}`); assert.equal(c.Image,p.imageId); assert.equal(c.State.Running,true)
    for(const [k,v] of Object.entries({'dogruadres.task':'AF-1D1','dogruadres.run':m.runId})) assert.equal(c.Config.Labels[k],v)
    assert.equal(c.HostConfig.Privileged,false); assert.equal(c.HostConfig.NetworkMode,'bridge')
    assert.deepEqual(c.HostConfig.PortBindings,{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:String(p.port)}]})
    assert.deepEqual(c.NetworkSettings.Ports,{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:String(p.port)}]})
    assert.deepEqual(c.Mounts,p.mounts); assert.equal(c.Mounts.length,1)
    assert.equal(c.Mounts[0].Type,'volume'); assert.equal(c.Mounts[0].Name,p.volume)
    assert.equal(c.Mounts[0].Destination,'/var/lib/postgresql/data'); assert.equal(c.Mounts[0].RW,true)
    const volume=inspect('volume',p.volume)
    assert.equal(volume.Name,p.volume); assert.equal(volume.Driver,'local')
    assert(!volume.Options || Object.keys(volume.Options).length===0)
    assert.equal(volume.Mountpoint,c.Mounts[0].Source)
    assert.equal(volume.Labels['dogruadres.task'],'AF-1D1'); assert.equal(volume.Labels['dogruadres.run'],m.runId)
    // pg is deliberately loaded only after exact Docker identity/storage checks.
    const {Client}=require('pg')
    db=new Client({connectionString:u.href,application_name:`af1d1_${m.runId}_guard`,connectionTimeoutMillis:5000,query_timeout:5000})
    await db.connect()
    const row=(await db.query("select current_database() as name,(select oid::int from pg_database where datname=current_database()) as oid,system_identifier::text as system from pg_control_system()" )).rows[0]
    assert.equal(row.name,m.database); assert.equal(row.oid,m.databaseOid); assert.equal(row.system,m.systemIdentifier)
    const databases=(await db.query('select datname from pg_database where not datistemplate order by datname')).rows.map(r=>r.datname)
    assert.deepEqual(databases.sort(),[m.database,'postgres'].sort(),'No other application database permitted')
    assert.equal((await db.query("select count(*)::int as n from information_schema.tables where table_schema='public'" )).rows[0].n,0,'Fresh empty target required before runner')
    result={runId:m.runId,database:m.database,sourceCommit:m.sourceCommit,manifestHash:digest(bytes),databaseOid:row.oid,systemIdentifier:row.system}
  } catch { primary=generic() }
  finally { if(db) { try { await db.end() } catch { primary=generic() } } }
  if(primary) throw primary
  return result
}
function childEnvironment(manifestHash) {
  const u=new URL(process.env.DATABASE_URL), env={}
  for(const k of ['SystemRoot','WINDIR','ComSpec','PATHEXT','PATH']) if(process.env[k]) env[k]=process.env[k]
  Object.assign(env,{NODE_ENV:'test',GIT_OPTIONAL_LOCKS:'0',AF1_MODULE_AUTHORIZATION:process.env.AF1_MODULE_AUTHORIZATION,DATABASE_URL:u.href,
    DB_HOST:'127.0.0.1',DB_PORT:u.port,DB_USERNAME:decodeURIComponent(u.username),DB_PASSWORD:decodeURIComponent(u.password),DB_TEMP_NAME:u.pathname.slice(1),
    AF1_MODULE_MANIFEST_SHA:manifestHash,PGAPPNAME:'af1d1_module_evidence',AF1_MODULE_LAUNCH:'explicit-guarded-launch',NODE_OPTIONS:'',LOG_LEVEL:'error'})
  return env
}
async function main() {
  assert(['--run','--verify-only'].includes(process.argv[2]) && process.argv.length===3)
  const evidence=await verify()
  if(process.argv[2]==='--verify-only') { process.stdout.write(JSON.stringify(evidence)); return }
  const suite=resolve(api,'integration-tests/modules/foundation-audit.evidence.cjs')
  // Never load repository jest.config.js: it calls loadEnv before test discovery.
  const config={rootDir:api,testEnvironment:'node',testRegex:'foundation-audit\\.evidence\\.cjs$',moduleFileExtensions:['cjs','js','ts','json'],
    transform:{'^.+\\.[jt]s$':['@swc/jest',{jsc:{parser:{syntax:'typescript',decorators:true},target:'es2021',transform:{legacyDecorator:true,decoratorMetadata:true}},module:{type:'commonjs'}}]},
    testTimeout:120000,cache:false,setupFiles:[],setupFilesAfterEnv:[]}
  const child=spawnSync(process.execPath,[require.resolve('jest/bin/jest'),'--config',JSON.stringify(config),'--runInBand','--runTestsByPath',suite],
    {cwd:api,env:childEnvironment(evidence.manifestHash),stdio:'inherit',timeout:600000})
  // A timeout/abort is NOT cleanup proof. Never kill databases or retry here.
  if(child.error || child.signal || child.status!==0) throw generic()
}
if(process.argv[1] && resolve(process.argv[1])===self) main().catch(()=>{process.stderr.write('AF1_MODULE_EVIDENCE_INCOMPLETE — retain isolated runtime for separately authorized review\n');process.exitCode=1})
