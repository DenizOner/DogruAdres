/** AF-1C test infrastructure only. Never import from production code.
 * AF-1D must provision and authorize a NEW runtime; this helper provisions nothing.
 * Required external manifest (no credentials):
 * {version:1, task:"AF-1D", runId:<16 hex>, expiresAt:<ISO>, sourceCommit:<40 hex>,
 *  database:"af1d_<runId>", databaseOid:<positive integer>, systemIdentifier:<decimal string>, apiUrl:"http://127.0.0.1:<port>",
 *  apiApplicationName:"af1d_<runId>_api",
 *  postgres:{id:<64 hex>,name:"dogruadres-af1d-<runId>-postgres",port:<number>,mounts:[...]},
 *  redis:{id:<64 hex>,name:"dogruadres-af1d-<runId>-redis",port:<number>,mounts:[...]}}
 * mounts is the EXACT [{Type,Name,Source,Destination,RW}] Docker inventory.
 * Only new named volumes, independently labelled with this task/run, are accepted.
 * AF-1D must set PGAPPNAME on the actual API and verify its process/build separately.
 * R2 manifest additions: fileHashes (exact relative paths of BOTH test files ->
 * SHA-256), configHash (medusa-config.ts), cliInitializationReviewed:true.
 * expiresAt MUST be a canonical UTC ISO string, e.g. YYYY-MM-DDTHH:mm:ss.sssZ.
 * Authorization is an operator attestation, not cryptographic proof of isolation.
 * Opaque process-local capabilities reject invented, cloned or expired handles.
 * They are not a sandbox against malicious code already running in this process.
 *
 * CLI provenance: Medusa 2.21.2 commands/exec.js initializes config before importing
 * this fixture, then loaders/index.js connects PostgreSQL, loads modules/workflows/
 * subscribers, may load jobs, runs createDefaultsWorkflow and onApplicationStart
 * BEFORE invoking the callback. skipLoadingEntryPoints does not skip these effects.
 * Only runIsolatedUserFixture is an approved launcher; directly invoking Medusa
 * exec cannot be made safe by a fixture callback which has not run yet.
 * AF-1D MUST independently review all configured module startup/external endpoints,
 * verify the actual API process/build, and authorize framework initialization writes.
 * No local .env overrides are permitted. Child env is explicitly allowlisted.
 * R3: cliFilesystem:{root,ownershipSha256,telemetryConfigSha256} is required ONLY
 * for CLI launch. AF-1D must separately provision <OS temp>/dogruadres-af1d-<runId>/cli
 * with ownership.json={task:"AF-1D",runId,root} and the fixed subdirectories below.
 * config/medusa/config.json must initially contain only {telemetry:{enabled:false}}.
 * This helper only reads/validates these files; it NEVER provisions/deletes them.
 * Pre-launch checks reject symlink/junction paths, linked files, wrong inventory,
 * old outboxes and missing provenance. Do not reuse a previous CLI profile.
 * Normal telemetry config is disabled using BOTH validated config and the env
 * control. However, Medusa's configstore-error fallback enables tracking again.
 * CLI launch is therefore BLOCKED below until separately reviewed containment
 * can cover that fallback; validated paths/env alone are NOT a complete solution.
 * A loopback-only telemetry host is defense in depth, not a network sandbox.
 * Windows ACL/TOCTOU, OS Known Folder/native APIs, network egress, plugin/startup
 * effects and descendant process containment remain independent AF-1D gates.
 * No claim is made that environment variables isolate arbitrary native code.
 *
 * ABNORMAL TERMINATION RECOVERY (not executed automatically): stop only the
 * verified task-owned API/CLI first, inspect pg_stat_activity for unresolved task
 * requests, and revalidate the manifest/container IDs/database system ID/OID.
 * Never infer ownership from an af1_ name alone: SQL objects carry a task/run/probe
 * COMMENT and the suite emits the exact inventory before starting the operation.
 * Inspect pg_trigger/pg_proc/pg_class + comments; require exact inventory agreement
 * before an individually approved DROP. Never wildcard DROP or CASCADE. If a
 * crash occurred between CREATE and COMMENT, ownership is unproven: retain the
 * object/runtime for review rather than automatically deleting it.
 * Synthetic users/domain evidence remain in the disposable database; use only
 * inventoried fixture IDs for verification cleanup. On uncertainty retain the
 * dedicated runtime for review, or separately authorize disposal of that whole
 * newly owned runtime. Expiry does not authorize writes/cleanup against old targets.
 */
import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve, join, relative, isAbsolute, parse } from 'node:path'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

const inspect = (kind, id) => JSON.parse(execFileSync('docker', [kind, 'inspect', id], {encoding:'utf8', timeout:10000}))[0]
export const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const identifier = value => { assert.match(value, /^[a-z][a-z0-9_]{0,62}$/); return '"'+value+'"' }
const tables = new Set(['da_audit_event','da_organization','da_organization_membership','da_organization_invitation'])


