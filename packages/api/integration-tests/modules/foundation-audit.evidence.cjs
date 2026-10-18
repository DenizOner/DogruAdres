/** NOT TESTED. Explicit launcher only; excluded from normal Jest/Node discovery.
 * Module service evidence does NOT prove authenticated route authorization.
 * Runner lifecycle can ensure/create the DB, apply migrations, and DROP public
 * schema CASCADE after the single test. Future permission must cover all of it.
 * No HTTP/Redis/CLI, synthetic credentials, or production changes are needed.
 */
const assert=require('node:assert/strict')
const {execFileSync}=require('node:child_process')
const {resolve}=require('node:path')
const {randomBytes}=require('node:crypto')
const {createRequire}=require('node:module')
// This synchronous child guard completes BEFORE test-utils or domain TS imports.
assert.equal(process.env.AF1_MODULE_LAUNCH,'explicit-guarded-launch','Use explicit guarded launcher')
assert.equal(process.env.NODE_ENV,'test')
const api=resolve(__dirname,'../..'), guard=resolve(api,'integration-tests/helpers/foundation-module-runtime.mjs')
let provenance
try { provenance=JSON.parse(execFileSync(process.execPath,[guard,'--verify-only'],{cwd:api,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000})) }
catch { throw new Error('AF1_MODULE_CHILD_PREFLIGHT_FAILED; no runner initialized') }
console.log(JSON.stringify({classification:'MODULE_SOURCE_AND_TARGET_PROVENANCE',...provenance}))
const url=new URL(process.env.DATABASE_URL)
for(const [key,value] of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:url.port,DB_USERNAME:decodeURIComponent(url.username),DB_PASSWORD:decodeURIComponent(url.password),DB_TEMP_NAME:provenance.database})) assert.equal(process.env[key],value,'Pinned DB environment required; values withheld')
const requireFromApi=createRequire(resolve(api,'package.json'))
const {moduleIntegrationTestRunner}=requireFromApi('@medusajs/test-utils')
const {Client}=requireFromApi('pg')
const moduleRoot=resolve(api,'src/modules/dogruadres-access')
const models=require(resolve(moduleRoot,'models/index.ts'))
moduleIntegrationTestRunner({
  moduleName:'dogruadresAccess',resolve:moduleRoot,cwd:api,dbName:provenance.database,schema:'public',moduleModels:Object.values(models),
  pathToMigrations:resolve(moduleRoot,'migrations'),moduleDependencies:[],
  testSuite:({service})=>{
    it('proves migration guards separately from real service commit and targeted rollback',async()=>{
      const db=new Client({connectionString:process.env.DATABASE_URL,application_name:`af1d1_${provenance.runId}_observer`,connectionTimeoutMillis:5000,query_timeout:10000})
      let primary
      try {
        await db.connect()
        const identity=(await db.query('select current_database() as name,(select oid::int from pg_database where datname=current_database()) as oid,system_identifier::text as system from pg_control_system()')).rows[0]
        assert.equal(identity.name,provenance.database); assert.equal(identity.oid,provenance.databaseOid); assert.equal(identity.system,provenance.systemIdentifier)
        const rows=async(sql,args=[]) => (await db.query(sql,args)).rows
        const tables=['da_person','da_actor_mapping','da_organization','da_organization_membership','da_organization_invitation','da_audit_event','da_audit_outbox']
        const snapshot=async()=>{const s={};for(const table of tables)s[table]=await rows(`select * from ${table} order by id`);return s}
        const triggers=await rows("select tgname from pg_trigger where tgrelid='da_audit_event'::regclass and not tgisinternal order by tgname")
        assert.deepEqual(triggers.map(x=>x.tgname),['da_audit_event_append_only_rows','da_audit_event_append_only_truncate'],'Actual project audit-protection migration required')
        // One test/one fresh schema: avoid schema-refresh fallback between tests.
        const actors=[0,1].map(i=>({actor_type:'user',actor_id:`af1d1_${provenance.runId}_owner_${i}`}))
        const provision=()=>service.provisionOrganization({name:`AF1D1-${provenance.runId}-${randomBytes(5).toString('hex')}`,provisioned_by:actors[0],initial_owners:actors})
        const pairs=async()=>{
          const audit=await rows('select * from da_audit_event order by id'),outbox=await rows('select * from da_audit_outbox order by id')
          assert.equal(audit.length,outbox.length)
          for(const a of audit){const matches=outbox.filter(o=>o.source_module==='dogruadres-access'&&o.source_audit_event_id===a.id);assert.equal(matches.length,1);assert.equal(matches[0].envelope.source_audit_event_id,a.id);assert.equal(matches[0].status,'pending')}
          return {audit,outbox}
        }
        await provision(); const committed=await pairs(); assert.equal(committed.audit.length,3)
        assert.deepEqual(committed.audit.map(x=>x.action).sort(),['organization.owner_assigned','organization.owner_assigned','organization.provisioned'])
        console.log('SERVICE_COMMIT_CARDINALITY: observed 3 canonical / 3 outbox via independent connection')
        // Direct SQL evidence is distinct from generated service transaction proof.
        for(const statement of ["update da_audit_event set action='tampered'","update da_audit_event set deleted_at=now()",'delete from da_audit_event','truncate da_audit_outbox,da_audit_event']){
          const before=await snapshot()
          await db.query(`DO $check$ BEGIN BEGIN ${statement}; RAISE EXCEPTION USING ERRCODE='PZ099',MESSAGE='missing guard'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END; END $check$`)
          assert.deepEqual(await snapshot(),before)
        }
        const beforeDuplicate=await snapshot()
        await db.query("DO $check$ BEGIN BEGIN insert into da_audit_outbox(id,source_audit_event_id,source_module,envelope_version,envelope,status) select 'af1d1_duplicate',source_audit_event_id,source_module,envelope_version,envelope,status from da_audit_outbox limit 1; RAISE EXCEPTION USING ERRCODE='PZ099',MESSAGE='missing uniqueness'; EXCEPTION WHEN unique_violation THEN NULL; END; END $check$")
        assert.deepEqual(await snapshot(),beforeDuplicate)
        console.log('DIRECT_SQL_GUARDS: UPDATE/DELETE/soft-delete/TRUNCATE and source uniqueness observed')
        // Task-owned trigger fixtures record real backend PID and transaction ID.
        // Sequence updates survive rollback; an unrelated rejection cannot pass.
        for(const failTable of ['none','da_audit_event','da_audit_outbox']){
          const suffix=randomBytes(5).toString('hex'), prefix=`af1d1_${provenance.runId}_${suffix}`
          const owner=`AF-1D1:${provenance.runId}:${suffix}`, objects=[]
          const before=await snapshot(); let operationError
          try {
            for(const [table,index] of [['da_organization',0],['da_audit_event',1],['da_audit_outbox',2]]){
              const name=`${prefix}_${index}`, seq=[name+'_hits',name+'_pid',name+'_tx',name+'_raised']
              objects.push({name,table,seq})
              console.log(JSON.stringify({classification:'TASK_PROBE_INVENTORY',name,table,sequences:seq,ownership:owner}))
              for(const s of seq){await db.query(`create sequence "${s}"`);await db.query(`comment on sequence "${s}" is '${owner}'`)}
              // Provisioning and first Owner audits are staged when the second Owner audit
              // fails; all three audits are staged before the second outbox fails.
              const target=table===failTable?(table==='da_audit_event'?3:2):0
              await db.query(`create function "${name}"() returns trigger language plpgsql as $probe$ BEGIN
                PERFORM setval('${seq[1]}',pg_backend_pid()); PERFORM setval('${seq[2]}',txid_current());
                IF nextval('${seq[0]}')=${target} THEN BEGIN RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='AF1D1 targeted insert';
                  EXCEPTION WHEN SQLSTATE 'PZ001' THEN PERFORM nextval('${seq[3]}'); RAISE; END; END IF; RETURN NEW; END $probe$`)
              await db.query(`comment on function "${name}"() is '${owner}'`)
              await db.query(`create trigger "${name}" before insert on "${table}" for each row execute function "${name}"()`)
              await db.query(`comment on trigger "${name}" on "${table}" is '${owner}'`)
            }
            let failure
            try { await provision() } catch { failure=true }
            const evidence=[]
            for(const object of objects){const markers=[];for(const s of object.seq)markers.push((await rows(`select last_value::text,is_called from "${s}"`))[0]);evidence.push({table:object.table,hits:markers[0].is_called?Number(markers[0].last_value):0,pid:markers[1].is_called?markers[1].last_value:null,tx:markers[2].is_called?markers[2].last_value:null,raised:markers[3].is_called?Number(markers[3].last_value):0})}
            const reached=evidence.filter(e=>e.hits>0)
            assert.equal(new Set(reached.map(e=>e.pid)).size,1);assert.equal(new Set(reached.map(e=>e.tx)).size,1)
            assert.equal(reached.length,failTable==='da_audit_event'?2:3)
            if(failTable==='none'){assert.equal(failure,undefined);assert.deepEqual(evidence.map(e=>e.hits),[1,3,3]);await pairs()}
            else {assert.equal(failure,true);assert.equal(evidence.find(e=>e.table===failTable).raised,1);assert.equal(evidence.find(e=>e.table===failTable).hits,failTable==='da_audit_event'?3:2);assert.deepEqual(await snapshot(),before)}
            console.log(JSON.stringify({classification:failTable==='none'?'PHYSICAL_COMMIT_OBSERVED':'TARGETED_ROLLBACK_OBSERVED',failTable,evidence}))
          } catch(error){operationError=error}
          finally {
            // Never broad cleanup. Partial CREATE without COMMENT => retain and
            // fail; operator reconciliation is required. Medusa afterEach still drops
            // the owned schema, even on failure; preserve stdout evidence first.
            try {
              for(const o of objects){
                const comments=await rows("select obj_description(to_regprocedure($1),'pg_proc') as owner union all select obj_description(oid,'pg_trigger') from pg_trigger where tgrelid=$2::regclass and tgname=$3",[`${o.name}()`,o.table,o.name])
                assert.equal(comments.length,2);assert(comments.every(x=>x.owner===owner))
                for(const s of o.seq){const result=await rows("select obj_description(to_regclass($1),'pg_class') as owner",[s]);assert.equal(result[0].owner,owner)}
                await db.query(`drop trigger "${o.name}" on "${o.table}"`);await db.query(`drop function "${o.name}"()`)
                for(const s of o.seq)await db.query(`drop sequence "${s}"`)
              }
            } catch { throw new AggregateError(operationError?[operationError]:[],'INCONCLUSIVE: exact probe cleanup unconfirmed; retain disposable runtime') }
          }
          if(operationError)throw operationError
        }
      } catch(error){primary=error}
      finally { try { await db.end() } catch { primary=new AggregateError(primary?[primary]:[],'INCONCLUSIVE: observer close unconfirmed') } }
      if(primary)throw primary
    })
  },
})
