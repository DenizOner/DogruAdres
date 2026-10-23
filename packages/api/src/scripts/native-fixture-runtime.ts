import { Client } from "@medusajs/framework/pg"
import { createHash, randomBytes } from "node:crypto"
import type { NativeFixtureRuntime } from "./task-mfa-bootstrap"
import { canonicalJsonStringify } from "./operator-audit-protocol"

export type OwnedBackend = { pid: number; started: string; connection: object }
/** Never trust application_name, user, or a PID supplied by configuration. */
export function assertSessionProvenance(rows: Array<{pid:number;started:string}>, owned: readonly OwnedBackend[]) {
  for (const row of rows) if (!owned.some(x => x.pid === row.pid && x.started === row.started && x.connection))
    throw new Error("REFUSED: Foreign PostgreSQL consumer (unowned backend identity)")
}
export async function databaseContentDigest(control: Client) {
  const tables = await control.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  const contents: Record<string, unknown> = {}
  for (const {tablename} of tables.rows) {
    const quoted = '"' + tablename.replace(/"/g, '""') + '"'
    contents[tablename] = (await control.query(`SELECT count(*)::text AS n, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text),'')) AS digest FROM public.${quoted} t`)).rows[0]
  }
  return createHash("sha256").update(canonicalJsonStringify(contents)).digest("hex")
}

/** Only called AFTER the real controller, exclusive nonce/checkpoint and clean DB checks.
 * No medusa exec / application loaders / defaults / subscribers / jobs / migrations.
 * Auth's provider loader only registers services. User/Foundation have no custom loaders.
 * All native ORM modules receive the SAME tracked Knex connection. Initialization is
 * enforced read-only in PostgreSQL, including newly created pool connections.
 */
export async function initializeFixtureModules(control: Client): Promise<NativeFixtureRuntime> {
  const { MedusaAppLoader, container } = await import("@medusajs/framework")
  const { configManager } = await import("@medusajs/framework/config")
  const { ModulesDefinition } = await import("@medusajs/framework/modules-sdk")
  const { ModulesSdkUtils, ContainerRegistrationKeys: K } = await import("@medusajs/framework/utils")
  const { asValue } = await import("@medusajs/framework/awilix")
  const owned: OwnedBackend[] = []
  let writable = false
  const connectionUrl = new URL(process.env.DATABASE_URL!)
  connectionUrl.searchParams.set("application_name", "r0d-native-" + randomBytes(12).toString("hex"))
  connectionUrl.searchParams.set("options", "-c default_transaction_read_only=on")
  const pool = ModulesSdkUtils.createPgConnection({
    clientUrl: connectionUrl.toString(), schema:"public",
    pool: {min:0,max:4,afterCreate: (connection:any, done:any) => {
      connection.query("SET default_transaction_read_only=" + (writable ? "off" : "on"), (error:any) => {
        if (error) return done(error,connection)
        connection.query("SELECT pg_backend_pid() AS pid, backend_start::text AS started FROM pg_stat_activity WHERE pid=pg_backend_pid()", (error:any,result:any) => {
          if (!error) owned.push({...result.rows[0],connection})
          done(error,connection)
        })
      })
    }} as any,
  })
  const assertNoForeignConsumers = async () => {
    const rows = (await control.query("SELECT pid,backend_start::text AS started FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")).rows
    // Only live connection objects in THIS pool, matched to server-observed backend_start.
    const resources = [...(pool.client.pool?.used ?? []), ...(pool.client.pool?.free ?? [])].map((x:any)=>x.resource)
    assertSessionProvenance(rows, owned.filter(x=>resources.includes(x.connection)))
  }
  let app: any
  try {
    // No DB ownership exclusions until an actual pool connection has been recorded.
    await assertNoForeignConsumers()
    const before = await databaseContentDigest(control)
    const modules: Record<string, any> = Object.fromEntries(Object.keys(ModulesDefinition).map(k=>[k,false]))
    Object.assign(modules,{
      event_bus: {resolve:"@medusajs/medusa/event-bus-local"},
      cache: {resolve:"@medusajs/medusa/cache-inmemory"},
      auth: {resolve:"@medusajs/medusa/auth",options:{providers:[{resolve:"@medusajs/medusa/auth-emailpass",id:"emailpass"}],mfa:{encryption_key:process.env.DOGRUADRES_MFA_ENCRYPTION_KEY,disable_policy:"challenge"}}},
      user: {resolve:"@medusajs/medusa/user"},
      dogruadresAccess: {resolve:"./src/modules/dogruadres-access"},
    })
    configManager.loadConfig({baseDir:process.cwd(),projectConfig:{projectConfig:{databaseUrl:connectionUrl.toString(),workerMode:"server",http:{jwtSecret:process.env.JWT_SECRET,cookieSecret:process.env.COOKIE_SECRET}},modules} as any})
    container.register({[K.PG_CONNECTION]:asValue(pool),[K.LOGGER]:asValue(console)})
    app = await new MedusaAppLoader({container,cwd:process.cwd()}).load()
    await assertNoForeignConsumers()
    const after = await databaseContentDigest(control)
    if (before !== after) throw new Error("INDETERMINATE: Native initialization changed database content")
    const connections = [...(pool.client.pool?.used ?? []),...(pool.client.pool?.free ?? [])].map((x:any)=>x.resource)
    for (const connection of connections) {
      const readOnly = await connection.query("SHOW default_transaction_read_only")
      if (readOnly.rows[0].default_transaction_read_only !== "on") throw new Error("REFUSED: Unprotected initialization connection")
    }
    // Only after read-only initialization AND unchanged whole-public-schema digest.
    writable = true
    for (const connection of connections) await connection.query("SET default_transaction_read_only=off")
    return {container,assertNoForeignConsumers,initializationProof:{before,after,readOnlyEnforced:true,modules:Object.keys(modules).filter(k=>modules[k]!==false)},
      close: async () => { try { await app?.onApplicationShutdown?.() } finally { await pool.destroy() } }}
  } catch(error) { await pool.destroy(); throw error }
}