const runtimes = new WeakMap(), connections = new WeakMap(), probes = new WeakMap()
const requestScope = new AsyncLocalStorage()
const poisonedRuns = new Set()
function taint(state) { state.tainted=true;poisonedRuns.add(state.manifest.runId) }
const helperPath = fileURLToPath(import.meta.url)
const apiRoot = resolve(dirname(helperPath),'../..')
const sourcePaths = [
  'packages/api/integration-tests/helpers/isolated-foundation-runtime.mjs',
  'packages/api/integration-tests/http/dogruadres-foundation.atomicity.native.test.mjs',
]
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const safeFailure = category => new Error(category) // never embed SQL/client errors or credentials
function checkFiles(m) {
  assert.deepEqual(Object.keys(m.fileHashes??{}).sort(),[...sourcePaths].sort())
  for (const rel of sourcePaths) {
    assert.match(m.fileHashes[rel],/^[a-f0-9]{64}$/)
    assert.equal(sha256(resolve(apiRoot,'../..',rel)),m.fileHashes[rel],'Source evidence hash mismatch')
  }
  assert.match(m.configHash,/^[a-f0-9]{64}$/)
  assert.equal(sha256(resolve(apiRoot,'medusa-config.ts')),m.configHash)
  for(const name of ['.env','.env.test','.env.local','.env.test.local'])
    assert.equal(existsSync(resolve(apiRoot,name)),false,'Local env overrides require removal from this disposable runtime plan, never automatic deletion')
}
function active(cap, inspectResources=false) {
  const state=runtimes.get(cap)
  assert.ok(state,'Validated process-local runtime authorization required')
  assert.ok(!state.tainted&&!poisonedRuns.has(state.manifest.runId),'INCONCLUSIVE: runtime outcome unknown; stop and reconcile task-owned activity')
  assert.equal(sha256(state.environment.DOGRUADRES_AF1_AUTHORIZATION_FILE),state.manifestHash,'Authorization manifest changed')
  assert.ok(Date.now()<state.deadline,'Runtime authorization expired; no new side effects permitted')
  for(const [key,value] of Object.entries(state.environment)) assert.ok(process.env[key]===value,'Runtime environment changed; values intentionally withheld')
  checkFiles(state.manifest)
  if(inspectResources) authorizeRuntime() // Fresh exact Docker/resource checks before opening a connection or HTTP request.
  return state
}
function connection(db) {
  const record=connections.get(db)
  assert.ok(record&&record.phase==='open','Authorized open observer handle required')
  active(record.cap)
  return record
}
function probeRecord(probe) {
  const record=probes.get(probe)
  assert.ok(record,'Authorized SQL probe required')
  connection(record.db)
  return record
}
// Cleanup runs every step, retains the primary failure and surfaces safe categories.
// A Promise.race timeout is NOT used for SQL: it would leave unobserved writes alive.
export async function preserveFailure(body, cleanupSteps=[]) {
  let primary, result
  try { result=await body() } catch(error) { primary=error }
  const failed=[]
  for(let i=0;i<cleanupSteps.length;i++) {
    try { await cleanupSteps[i]() } catch { failed.push(i+1) }
  }
  if(primary) {
    if(failed.length) throw new AggregateError([primary,safeFailure(`CLEANUP_FAILED_STEPS_${failed.join('_')}`)],'Primary operation failed; cleanup also incomplete')
    throw primary
  }
  if(failed.length) throw safeFailure(`CLEANUP_FAILED_STEPS_${failed.join('_')}`)
  return result
}
export async function settleRequests(promises) {
  // Requests have a 20-second abort signal. Settlement is bounded by request();
  // aborting HTTP is NOT proof that the server transaction stopped. On transport
  // failure retain probes and stop this suite until AF-1D operator reconciliation.
  const results=await Promise.allSettled(promises.filter(Boolean))
  if(results.some(r=>r.status==='rejected')) throw safeFailure('INCONCLUSIVE_IN_FLIGHT_REQUEST_REQUIRES_RUNTIME_RECONCILIATION')
  return results
}

