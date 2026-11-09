/**
 * Customer password recovery through actual native Medusa HTTP, real Next.js,
 * headless Chrome and the already-running isolated PostgreSQL/TLS SMTP harness.
 * All identities, credentials and listeners are disposable.
 */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { dirname, join } from "node:path"
import { ApiLoader, expressLoader } from "@medusajs/framework/http"
import type { IAuthModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateJwtToken, getResolvedPlugins, Modules } from "@medusajs/framework/utils"
import { getFreePort, until, verifyNativeBrowser } from "./native-verification-browser"
import { verificationBoundarySnapshot } from "./native-verification-http"

const express = require(require.resolve("express", { paths: [require.resolve("@medusajs/medusa/package.json")] }))

export async function verifyNativePasswordResetHttp(container: MedusaContainer, params: {
  recipient: string
  originalPassword: string
  messages: string[]
  smtpRcptTo: string[]
}): Promise<void> {
  const db = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid")
  assert.ok(process.env.CI === "true" && process.env.NODE_ENV === "test" &&
    process.env.PG_MFA_TEST_SENTINEL === "mfa-pg16-disposable-ci-v1" &&
    db.hostname === "127.0.0.1" && db.port === "5432" && db.username === "mfa_test" &&
    db.password === "ci-disposable-only-not-a-real-secret" &&
    /^\/mfa_cli_ci_[a-f0-9]{16}$/.test(db.pathname) &&
    process.env.PG_MFA_NATIVE_TEST_DATABASE === db.pathname.slice(1),
    "REFUSED: exact disposable customer-reset PostgreSQL database required")

  const { recipient, originalPassword, messages, smtpRcptTo } = params
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const auth: IAuthModuleService = container.resolve(Modules.AUTH)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const domainSnapshot = JSON.stringify(await verificationBoundarySnapshot(pg))
  const identitiesBefore = Number((await pg("auth_identity").count("*").first())!.count)
  const validPassword = async (password: string) =>
    (await auth.authenticate("emailpass", { body: { email: recipient, password } })).success === true

  assert.ok(await validPassword(originalPassword), "Original disposable password must authenticate before reset")
  const app = express()
  const server = createServer(app)
  const storefrontPort = await getFreePort()
  const storefrontOrigin = "http://127.0.0.1:" + storefrontPort
  let shutdown: (() => Promise<void>) | undefined
  try {
    app.use((req: any, _res: any, next: any) => {
      req.scope = container.createScope()
      req.requestId = "synthetic-customer-password-reset"
      next()
    })
    shutdown = (await expressLoader({ app, container })).shutdown
    config.projectConfig.http.authCors = [config.projectConfig.http.authCors, storefrontOrigin].filter(Boolean).join(",")
    const plugins = await getResolvedPlugins(process.cwd(), config, true)
    const sourceDir = [
      join(dirname(require.resolve("@medusajs/medusa/package.json")), "dist/api"),
      ...plugins.map(plugin => join(plugin.resolve, "api")),
    ]
    assert.ok(sourceDir.includes(join(process.cwd(), "src/api")), "DoğruAdres native API paths must be loaded")
    await new ApiLoader({
      app, sourceDir, container,
      baseRestrictedFields: config.projectConfig.http.restrictedFields?.store,
      storeRelationsLimit: config.projectConfig.http.storeRelationsLimit,
    }).load()
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address !== "string" && address.address === "127.0.0.1", "Native auth HTTP listener must use loopback")
    const origin = "http://127.0.0.1:" + address.port
    const update = (bearer: string, password: string) => fetch(origin + "/auth/customer/emailpass/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + bearer },
      body: JSON.stringify({ password }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    })
    const newPassword = "NewA9!" + randomBytes(24).toString("base64url")
    const denied = await update("invalid.synthetic.reset", newPassword)
    assert.equal(denied.status, 401, "Malformed reset bearer must fail on real HTTP")
    assert.ok(!await validPassword(newPassword) && await validPassword(originalPassword), "Invalid token changed password")
    process.stdout.write("PASS password reset HTTP invalid: native Medusa rejects bad bearer without credential change\n")

    const beforeMessages = messages.length
    const beforeRcpt = smtpRcptTo.length
    const request = await fetch(origin + "/auth/customer/emailpass/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: recipient }),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    })
    assert.equal(request.status, 201, "Real customer password reset request must return 201")
    assert.ok(!request.headers.has("set-cookie"), "Anonymous reset request must not create session")
    await until(async () => messages.length === beforeMessages + 1, 15000, "real HTTP reset email")
    assert.deepEqual(smtpRcptTo.slice(beforeRcpt), ["<" + recipient + ">"], "HTTP reset email had an unexpected SMTP envelope recipient")

    // Unfold quoted-printable MIME soft breaks without printing the bearer.
    const mime = messages[beforeMessages].replace(/=\r?\n/g, "").replace(/=3D/gi, "=")
    const link = mime.match(/https:\/\/shop\.example\.invalid\/reset-password\?token=([A-Za-z0-9._~-]+)/)
    assert.ok(link, "Real HTTP-triggered email must contain the reset bearer URL")
    const token = link[1]
    await verifyNativeBrowser({
      apiOrigin: origin, storefrontPort, token, recipient,
      identityId: "", initialRow: null, pg, logs: [],
      passwordReset: { token, newPassword },
    })
    assert.ok(await validPassword(newPassword), "Chrome success state did not persist the new native password")
    assert.ok(!await validPassword(originalPassword), "Old password remained valid after Chrome success")
    process.stdout.write("PASS password reset HTTP success: request, delivered link, Chrome form, real Medusa update, durable credential change\n")

    const replay = await update(token, "ReplayA9!" + randomBytes(20).toString("hex"))
    assert.equal(replay.status, 401, "Consumed reset bearer must fail native HTTP replay")
    assert.ok(await validPassword(newPassword), "Replay changed the password")
    process.stdout.write("PASS password reset HTTP replay: consumed bearer rejected with committed password unchanged\n")

    const expiredRow = await auth.createPasswordResetToken({
      provider: "emailpass", entity_id: recipient, ttl_seconds: -60,
    })
    assert.ok(new Date(expiredRow.expires_at).getTime() < Date.now(), "Synthetic expiry row must actually be expired")
    const expiredBearer = generateJwtToken({
      entity_id: recipient, provider: "emailpass", actor_type: "customer", purpose: "reset",
    }, {
      secret: config.projectConfig.http.jwtSecret,
      expiresIn: "900s",
      jwtOptions: { jwtid: expiredRow.jti },
    })
    const expired = await update(expiredBearer, "ExpiredA9!" + randomBytes(20).toString("hex"))
    assert.equal(expired.status, 401, "Signed but expired native token row must be rejected")
    assert.ok(await validPassword(newPassword), "Expired bearer changed the password")
    assert.equal(Number((await pg("auth_identity").count("*").first())!.count), identitiesBefore, "Password recovery created extra identity records")
    assert.equal(JSON.stringify(await verificationBoundarySnapshot(pg)), domainSnapshot, "Password recovery changed unrelated domain records")
    process.stdout.write("PASS password reset HTTP expiry: expired signed token refused; password and domain persisted safely\n")
  } finally {
    server.closeAllConnections()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    await shutdown?.()
  }
}
