/** Called by the EXISTING CLI CI harness on its ALREADY migrated disposable DB.
 * No provisioning, migrations, default workflows, cleanup, protected target or Windows grants here.
 */
import assert from "node:assert/strict"
import {Client} from "@medusajs/framework/pg"
import {mkdtemp} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {initializeFixtureModules} from "../../src/scripts/native-fixture-runtime"
import {createTwoNativeFixtures} from "../../src/scripts/task-mfa-bootstrap"
import {DurableCheckpointManager,FilesystemDurableCheckpointAdapter} from "../../src/scripts/operator-audit-protocol"
async function main(){
  const u=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  if(process.env.CI!=="true"||process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1"||
    !/^mfa_cli_ci_[a-f0-9]{16}$/.test(process.env.PG_MFA_NATIVE_TEST_DATABASE??"")||
    u.pathname!=="/"+process.env.PG_MFA_NATIVE_TEST_DATABASE||u.hostname!=="127.0.0.1"||u.username!=="mfa_test")
    throw Error("REFUSED: native fixture CI requires the existing disposable CLI test database")
  const control=new Client({connectionString:u.toString()});await control.connect()
  let native:Awaited<ReturnType<typeof initializeFixtureModules>>|undefined
  try{
    native=await initializeFixtureModules(control)
    const proof=native.initializationProof as any
    assert.equal(proof.before,proof.after);assert.equal(proof.readOnlyEnforced,true)
    await native.assertNoForeignConsumers()
    // Application-name spoofing cannot commission a foreign backend.
    const foreign=new Client({connectionString:u.toString(),application_name:"r0d-native-spoof"});await foreign.connect()
    try{await assert.rejects(native.assertNoForeignConsumers(),/Foreign PostgreSQL/)}finally{await foreign.end()}
    await native.assertNoForeignConsumers()
    const dir=await mkdtemp(path.join(os.tmpdir(),"r0d-ci-")),cp=path.join(dir,"checkpoint.json")
    const manager=new DurableCheckpointManager(new FilesystemDurableCheckpointAdapter()),state=await manager.initializeCheckpoint(cp,u.pathname.slice(1))
    let attempts=0
    const fixtures=await createTwoNativeFixtures(control,native.container,manager,cp,state,()=>native!.assertNoForeignConsumers(),()=>{attempts++})
    assert.equal(fixtures.length,2);assert.equal(attempts,2)
    await manager.markCompleted(cp,state)
    const independent=new Client({connectionString:u.toString()});await independent.connect()
    try{
      const rows=(await independent.query(`SELECT u.id AS uid,a.id AS aid,p.id AS pid
      FROM public.user u JOIN auth_identity a ON a.app_metadata->>'user_id'=u.id
      JOIN da_actor_mapping m ON m.actor_type='user' AND m.actor_id=u.id
      JOIN da_person p ON p.id=m.person_id JOIN da_login_binding b ON b.person_id=p.id
        AND b.auth_identity_id=a.id AND b.actor_type='user' AND b.actor_id=u.id`)).rows
      assert.equal(rows.length,2)
      for(const key of ['uid','aid','pid'])assert.equal(new Set(rows.map(r=>r[key])).size,2)
      assert.equal((await independent.query('SELECT count(*)::int n FROM auth_mfa_factor')).rows[0].n,0)
      assert.equal((await independent.query('SELECT count(*)::int n FROM auth_mfa_recovery_code')).rows[0].n,0)
    }finally{await independent.end()}
    console.log("PASS R0-D native entry: read-only initialization unchanged full DB digest; genuine pool provenance; foreign consumer denied; 2 native complete relationships; zero MFA")
  }finally{await native?.close();await control.end()}
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exit(1)})