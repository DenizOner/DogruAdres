/** #241/6414213572: only the SMTP harness's one native identity, in its guarded CI DB. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { dirname, join } from "node:path"
import { ApiLoader, expressLoader } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, getResolvedPlugins } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { verifyNativeBrowser } from "./native-verification-browser"

// Reuse Medusa's installed Express dependency; do not add a project dependency.
const express = require(require.resolve("express", { paths: [require.resolve("@medusajs/medusa/package.json")] }))

export async function verificationBoundarySnapshot(pg: any) {
  // All existing domain rows, not merely counts: no Person/Org/grant/audit mutation.
  const tables = await pg("information_schema.tables").where({ table_schema: "public", table_type: "BASE TABLE" }).where("table_name", "like", "da\\_%").orderBy("table_name")
  const snapshot: Record<string, string> = {}
  for (const { table_name } of tables) {
    const rows = (await pg(table_name).select("*")).map((row: any) => JSON.stringify(row)).sort()
    snapshot[table_name] = createHash("sha256").update(JSON.stringify(rows)).digest("hex")
  }
  return snapshot
}

export async function verifyNativeHttp(container: MedusaContainer, message: string, recipient: string, identityId: string) {
  const target = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid")
  assert.ok(process.env.CI === "true" && process.env.NODE_ENV === "test" &&
    process.env.PG_MFA_TEST_SENTINEL === "mfa-pg16-disposable-ci-v1" &&
    target.hostname === "127.0.0.1" && target.port === "5432" && target.username === "mfa_test" &&
    target.password === "ci-disposable-only-not-a-real-secret" && /^\/mfa_cli_ci_[a-f0-9]{16}$/.test(target.pathname) &&
    process.env.PG_MFA_NATIVE_TEST_DATABASE === target.pathname.slice(1), "REFUSED: exact disposable verification CI database required")
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const url = message.match(/https:\/\/shop\.example\.invalid\/auth\/verify-email\?token=([^\s"<>]+)/)
  assert.ok(url, "Native SMTP message must contain its verification link")
  const token = decodeURIComponent(url[1])
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const owned = () => pg("auth_verification").where({ auth_identity_id: identityId, entity_id: recipient }).whereRaw("provider_metadata->>'token_hash' = ?", [tokenHash])
  const initial = await owned().first()
  assert.ok(initial && !initial.verified_at && initial.provider_metadata.token_hash === tokenHash &&
    !JSON.stringify(initial).includes(token), "Native PostgreSQL record must store a hash, not the delivered bearer token")
  const protectedBefore = await verificationBoundarySnapshot(pg)
  const authBefore = JSON.stringify(await pg("auth_identity").orderBy("id"))
  const providersBefore = JSON.stringify(await pg("provider_identity").orderBy("id"))
  const notificationsBefore = JSON.stringify(await pg("notification").orderBy("id"))
  const verificationCount = Number((await pg("auth_verification").count("*").first())!.count)
  const logger = container.resolve("logger")
  const originals = new Map<string, any>()
  const logs: string[] = []
  for (const level of ["info", "warn", "error", "http", "debug"]) {
    originals.set(level, logger[level])
    logger[level] = (...args: unknown[]) => { logs.push(args.map(arg => arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ")) }
  }
  const app = express()
  const server = createServer(app)
  let shutdown: (() => Promise<void>) | undefined
  try {
    // Same framework entrypoint primitives and source directories used by Medusa's
    // real API loader. No handler imports, fake request/response or bypass middleware.
    app.use((req: any, res: any, next: any) => {
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept")
      if (req.method === "OPTIONS") {
        res.status(204).end()
        return
      }
      req.scope = container.createScope()
      req.requestId = "synthetic-verification"
      next()
    })
    shutdown = (await expressLoader({ app, container })).shutdown
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    const plugins = await getResolvedPlugins(process.cwd(), config, true)
    const sourceDir = [join(dirname(require.resolve("@medusajs/medusa/package.json")), "dist/api"), ...plugins.map(plugin => join(plugin.resolve, "api"))]
    assert.ok(sourceDir.includes(join(process.cwd(), "src/api")), "Project API middleware must be part of native route discovery")
    await new ApiLoader({ app, sourceDir, container, baseRestrictedFields: config.projectConfig.http.restrictedFields?.store, storeRelationsLimit: config.projectConfig.http.storeRelationsLimit }).load()
    // OS chooses an unoccupied loopback-only port; no existing listener is reused.
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
    const address = server.address()
    assert.ok(address && typeof address !== "string" && address.address === "127.0.0.1", "Native HTTP listener must be isolated loopback")
    const origin = `http://127.0.0.1:${address.port}`
    let requests = 0
    async function request(method: string, value: string, expectedCode: number, expectedStatus: string) {
      const response = await fetch(origin + "/auth/verify-email" + (method === "GET" ? "?token=" + encodeURIComponent(value) : ""), {
        method, headers: method === "POST" ? { "Content-Type": "application/json" } : {},
        body: method === "POST" ? JSON.stringify({ token: value }) : undefined, redirect: "error", signal: AbortSignal.timeout(10000),
      })
      const body = await response.text()
      assert.ok(response.status === expectedCode && JSON.parse(body).status === expectedStatus, "Native HTTP verification status mismatch")
      assert.ok(response.headers.get("referrer-policy") === "no-referrer" && /no-store/.test(response.headers.get("cache-control") || ""), "Real HTTP privacy/cache headers missing")
      assert.ok(!response.headers.has("location") && [token, tokenHash, recipient, identityId, initial.id].every(secret => !body.includes(secret)), "Private verification data leaked into HTTP response")
      assert.ok(!response.headers.has("set-cookie"), "Anonymous verification must not create a login session")
      requests++
    }
    const unchanged = async (before: any) => assert.ok(JSON.stringify(await owned().first()) === JSON.stringify(before), "Read/denied HTTP request unexpectedly mutated verification")
    await request("GET", token, 200, "pending")
    await request("GET", token, 200, "pending")
    await unchanged(initial)
    process.stdout.write("PASS verification HTTP GET: real Medusa route/middleware, pending twice, hash-only storage, no row mutation, no-store/no-referrer and minimized body\n")
    const invalid = "invalid-" + createHash("sha256").update(token).digest("hex")
    await request("GET", invalid, 404, "invalid")
    await request("POST", invalid, 409, "consumed")
    await unchanged(initial)
    // Only this task-owned row's clock is prepared. No global clock or protected fixture changes.
    await owned().update({ requested_at: new Date(Date.now() - 16 * 60 * 1000) })
    const expired = await owned().first()
    await request("GET", token, 200, "expired")
    await request("POST", token, 410, "expired")
    await unchanged(expired)
    await owned().update({ requested_at: initial.requested_at })
    await request("GET", token, 200, "pending")
    await unchanged(initial)
    process.stdout.write("PASS verification HTTP negatives: invalid GET/POST and prepared expired GET/POST rejected without confirmation or unintended writes\n")

    // Real Chrome -> Next.js Storefront -> native Medusa verification -> PostgreSQL acceptance.
    // Token is still pending; real Chrome performs the explicit single-use confirmation click.
    await verifyNativeBrowser({
      apiOrigin: origin,
      token,
      recipient,
      identityId,
      initialRow: initial,
      pg,
      logs,
    })

    // Chrome click consumed the token; verify committed state in PostgreSQL.
    const confirmed = await owned().first()
    assert.ok(confirmed.verified_at && Number.isFinite(new Date(confirmed.verified_at).getTime()), "Native POST must durably persist verified_at")
    // A separate SQL connection observes committed state, outside the Auth module's manager/cache.
    await pg.transaction(async (trx: any) => {
      const row = await trx("auth_verification").where({ id: initial.id }).first()
      assert.ok(row.verified_at && new Date(row.verified_at).getTime() === new Date(confirmed.verified_at).getTime(), "Independent SQL transaction must observe committed verification")
    })
    await request("GET", token, 200, "consumed")
    await request("POST", token, 409, "consumed")
    await unchanged(confirmed)
    assert.ok(requests === 9, "Expected native HTTP acceptance request count")
    assert.ok(Number((await pg("auth_verification").count("*").first())!.count) === verificationCount, "HTTP inspection/confirmation must not create extra verification records")
    assert.ok(JSON.stringify(await pg("auth_identity").orderBy("id")) === authBefore && JSON.stringify(await pg("provider_identity").orderBy("id")) === providersBefore, "HTTP verification changed identities/provider mappings")
    assert.ok(JSON.stringify(await pg("notification").orderBy("id")) === notificationsBefore, "HTTP inspection/confirmation sent another notification")
    assert.ok(JSON.stringify(await verificationBoundarySnapshot(pg)) === JSON.stringify(protectedBefore), "HTTP verification mutated domain identities/organizations/memberships/grants/audit")
    assert.ok([token, tokenHash, recipient, identityId, initial.id].every(secret => logs.every(line => !line.includes(secret))), "Private verification data entered native test logs")
    process.stdout.write("PASS verification HTTP POST: explicit confirmation, committed PostgreSQL verified_at readback, consumed GET and replay rejection, stable identity/domain/notification snapshots\n")
    process.stdout.write("PASS verification HTTP privacy: nine real requests, no bearer/recipient/internal IDs in response or test logs; NODE_ENV=test HTTP logger disabled by framework\n")
  } finally {
    server.closeAllConnections()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    await shutdown?.()
    for (const [level, original] of originals) logger[level] = original
  }
}
