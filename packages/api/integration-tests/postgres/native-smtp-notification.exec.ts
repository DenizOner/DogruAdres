/** Issue #241: real Medusa exec boot + loaded subscriber + native Notification + TLS SMTP.
 * Runs only in the existing random disposable CI database. No public ingress change.
 */
import type { ExecArgs, IAuthModuleService, INotificationModuleService } from "@medusajs/framework/types"
import { AuthWorkflowEvents, ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { requestVerificationWorkflow } from "@medusajs/core-flows"
import { readFileSync } from "node:fs"
import { createServer, TLSSocket } from "node:tls"
import { randomBytes } from "node:crypto"
import assert from "node:assert/strict"
import subscriber from "../../src/subscribers/auth-verification-requested"
import { encryptSmtpPassword } from "../../src/modules/dogruadres-access/smtp-crypto"
import type DogruAdresAccessModuleService from "../../src/modules/dogruadres-access/service"

export default async function({ container }: ExecArgs) {
  const target = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid")
  if (process.env.CI !== "true" || process.env.PG_MFA_TEST_SENTINEL !== "mfa-pg16-disposable-ci-v1" ||
      target.hostname !== "127.0.0.1" || target.port !== "5432" || target.username !== "mfa_test" ||
      target.password !== "ci-disposable-only-not-a-real-secret" || !/^\/mfa_cli_ci_[a-f0-9]{16}$/.test(target.pathname) ||
      process.env.PG_MFA_NATIVE_TEST_DATABASE !== target.pathname.slice(1) || process.env.NODE_ENV !== "test" ||
      process.env.DOGRUADRES_IDENTITY_ENABLED !== "true" || !process.env.SMTP_TEST_CERT || !process.env.SMTP_TEST_KEY ||
      process.env.NODE_EXTRA_CA_CERTS !== process.env.SMTP_TEST_CERT) throw Error("REFUSED: isolated SMTP CI environment required")
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const notifications: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
  const bus = container.resolve(Modules.EVENT_BUS)
  const access = container.resolve<DogruAdresAccessModuleService>("dogruadresAccess")
  const logger = container.resolve("logger")
  const providers = await pg("notification_provider").where({ is_enabled: true }).select("id", "channels")
  const emailProviders = providers.filter((p: any) => p.channels.includes("email"))
  assert.ok(emailProviders.length === 1 && emailProviders[0].id === "notification-smtp", "Exactly one SMTP email provider must be loaded")
  process.stdout.write("PASS SMTP native boot: Medusa module/provider registration, exactly one email provider\n")

  process.env.STOREFRONT_URL = "https://shop.example.invalid"
  let mode = "success"
  const messages: string[] = []
  const sockets = new Set<TLSSocket>()
  const server = createServer({ key: readFileSync(process.env.SMTP_TEST_KEY), cert: readFileSync(process.env.SMTP_TEST_CERT) }, socket => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => {})
    socket.write("220 synthetic.smtp ESMTP\r\n")
    let buffer = "", body = "", inData = false, authStage = 0
    socket.on("data", chunk => {
      buffer += chunk.toString()
      let end: number
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        if (inData) {
          if (line === ".") { messages.push(body); body = ""; inData = false; socket.write("250 2.0.0 accepted\r\n") }
          else body += line + "\r\n"
        } else if (line.startsWith("EHLO")) {
          if (mode === "network") { socket.destroy(); return }
          socket.write("250-synthetic.smtp\r\n250 AUTH LOGIN\r\n")
        } else if (line === "AUTH LOGIN") { authStage = 1; socket.write("334 VXNlcm5hbWU6\r\n") }
        else if (authStage === 1) { authStage = 2; socket.write("334 UGFzc3dvcmQ6\r\n") }
        else if (authStage === 2) { authStage = 0; socket.write(mode === "auth" ? "535 synthetic-private-transport-detail\r\n" : "235 authenticated\r\n") }
        else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) socket.write("250 OK\r\n")
        else if (line === "DATA") { inData = true; socket.write("354 continue\r\n") }
        else if (line === "QUIT") { socket.end("221 bye\r\n") }
        else socket.write("500 invalid command\r\n")
      }
    })
  })
  server.on("tlsClientError", () => {})
  const priorError = logger.error
  const logged: string[] = []
  logger.error = (...args: unknown[]) => { logged.push(args.map(a => a instanceof Error ? a.message : String(a)).join(" ")) }
  const secret = randomBytes(32).toString("hex")
  process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = randomBytes(32).toString("hex")
  const recipient = "smtp-native-" + randomBytes(8).toString("hex") + "@example.invalid"
  const code = "synthetic-" + randomBytes(16).toString("hex")
  const payload = { entity_id: recipient, entity_type: "email", code_provider: "token", auth_identity_id: "synthetic", code }
  const dispatch = () => subscriber({ event: { name: AuthWorkflowEvents.VERIFICATION_REQUESTED, data: payload }, container, pluginOptions: {} })
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  async function until(check: () => Promise<boolean>) {
    const end = Date.now() + 10000
    while (Date.now() < end) { if (await check()) return; await pause(25) }
    throw Error("Native SMTP event did not reach its expected terminal state")
  }
  try {
    assert.ok(!(await pg("da_platform_smtp_settings").first()), "Disposable SMTP settings must start empty")
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    const port = (server.address() as { port: number }).port
    // TEST FIXTURE ONLY: loopback is accepted only by NODE_ENV=test transport.
    // This direct disposable row does not bypass/alter the operator route policy.
    await pg("da_platform_smtp_settings").insert({ id: "current", enabled: true, host: "127.0.0.1", port, security: "ssl", username: "synthetic", password_encrypted: encryptSmtpPassword(secret), from_email: "first@example.invalid", from_name: "Synthetic SMTP", version: 1 })
    const runtime = await access.getActiveSmtpConfig()
    assert.ok(runtime.password === secret && runtime.port === port, "Runtime settings must decrypt in native Access module")
    const auth: IAuthModuleService = container.resolve(Modules.AUTH)
    const registration = await auth.register("emailpass", { body: { email: recipient, password: randomBytes(32).toString("base64url") } })
    assert.ok(registration.success && registration.authIdentity?.id, "Synthetic native identity registration failed")
    await requestVerificationWorkflow(container).run({ input: { auth_identity_id: registration.authIdentity!.id, entity_id: recipient, entity_type: "email", code_provider: "token" } })
    await until(async () => (await pg("notification").where({ to: recipient, status: "success" })).length === 1)
    assert.ok(Number(messages.length) === 1, "Native event must produce exactly one SMTP message")
    assert.ok(messages[0].includes("first@example.invalid") && messages[0].includes("/auth/verify-email?token=") && messages[0].includes("tek kullanımlıktır"), "Verification message content/URL mismatch")
    const delivered = await pg("notification").where({ to: recipient, status: "success" }).first()
    assert.ok(delivered.provider_id === "notification-smtp" && delivered.external_id, "Native result must retain SMTP message id")
    process.stdout.write("PASS SMTP native event: requestVerificationWorkflow -> loaded subscriber -> Notification -> TLS SMTP; one message and persisted success/external_id\n")

    await pg("da_platform_smtp_settings").where({ id: "current" }).update({ from_email: "second@example.invalid", version: 2 })
    await dispatch()
    assert.ok(Number(messages.length) === 2 && messages[1].includes("second@example.invalid"), "Next send must use changed settings without restart")
    assert.ok(messages[1].includes(encodeURIComponent(code)), "Synthetic verification code must be URL encoded")
    process.stdout.write("PASS SMTP native runtime: persisted settings change affects next send without restart\n")

    for (const failure of ["auth", "network", "disabled", "provider"]) {
      mode = failure
      if (failure === "disabled") await pg("da_platform_smtp_settings").where({ id: "current" }).update({ enabled: false })
      if (failure === "provider") await pg("da_platform_smtp_settings").where({ id: "current" }).update({ enabled: true, password_encrypted: "invalid-test-ciphertext" })
      const before = messages.length
      const previousFailures = Number((await pg("notification").where({ to: recipient, status: "failure" }).count("*").first())!.count)
      await assert.rejects(dispatch(), { message: "Verification email dispatch failed" })
      const failures = Number((await pg("notification").where({ to: recipient, status: "failure" }).count("*").first())!.count)
      assert.ok(Number(messages.length) === before && failures === previousFailures + 1, "Failed send must persist failure without delivery/false success")
    }
    process.stdout.write("PASS SMTP native failures: authentication, network, disabled and credential/provider errors persist failure and reject with safe messages\n")

    await pg("da_platform_smtp_settings").where({ id: "current" }).update({ enabled: true, password_encrypted: encryptSmtpPassword(secret) })
    mode = "success"
    server.setSecureContext({ key: readFileSync(process.env.SMTP_TEST_UNTRUSTED_KEY!), cert: readFileSync(process.env.SMTP_TEST_UNTRUSTED_CERT!) })
    const beforeTls = messages.length
    await assert.rejects(dispatch(), { message: "Verification email dispatch failed" })
    assert.ok(Number(messages.length) === beforeTls, "Untrusted TLS certificate must prevent delivery")
    assert.ok((await pg("notification").where({ to: recipient, status: "failure" })).length === 5, "TLS failure must be persisted")
    server.setSecureContext({ key: readFileSync(process.env.SMTP_TEST_KEY!), cert: readFileSync(process.env.SMTP_TEST_CERT!) })
    process.stdout.write("PASS SMTP native TLS: untrusted certificate rejected with verification enabled and persisted failure\n")

    mode = "auth"
    const beforeCount = Number((await pg("notification").where({ to: recipient }).count("*").first())!.count)
    await bus.emit({ name: AuthWorkflowEvents.VERIFICATION_REQUESTED, data: payload })
    await until(async () => Number((await pg("notification").where({ to: recipient }).count("*").first())!.count) === beforeCount + 1 && logged.some(x => x.includes("Verification email dispatch failed")))
    await pause(300)
    assert.ok(Number((await pg("notification").where({ to: recipient }).count("*").first())!.count) === beforeCount + 1, "Unexpected automatic local retry")
    // Real local bus contains/logs the subscriber rejection; emit is not delivery acknowledgement.
    process.stdout.write("PASS SMTP native local-event failure: subscriber rejection logged safely; no retry observed in bounded window (no durable retry guarantee)\n")

    mode = "success"
    const beforeReplay = messages.length
    await dispatch(); await dispatch()
    assert.ok(Number(messages.length) === beforeReplay + 2, "Each independent dispatch must send exactly once")
    process.stdout.write("OBSERVED SMTP duplicate semantics: repeated events are independent sends; no cross-event exactly-once guarantee\n")
    // New origin regression only: no transport call should be reached in production.
    const oldEnv = { NODE_ENV: process.env.NODE_ENV, STOREFRONT_URL: process.env.STOREFRONT_URL, PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN, MEDUSA_STOREFRONT_URL: process.env.MEDUSA_STOREFRONT_URL }
    try {
      process.env.NODE_ENV = "production"
      delete process.env.PUBLIC_ORIGIN; delete process.env.MEDUSA_STOREFRONT_URL
      for (const origin of [undefined, "http://localhost:8000", "https://shop.example.invalid/path", "https://user:private-origin-secret@shop.example.invalid"]) {
        if (origin === undefined) delete process.env.STOREFRONT_URL
        else process.env.STOREFRONT_URL = origin
        const previous = Number((await pg("notification").where({ to: recipient, status: "failure" }).count("*").first())!.count)
        const sent = messages.length
        await assert.rejects(dispatch(), { message: "Verification email dispatch failed" })
        const rows = await pg("notification").where({ to: recipient, status: "failure" })
        assert.ok(rows.length === previous + 1 && Number(messages.length) === sent && rows.every((row: any) => !row.external_id), "Invalid production origin must persist native failure without SMTP delivery")
      }
      assert.ok(logged.every(line => !line.includes("private-origin-secret")), "Origin credentials leaked into native logs")
      process.stdout.write("PASS SMTP verification origin: missing/insecure/non-origin/credential production config rejected before SMTP; native failure persisted and errors sanitized\n")
    } finally {
      for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    }
    const privateValues = [secret, recipient, code, "synthetic-private-transport-detail"]
    assert.ok(privateValues.every(value => logged.every(line => !line.includes(value))), "Private data found in native error logs")
    process.stdout.write("PASS SMTP native logs: no credential, recipient, verification code or transport reply leaked\n")
  } finally {
    logger.error = priorError
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