export function authorizeRuntime() {
  assert.equal(process.env.NODE_ENV, 'test', 'Test-only runtime required')
  for (const key of ['DOGRUADRES_AF1_AUTHORIZATION_FILE','DATABASE_URL','REDIS_URL','DOGRUADRES_TEST_API_URL']) assert.ok(process.env[key], `Missing ${key}; no default target is permitted`)
  const manifestBytes=readFileSync(process.env.DOGRUADRES_AF1_AUTHORIZATION_FILE)
  const manifestHash=createHash('sha256').update(manifestBytes).digest('hex')
  const m=JSON.parse(manifestBytes.toString('utf8'))
  assert.equal(m.version,1); assert.equal(m.task,'AF-1D'); assert.match(m.runId,/^[a-f0-9]{16}$/)
  assert.ok(!poisonedRuns.has(m.runId),'Runtime outcome unknown; new handles cannot bypass reconciliation')
  assert.equal(typeof m.expiresAt,'string')
  assert.match(m.expiresAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal(new Date(m.expiresAt).toISOString(),m.expiresAt,'Expiry must be canonical UTC ISO')
  const remaining=Date.parse(m.expiresAt)-Date.now()
  assert.ok(remaining>0 && remaining<=86400000,'Authorization must expire within 24 hours')
  assert.match(m.sourceCommit,/^[a-f0-9]{40}$/)
  const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()
  assert.equal(realpathSync(root).toLowerCase(), realpathSync('D:/DogruAdres-af1a').toLowerCase())
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),m.sourceCommit)
  assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'feature/af-1-foundation-audit-outbox')
  execFileSync('git',['diff','--quiet'],{cwd:apiRoot,stdio:'pipe'})
  execFileSync('git',['diff','--cached','--quiet'],{cwd:apiRoot,stdio:'pipe'})
  assert.equal(m.database,`af1d_${m.runId}`)
  assert.ok(Number.isSafeInteger(m.databaseOid)&&m.databaseOid>0)
  assert.match(m.systemIdentifier,/^[0-9]{10,25}$/)
  const urls=[new URL(process.env.DATABASE_URL),new URL(process.env.REDIS_URL),new URL(m.apiUrl)]
  for (const u of urls) {
    assert.equal(u.hostname,'127.0.0.1'); assert.equal(u.search,''); assert.equal(u.hash,'')
    assert.ok(Number(u.port)>=49152 && Number(u.port)<=65535,'Dedicated high loopback port required')
    assert.ok(![55437,56379].includes(Number(u.port)),'Historical G1 ports forbidden')
  }
  assert.equal(new Set(urls.map(u=>u.port)).size,3)
  assert.equal(urls[0].protocol,'postgres:'); assert.equal(urls[0].pathname,`/${m.database}`)
  assert.equal(urls[1].protocol,'redis:'); assert.ok(['','/0','/'].includes(urls[1].pathname))
  assert.ok(urls[1].username===''&&urls[1].password==='','Redis userinfo forbidden; values withheld')
  assert.equal(urls[2].protocol,'http:'); assert.equal(urls[2].pathname,'/')
  assert.ok(urls[2].username===''&&urls[2].password==='','API userinfo forbidden; values withheld')
  assert.equal(process.env.DOGRUADRES_TEST_API_URL,m.apiUrl)
  assert.equal(m.apiApplicationName,`af1d_${m.runId}_api`)
  for (const [kind,port,index,destination] of [['postgres',5432,0,'/var/lib/postgresql/data'],['redis',6379,1,'/data']]) {
    const expected=m[kind]; assert.match(expected.id,/^[a-f0-9]{64}$/)
    assert.equal(expected.name,`dogruadres-af1d-${m.runId}-${kind}`)
    assert.equal(String(expected.port),urls[index].port)
    const c=inspect('container',expected.id)
    assert.equal(c.Id,expected.id); assert.equal(c.Name,'/'+expected.name); assert.equal(c.State.Status,'running')
    assert.equal(c.Config.Labels?.['dogruadres.task'],'AF-1D'); assert.equal(c.Config.Labels?.['dogruadres.run'],m.runId)
    assert.equal(c.HostConfig.Privileged,false); assert.notEqual(c.HostConfig.NetworkMode,'host')
    assert.deepEqual(c.HostConfig.PortBindings,{[`${port}/tcp`]:[{HostIp:'127.0.0.1',HostPort:String(expected.port)}]})
    assert.equal(c.Mounts.length,1,'No extra mounts or Docker socket')
    assert.deepEqual(c.Mounts.map(({Type,Name,Source,Destination,RW})=>({Type,Name,Source,Destination,RW})),expected.mounts)
    const mount=c.Mounts[0]
    assert.equal(mount.Type,'volume'); assert.equal(mount.Destination,destination); assert.equal(mount.RW,true)
    assert.equal(mount.Name,`dogruadres-af1d-${m.runId}-${kind}-data`)
    const volume=inspect('volume',mount.Name)
    assert.equal(volume.Labels?.['dogruadres.task'],'AF-1D'); assert.equal(volume.Labels?.['dogruadres.run'],m.runId)
    assert.ok(!JSON.stringify(c.Mounts).includes('dogruadres-postgres-data'))
    assert.ok(!JSON.stringify(c.Mounts).includes('g1-0b'))
  }
  assert.equal(realpathSync(process.cwd()).toLowerCase(),realpathSync(apiRoot).toLowerCase(),'Run only from packages/api')
  checkFiles(m)
  assert.equal(m.cliInitializationReviewed,true,'AF-1D must review pre-callback CLI initialization')
  const cap=Object.freeze({runId:m.runId,database:m.database,apiApplicationName:m.apiApplicationName})
  const environment=Object.fromEntries(['NODE_ENV','DATABASE_URL','REDIS_URL','DOGRUADRES_TEST_API_URL','DOGRUADRES_AF1_AUTHORIZATION_FILE'].map(key=>[key,process.env[key]]))
  runtimes.set(cap,{manifest:structuredClone(m),environment,deadline:Date.parse(m.expiresAt),manifestHash,tainted:false})
  return cap
}

