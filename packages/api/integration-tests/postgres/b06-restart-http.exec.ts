/**
 * #366 test-only fresh native Medusa HTTP worker. Never use outside the
 * signed, isolated B06 GitHub-hosted workflow_dispatch acceptance runner.
 * Starts no database, migration, scheduler, extra runner or external service.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:https'
import {readFileSync,realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Client} from '@medusajs/framework/pg'
import type {ExecArgs} from '@medusajs/framework/types'
import {createPersonalHttpApp} from '../../src/scripts/personal-http-runtime'

export default async function({container}:ExecArgs){
 const u=new URL(process.env.DATABASE_URL??'postgres://invalid/invalid')
 const dir=process.env.B06_RESTART_TLS_DIR??''
 const port=Number(process.env.B06_RESTART_PORT)
 assert.ok(
  process.env.CI==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
  process.env.B06_UI_DISPATCH_SCOPE==='b06-ui'&&process.env.PG_MFA_TEST_SCOPE==='b06-ui'&&
  process.env.PG_MFA_TEST_SENTINEL==='mfa-pg16-disposable-ci-v1'&&
  process.env.B06_RESTART_SENTINEL==='b06-test-only-native-http-worker-v1'&&
  u.protocol==='postgres:'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&
  u.username==='mfa_test'&&u.password==='ci-disposable-only-not-a-real-secret'&&
  /^\/mfa_cli_ci_[a-f0-9]{16}$/.test(u.pathname)&&
  process.env.PG_MFA_NATIVE_TEST_DATABASE===u.pathname.slice(1)&&
  Number.isInteger(port)&&port>=1024&&port<=65535&&
  dir.startsWith(join(tmpdir(),'b06-tls-'))&&realpathSync(dir)===dir,
  'REFUSED: B06 restart worker requires its exact disposable CI boundary'
 )
 // The worker must see the already-activated disposable database; never
 // recreate, migrate or toggle the protected MFA activation latch.
 const pg=new Client({connectionString:u.toString()})
 await pg.connect()
 try{
  const r=await pg.query("select current_database() as db,(select mfa_activated from da_session_policy where id='current') as activated")
  assert.ok(r.rows.length===1&&r.rows[0].db===u.pathname.slice(1)&&r.rows[0].activated===true,
   'REFUSED: missing signed task-only MFA database activation')
 }finally{await pg.end()}
 const stop=new Promise<void>(resolve=>process.once('SIGTERM',()=>resolve()))
 const app=await createPersonalHttpApp(container)
 const server=createServer({
  key:readFileSync(join(dir,'key.pem')),cert:readFileSync(join(dir,'ca.pem'))
 },app.app)
 let listening=false
 try{
  await new Promise<void>((resolve,reject)=>{
   server.once('error',reject)
   server.listen(port,'127.0.0.1',()=>{server.off('error',reject);listening=true;resolve()})
  })
  // Sole stdout readiness signal; no cookie, URL, OTP, seed or Person data.
  process.stdout.write('B06_RESTART_HTTP_READY\n')
  await stop
 }finally{
  if(listening)await new Promise<void>((resolve,reject)=>{
   server.close(error=>error?reject(error):resolve())
   server.closeAllConnections()
  })
  await app.close()
 }
 // The task-owned HTTP process must actually exit between restart phases.
 process.exit(0)
}