export function runtimeProvenance(cap) {
  const state=active(cap), m=state.manifest
  return {sourceCommit:m.sourceCommit,fileHashes:{...m.fileHashes},manifestHash:state.manifestHash,
    runId:m.runId,expiresAt:m.expiresAt,postgresContainerId:m.postgres.id,redisContainerId:m.redis.id,
    database:m.database,databaseOid:m.databaseOid,systemIdentifier:m.systemIdentifier}
}
async function closeClient(raw) {
  // Only shutdown is timed out, never a SQL mutation. Client 'end' notification
  // is not independent proof that PostgreSQL completed every server transaction.
  let timer
  try {
    await Promise.race([raw.end(),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(safeFailure('OBSERVER_CLOSE_TIMEOUT_RECONCILIATION_REQUIRED')),3000)
    })])
  }catch(error){
    throw safeFailure(error?.message==='OBSERVER_CLOSE_TIMEOUT_RECONCILIATION_REQUIRED'
      ? 'OBSERVER_CLOSE_TIMEOUT_RECONCILIATION_REQUIRED' : 'OBSERVER_CLOSE_FAILED_RECONCILIATION_REQUIRED')
  }finally{clearTimeout(timer)}
}
function shutdownObserver(raw,record) {
  // One physical close attempt. Concurrent/repeated calls share its result;
  // an uncertain outcome is sticky and is NEVER converted into a retry/success.
  if(record.closePromise)return record.closePromise
  record.phase='closing' // Immediately disallow new queries on this handle.
  const uncertainQueries=record.pending>0||record.queryUncertain
  if(uncertainQueries)taint(runtimes.get(record.cap))
  record.closePromise=(async()=>{
    try {
      await closeClient(raw)
      if(uncertainQueries)throw safeFailure('OBSERVER_CLOSE_WITH_UNCONFIRMED_SQL_RECONCILIATION_REQUIRED')
      record.phase='closed' // Only after client shutdown notification, never on invocation.
    }catch(error){
      record.phase='uncertain'
      taint(runtimes.get(record.cap))
      throw error // closeClient and the in-flight branch emit sanitized categories only.
    }
  })()
  return record.closePromise
}
export async function observer(cap) {
  const state=active(cap,true), m=state.manifest
  const require=createRequire(resolve(apiRoot,'package.json'))
  const framework=realpathSync(require.resolve('@medusajs/framework'))
  const {Client}=require(require.resolve('pg',{paths:[dirname(framework)]}))
  const raw=new Client({connectionString:state.environment.DATABASE_URL,application_name:`af1d_${m.runId}_observer`,options:'-c search_path=public',statement_timeout:5000,query_timeout:7000,connectionTimeoutMillis:5000})
  const record={cap,phase:'opening',pending:0,queryUncertain:false,closePromise:null}
  try {
    await raw.connect()
    const identity=await raw.query('select current_database() as name, inet_server_addr()::text as address')
    assert.equal(identity.rows[0].name,m.database); assert.ok(identity.rows[0].address)
    const physical=await raw.query('select oid::int as oid, (select system_identifier::text from pg_control_system()) as system_id from pg_database where datname=current_database()')
    assert.equal(physical.rows[0].oid,m.databaseOid); assert.equal(physical.rows[0].system_id,m.systemIdentifier)
    const api=await raw.query('select pid from pg_stat_activity where datname=$1 and application_name=$2',[m.database,m.apiApplicationName])
    assert.ok(api.rowCount>0,'No API connection with the dedicated runtime marker; STOP before HTTP/DDL')
    const facade=Object.freeze({
      async query(sql,values) {
        const r=connection(facade)
        r.pending++
        try {return await raw.query(sql,values)}
        catch {r.queryUncertain=true;taint(runtimes.get(cap));throw safeFailure('OBSERVER_SQL_FAILED_OR_TIMED_OUT_RECONCILIATION_REQUIRED')}
        finally {r.pending--}
      },
      end() {
        const r=connections.get(facade)
        assert.ok(r,'Authorized observer shutdown handle required')
        // Closing an already-owned connection is allowed even after expiry/poison;
        // it grants no query, reconnect, resource deletion or recovery authority.
        return shutdownObserver(raw,r)
      },
    })
    record.phase='open'
    connections.set(facade,record)
    return facade
  } catch {
    // Preserve the sanitized initialization failure; uncertain close poisons the
    // same run and remains a visible secondary failure, not a swallowed comment.
    await preserveFailure(async()=>{throw safeFailure('ISOLATED_OBSERVER_INITIALIZATION_FAILED')},
      [()=>shutdownObserver(raw,record)])
  }
}
export async function request(cap, method, path, bearer, body) {
  const scope=requestScope.getStore()
  const state=active(cap,scope?.mode!=='batch'), m=state.manifest
  assert.ok(path.startsWith('/')&&!path.startsWith('//'))
  const target=new URL(path,m.apiUrl)
  assert.equal(target.origin,new URL(m.apiUrl).origin,'HTTP origin escape forbidden')
  assert.ok(target.username===''&&target.password==='','HTTP userinfo forbidden; values withheld');assert.equal(target.hash,'')
  if(scope) {
    assert.equal(scope.cap,cap)
    assert.ok(scope.requests.length < (scope.mode==='batch'?scope.limit:1),'Unexpected number of HTTP requests in evidence scope')
  }
  const observation={requestId:randomUUID(),startedAt:Date.now(),method,path}
  if(scope)scope.requests.push(observation)
  let r,bodyText
  try {
    r=await fetch(target,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-request-id':observation.requestId,...(bearer?{authorization:`Bearer ${bearer}`} : {}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
    observation.headersReceivedAt=Date.now();observation.status=r.status
    // Consume the complete stream BEFORE parsing. Any abort/truncation/read error
    // stays in this transport catch; headers alone never mark completion.
    bodyText=await r.text()
    observation.bodyCompleted=true;observation.finishedAt=Date.now()
  }catch {taint(state);throw safeFailure('INCONCLUSIVE_HTTP_TRANSPORT_OR_BODY_READ_SERVER_OUTCOME_UNKNOWN')}
  let data
  try {
    // Medusa 2.21.2 commands/start.js:245-246 sends exactly "OK" for /health.
    // This is the sole explicitly allowed non-JSON response, not a generic fallback.
    if(method==='GET'&&target.pathname==='/health'&&target.search===''&&r.status===200&&bodyText==='OK') {
      observation.responseKind='health-text';data={}
    }else{
      try {data=JSON.parse(bodyText)}
      catch {throw safeFailure('HTTP_COMPLETE_RESPONSE_JSON_CONTRACT_FAILED')}
      observation.responseKind='json'
    }
  }finally{bodyText=''} // Never attach response bodies or raw parser errors to evidence.
  return {status:r.status,data}
}
export async function parallelRequests(cap,operations) {
  // Validate resources ONCE immediately before this bounded launch group. Running
  // synchronous Docker inspection between fetch launches could serialize the race
  // being tested. Each request still checks capability, expiry, hashes and origin.
  active(cap,true)
  assert.equal(operations.length,2)
  assert.ok(operations.every(operation=>typeof operation==='function'))
  const scope={cap,mode:'batch',limit:operations.length,requests:[]}
  const results=await requestScope.run(scope,()=>Promise.allSettled(operations.map(operation=>operation())))
  assert.equal(scope.requests.length,2,'Both intended authenticated requests must be launched')
  if(results.some(result=>result.status==='rejected'))throw safeFailure('INCONCLUSIVE_CONCURRENT_HTTP_OUTCOME_REQUIRES_RECONCILIATION')
  return results.map(result=>result.value)
}
export async function correlateFault(probe,operation) {
  const record=probeRecord(probe), {cap}=connection(record.db)
  const before=await probe.evidence()
  assert.equal(before.hits,0,'Probe already used; correlation would be ambiguous')
  const scope={cap,mode:'fault',requests:[]}
  const response=await requestScope.run(scope,operation)
  assert.equal(scope.requests.length,1)
  const evidence=await probe.evidence(), http=scope.requests[0]
  const backend=await record.db.query('select pid from pg_stat_activity where pid=$1 and datname=$2 and application_name=$3',[evidence.pid,cap.database,cap.apiApplicationName])
  assert.equal(backend.rowCount,1,'INCONCLUSIVE: fault backend not independently attributable to this API')
  assert.equal(evidence.raised,true,'INCONCLUSIVE: targeted SQLSTATE handler not reached; generic 500 is insufficient')
  assert.equal(evidence.raises,1,'Ambiguous repeated fault execution')
  assert.ok(evidence.hits>=record.hit && evidence.txid)
  assert.equal(http.bodyCompleted,true,'INCONCLUSIVE: complete HTTP body required')
  assert.equal(http.responseKind,'json','Fault endpoint requires its JSON response contract')
  assert.equal(http.status,500);assert.equal(response.status,500)
  return {response,evidence:{...evidence,http,classification:'TARGETED_TRIGGER_SQLSTATE_RAISED_WITHIN_SINGLE_REQUEST_WINDOW'}}
}

// R3 parent-only validation. All directories/config are separately provisioned by
// AF-1D. This function performs READS only and never repairs unsafe paths.
function isolatedCliEnvironment(m) {
  assert.equal(process.platform,'win32','CLI profile contract is Windows-only; another OS needs separate review')
  const spec=m.cliFilesystem
  assert.ok(spec&&typeof spec.root==='string','Pre-provisioned task-owned CLI filesystem required')
  assert.match(spec.root,/^[A-Za-z]:\\/,'Local absolute drive path required; UNC/device paths forbidden')
  const root=resolve(spec.root)
  const expected=join(realpathSync(tmpdir()),`dogruadres-af1d-${m.runId}`,'cli')
  assert.equal(root.toLowerCase(),expected.toLowerCase(),'CLI root outside the exact disposable boundary')
  for(const protectedRoot of ['D:/DogruAdres','D:/DogruAdres-af1a','D:/DogruAdres-publication-20261017-145345']) {
    const r=relative(resolve(protectedRoot),root)
    assert.ok(r.startsWith('..')||isAbsolute(r),'Protected checkout cannot own CLI storage')
  }
  function checked(path,kind,taskOwned=true) {
    const absolute=resolve(path)
    if(taskOwned) {
      const r=relative(root,absolute)
      assert.ok(!r.startsWith('..')&&!isAbsolute(r),'CLI storage path escaped its task boundary')
    }
    // Check every existing ancestor: realpath alone would silently follow a junction.
    for(let current=absolute;;current=dirname(current)) {
      assert.equal(lstatSync(current).isSymbolicLink(),false,'Symlink/junction path forbidden')
      if(dirname(current)===current)break
    }
    assert.equal(realpathSync(absolute).toLowerCase(),absolute.toLowerCase(),'Noncanonical CLI path')
    const stat=lstatSync(absolute)
    assert.ok(kind==='directory'?stat.isDirectory():stat.isFile(),'Required CLI path type mismatch')
    if(taskOwned&&kind==='file')assert.equal(stat.nlink,1,'Hard-linked CLI files forbidden')
    return absolute
  }
  checked(root,'directory')
  const dirs={profile:'profile',config:'config',cache:'cache',data:'data',temp:'tmp',runtime:'runtime',appdata:'appdata',roaming:'appdata/roaming',local:'appdata/local',medusa:'config/medusa'}
  for(const [key,value]of Object.entries(dirs))dirs[key]=checked(join(root,value),'directory')
  const owner=checked(join(root,'ownership.json'),'file')
  assert.match(spec.ownershipSha256,/^[a-f0-9]{64}$/)
  assert.equal(sha256(owner),spec.ownershipSha256,'CLI ownership record changed')
  let ownershipRecord
  try {ownershipRecord=JSON.parse(readFileSync(owner,'utf8'))}
  catch {throw safeFailure('CLI_OWNERSHIP_RECORD_INVALID_JSON')}
  assert.ok(ownershipRecord&&typeof ownershipRecord==='object'&&!Array.isArray(ownershipRecord)
    &&Object.keys(ownershipRecord).sort().join(',')==='root,runId,task'
    &&ownershipRecord.task==='AF-1D'&&ownershipRecord.runId===m.runId&&ownershipRecord.root===root,
    'CLI ownership record mismatch; contents withheld')
  assert.deepEqual(readdirSync(root).sort(),['appdata','cache','config','data','ownership.json','profile','runtime','tmp'].sort())
  assert.deepEqual(readdirSync(dirs.appdata).sort(),['local','roaming'])
  for(const key of ['profile','cache','data','temp','runtime','roaming','local'])
    assert.equal(readdirSync(dirs[key]).length,0,'CLI storage must be fresh; no old profile/cache/temp contents')
  assert.deepEqual(readdirSync(dirs.config),['medusa'])
  assert.deepEqual(readdirSync(dirs.medusa),['config.json'],'Old telemetry outbox or unknown config artifacts forbidden')
  const config=checked(join(dirs.medusa,'config.json'),'file')
  assert.match(spec.telemetryConfigSha256,/^[a-f0-9]{64}$/)
  assert.equal(sha256(config),spec.telemetryConfigSha256,'Initial telemetry config changed')
  let telemetryConfig
  try {telemetryConfig=JSON.parse(readFileSync(config,'utf8'))}
  catch {throw safeFailure('CLI_TELEMETRY_CONFIG_INVALID_JSON')}
  assert.ok(telemetryConfig&&typeof telemetryConfig==='object'&&!Array.isArray(telemetryConfig)
    &&Object.keys(telemetryConfig).join(',')==='telemetry'&&telemetryConfig.telemetry
    &&typeof telemetryConfig.telemetry==='object'&&!Array.isArray(telemetryConfig.telemetry)
    &&Object.keys(telemetryConfig.telemetry).join(',')==='enabled'&&telemetryConfig.telemetry.enabled===false,
    'Tracking must be explicitly disabled; unexpected config contents withheld')
  // configstore 5.0.1 uses xdg-basedir 4.0.0's XDG_CONFIG_HOME directly.
  // Explicit false disables normal Telemeter/Dispatcher tracking; the separate
  // InMemoryConfigStore error fallback enables it again. See the launch blocker.
  // MEDUSA_DISABLE_TELEMETRY alone only stops Store.addEvent, not exit flushing.
  const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT
  const windir=process.env.WINDIR??process.env.windir
  assert.ok(systemRoot&&windir,'Verified Windows system directories required')
  assert.match(systemRoot,/^[A-Za-z]:\\/)
  assert.equal(resolve(systemRoot).toLowerCase(),resolve(windir).toLowerCase(),'Ambiguous Windows system directory')
  const system=checked(systemRoot,'directory',false), system32=checked(join(system,'System32'),'directory',false)
  // Windows system binaries may legitimately be hard-linked to WinSxS. They are
  // readonly executable inputs, not task-owned storage; do not apply file nlink=1.
  const node=checked(process.execPath,'file',false), cmd=checked(join(system32,'cmd.exe'),'file',false)
  return {
    SystemRoot:system,WINDIR:system,ComSpec:cmd,PATHEXT:'.COM;.EXE;.BAT;.CMD',
    PATH:[dirname(node),system32,system].join(';'),
    HOME:dirs.profile,USERPROFILE:dirs.profile,HOMEDRIVE:parse(dirs.profile).root.slice(0,2),HOMEPATH:dirs.profile.slice(2),
    APPDATA:dirs.roaming,LOCALAPPDATA:dirs.local,TEMP:dirs.temp,TMP:dirs.temp,
    XDG_CONFIG_HOME:dirs.config,XDG_CACHE_HOME:dirs.cache,XDG_DATA_HOME:dirs.data,XDG_RUNTIME_DIR:dirs.runtime,
    MEDUSA_DISABLE_TELEMETRY:'true',MEDUSA_TELEMETRY_VERBOSE:'false',
    MEDUSA_TELEMETRY_HOST:'http://127.0.0.1:0',MEDUSA_TELEMETRY_PATH:'/disabled',
  }
}

// Sole parent launcher. All isolation + physical DB checks finish BEFORE exec.
export async function runIsolatedUserFixture(cap,credentials) {
  const state=active(cap), m=state.manifest
  const fresh=authorizeRuntime()
  assert.equal(fresh.runId,cap.runId)
  const check=await observer(fresh);await check.end()
  assert.equal(m.cliInitializationReviewed,true)
  assert.equal(credentials.length,4)
  assert.ok(credentials.every(c=>c.email.startsWith(`af1-${m.runId}-`)&&c.email.endsWith('@example.invalid')&&typeof c.password==='string'&&c.password.length>=43))
  const require=createRequire(resolve(apiRoot,'package.json'))
  for(const pkg of ['@medusajs/cli','@medusajs/medusa'])
    assert.equal(JSON.parse(readFileSync(require.resolve(`${pkg}/package.json`),'utf8')).version,'2.21.2')
  const cliRequire=createRequire(require.resolve('@medusajs/cli/package.json'))
  const telemetryPackage=cliRequire.resolve('@medusajs/telemetry/package.json')
  assert.equal(JSON.parse(readFileSync(telemetryPackage,'utf8')).version,'2.21.2')
  const telemetryRequire=createRequire(telemetryPackage)
  const configstorePackage=telemetryRequire.resolve('configstore/package.json')
  assert.equal(JSON.parse(readFileSync(configstorePackage,'utf8')).version,'5.0.1')
  const configstoreRequire=createRequire(configstorePackage)
  assert.equal(JSON.parse(readFileSync(configstoreRequire.resolve('xdg-basedir/package.json'),'utf8')).version,'4.0.0')
  const isolatedEnvironment=isolatedCliEnvironment(m) // No fallback, creation or writes.
  // No inherited cloud/provider credentials or dotenv inputs. Fresh AF-1D secrets
  // must already be in process memory. Do not supply operational credentials.
  const env={...isolatedEnvironment,NODE_ENV:'test',DATABASE_URL:state.environment.DATABASE_URL,REDIS_URL:state.environment.REDIS_URL,
    DOGRUADRES_TEST_API_URL:m.apiUrl,DOGRUADRES_AF1_AUTHORIZATION_FILE:state.environment.DOGRUADRES_AF1_AUTHORIZATION_FILE,
    DOGRUADRES_AF1_USERS:JSON.stringify(credentials),PGAPPNAME:m.apiApplicationName,MEDUSA_WORKER_MODE:'server'}
  for(const key of ['JWT_SECRET','COOKIE_SECRET','DOGRUADRES_INVITATION_SECRET']) {
    assert.ok(Buffer.byteLength(process.env[key]??'')>=32,`Fresh test-only ${key} required`);env[key]=process.env[key]
  }
  for(const key of ['STORE_CORS','ADMIN_CORS','VENDOR_CORS','AUTH_CORS'])env[key]=m.apiUrl
  env.FILE_BACKEND_URL=m.apiUrl+'/static'
  try {
    active(cap)
    // AF-1C-R3 SAFE STOP: telemetry Store catches configstore errors and substitutes
    // InMemoryConfigStore with telemetry.enabled=true (Medusa 2.21.2). That can
    // re-enable createFlush's detached child even with the supported env control.
    // No verified pre-callback process/network containment exists in this two-file
    // contract. Never accept a manifest boolean as proof or patch upstream modules.
    // The environment contract above is retained for independent review, but the
    // CLI must not launch until a separately authorized correction closes this gap.
    throw safeFailure('CLI_LAUNCH_BLOCKED_TELEMETRY_FALLBACK_CONTAINMENT_UNPROVEN')
  }catch(error){
    if(error?.message==='CLI_LAUNCH_BLOCKED_TELEMETRY_FALLBACK_CONTAINMENT_UNPROVEN')throw error
    taint(state);throw safeFailure('ISOLATED_CLI_FAILED_RECONCILE_PARTIAL_SYNTHETIC_FIXTURES_BEFORE_RETRY')
  }
  finally {env.DOGRUADRES_AF1_USERS='';for(const key of ['JWT_SECRET','COOKIE_SECRET','DOGRUADRES_INVITATION_SECRET'])env[key]=''}
}

/** Marker sequences are deliberately nontransactional: an HTTP 500 alone never
 * proves the target SQL was reached. pid/tx markers survive the injected rollback.
 * All DDL names are random task-owned names; no broad cleanup and no migrations.
 * predicate is test-owned SQL, NEVER derived from an HTTP request or manifest.
 */
export async function sqlProbe(db,{table,event='INSERT',predicate,fail=true,hit=1,gate,onInventory}) {
  const {cap}=connection(db)
  assert.ok(tables.has(table)); assert.ok(['INSERT','UPDATE'].includes(event)); assert.ok(Number.isInteger(hit)&&hit>0)
  const name=`af1_${randomBytes(10).toString('hex')}`
  const ownership=`AF-1D:${cap.runId}:${name}`
  const q=identifier; const objects=[`${name}_n`,`${name}_pid`,`${name}_tx`,`${name}_raised`]
  const inventory=Object.freeze({name,table,objects:Object.freeze([...objects]),ownership})
  assert.equal(typeof onInventory,'function','Evidence inventory sink required before any SQL fixture creation')
  onInventory(inventory)
  const cleanup=async()=>{
    connection(db)
    const checks=[
      [`SELECT obj_description(oid,'pg_trigger') AS owner FROM pg_trigger WHERE tgname=$1 AND tgrelid=$2::regclass`,[name,table]],
      [`SELECT obj_description(oid,'pg_proc') AS owner FROM pg_proc WHERE oid=to_regprocedure($1)`,[`${name}()`]],
      ...objects.map(object=>[`SELECT obj_description(oid,'pg_class') AS owner FROM pg_class WHERE oid=to_regclass($1)`,[object]]),
    ]
    for(const [sql,args]of checks) {
      const result=await db.query(sql,args)
      assert.ok(result.rows.every(row=>row.owner===ownership),'SQL object ownership mismatch; STOP cleanup')
    }
    const steps=[()=>db.query(`DROP TRIGGER IF EXISTS ${q(name)} ON ${q(table)}`),()=>db.query(`DROP FUNCTION IF EXISTS ${q(name)}()`),...objects.map(object=>()=>db.query(`DROP SEQUENCE IF EXISTS ${q(object)}`))]
    await preserveFailure(async()=>{},steps)
  }
  try {
    for (const object of objects) {
      await db.query(`CREATE SEQUENCE ${q(object)}`)
      await db.query(`COMMENT ON SEQUENCE ${q(object)} IS ${literal(ownership)}`)
    }
    await db.query(`CREATE FUNCTION ${q(name)}() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN IF (${predicate}) THEN
        PERFORM setval('${objects[1]}',pg_backend_pid()); PERFORM setval('${objects[2]}',txid_current());
        IF nextval('${objects[0]}') >= ${hit} THEN
          ${gate ? `PERFORM pg_advisory_xact_lock(${BigInt(gate).toString()});` : ''}
          ${fail ? `BEGIN
            RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='${name}';
          EXCEPTION WHEN SQLSTATE 'PZ001' THEN
            PERFORM nextval('${objects[3]}'); RAISE;
          END;` : ''}
        END IF;
      END IF; RETURN NEW; END $body$`)
    await db.query(`COMMENT ON FUNCTION ${q(name)}() IS ${literal(ownership)}`)
    await db.query(`CREATE TRIGGER ${q(name)} BEFORE ${event} ON ${q(table)} FOR EACH ROW EXECUTE FUNCTION ${q(name)}()`)
    await db.query(`COMMENT ON TRIGGER ${q(name)} ON ${q(table)} IS ${literal(ownership)}`)
    const probe=Object.freeze({cleanup, inventory, async evidence(){
      connection(db)
      const rows=[]
      for(const object of objects) rows.push((await db.query(`SELECT last_value::text, is_called FROM ${q(object)}`)).rows[0])
      return {reached:rows[0].is_called,hits:rows[0].is_called?Number(rows[0].last_value):0,pid:rows[1].is_called?Number(rows[1].last_value):null,txid:rows[2].is_called?rows[2].last_value:null,raised:rows[3].is_called,raises:rows[3].is_called?Number(rows[3].last_value):0}
    }})
    probes.set(probe,{db,hit,fail})
    return probe
  } catch(error) { await preserveFailure(async()=>{throw error},[cleanup]) }
}
export async function waitForBlocked(db, probe, gatePid) {
  const record=probeRecord(probe)
  assert.equal(record.db,db,'Barrier observer/probe mismatch')
  const until=Date.now()+4000
  while(Date.now()<until) {
    const e=await probe.evidence()
    if(e.reached) {
      const r=await db.query('select $1::int = ANY(pg_blocking_pids($2::int)) as blocked',[gatePid,e.pid])
      if(r.rows[0].blocked) return e
    }
    await new Promise(resolve=>setTimeout(resolve,25))
  }
  throw new Error('INCONCLUSIVE: expected SQL lock wait was not independently observed')
}

// Medusa `exec` fixture entrypoint; uses real framework workflows/auth registration.
// It revalidates the full isolated target rather than weakening historical G1 fixtures.
export default async function provisionIsolatedUsers({container}) {
  const m=authorizeRuntime()
  active(m)
  const config=container.resolve('configModule')
  assert.ok(config.projectConfig.databaseUrl===process.env.DATABASE_URL,'CLI database config mismatch; values withheld')
  assert.ok(config.projectConfig.redisUrl===process.env.REDIS_URL,'CLI Redis config mismatch; values withheld')
  const db=await observer(m); await db.end()
  const credentials=JSON.parse(process.env.DOGRUADRES_AF1_USERS??'[]')
  assert.equal(credentials.length,4)
  assert.ok(credentials.every(c=>c.email.startsWith(`af1-${m.runId}-`)&&c.email.endsWith('@example.invalid')&&typeof c.password==='string'&&c.password.length>=43))
  const {Modules}=await import('@medusajs/framework/utils')
  const auth=container.resolve(Modules.AUTH), workflows=container.resolve(Modules.WORKFLOW_ENGINE)
  for(const {email,password} of credentials) {
    active(m)
    const {result:users}=await workflows.run('create-users-workflow',{input:{users:[{email}]}})
    const r=await auth.register('emailpass',{body:{email,password}})
    assert.ok(r.success&&r.authIdentity,'Synthetic authentication registration failed')
    await auth.updateAuthIdentities({id:r.authIdentity.id,app_metadata:{user_id:users[0].id}})
  }
}
