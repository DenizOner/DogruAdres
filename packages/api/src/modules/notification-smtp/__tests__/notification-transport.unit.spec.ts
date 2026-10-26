import net from "node:net"
import { SmtpNotificationProviderService } from "../index"
import subscriber from "../../../subscribers/auth-verification-requested"

// Real loopback protocol transport, not a mocked sendSmtpEmail. The production
// transport permits plaintext only for NODE_ENV=test + literal loopback.
describe("SMTP provider controlled transport", () => {
  const originalOrigin = process.env.STOREFRONT_URL
  afterAll(() => { if (originalOrigin === undefined) delete process.env.STOREFRONT_URL; else process.env.STOREFRONT_URL = originalOrigin })
  let server: net.Server
  let config: any
  let mode: string
  let messages: string[]
  let attempts: number
  const sockets = new Set<net.Socket>()
  const input = { to: "recipient@example.invalid", channel: "email", template: "synthetic-test", data: { subject: "Doğrulama", text: "synthetic text", html: "<p>safe</p>" } }
  beforeEach(async () => {
    process.env.STOREFRONT_URL = "http://localhost:8000"
    messages = []; attempts = 0; mode = "success"
    server = net.createServer(socket => {
      attempts++
      sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {})
      socket.write("220 synthetic.smtp\r\n")
      let buffer = "", body = "", inData = false, auth = 0
      socket.on("data", chunk => {
        buffer += chunk.toString()
        let end: number
        while ((end = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 2)
          if (inData) {
            if (line === ".") { messages.push(body); inData = false; socket.write("250 accepted\r\n") }
            else body += line + "\r\n"
          } else if (line.startsWith("EHLO")) {
            if (mode === "network") { socket.destroy(); return }
            socket.write("250-synthetic.smtp\r\n250 AUTH LOGIN\r\n")
          } else if (line === "AUTH LOGIN") { auth = 1; socket.write("334 user\r\n") }
          else if (auth === 1) { auth = 2; socket.write("334 password\r\n") }
          else if (auth === 2) { auth = 0; socket.write(mode === "auth" ? "535 private-reply\r\n" : "235 authenticated\r\n") }
          else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) socket.write("250 OK\r\n")
          else if (line === "DATA") { inData = true; socket.write("354 continue\r\n") }
          else if (line === "QUIT") socket.end("221 bye\r\n")
        }
      })
    })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    config = { enabled: true, host: "127.0.0.1", port: (server.address() as net.AddressInfo).port, security: "none", username: "synthetic-user", password: "synthetic-secret", from_email: "first@example.invalid" }
  })
  afterEach(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())) })
  function provider() { return new SmtpNotificationProviderService({ dogruadresAccess: { getActiveSmtpConfig: async () => config } } as any) }
  it("sends one message per native subscriber dispatch and uses subsequent runtime settings", async () => {
    const instance = provider()
    const createNotifications = jest.fn(async (notification: any) => instance.send(notification))
    const logger = { info: jest.fn(), error: jest.fn() }
    const container = { resolve: (key: string) => key === "notification" ? { createNotifications } : logger } as any
    const args = { container, pluginOptions: {}, event: { name: "auth.verification_requested", data: { entity_type: "email", entity_id: input.to, code_provider: "token", auth_identity_id: "synthetic", code: "test/?&token" } } }
    await subscriber(args)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("first@example.invalid")
    expect(messages[0]).toContain("/auth/verify-email?token=test%2F%3F%26token")
    expect(messages[0]).toContain("DoğruAdres")
    config = { ...config, from_email: "second@example.invalid" }
    await subscriber(args)
    expect(messages).toHaveLength(2)
    expect(messages[1]).toContain("second@example.invalid")
    expect(attempts).toBe(2)
  })
  it.each(["auth", "network", "tls", "disabled"])("rejects %s without delivery or false success", async failure => {
    mode = failure
    if (failure === "tls") config.security = "tls" // server does not advertise STARTTLS
    if (failure === "disabled") config.enabled = false
    await expect(provider().send(input)).rejects.toEqual(new Error("SMTP notification dispatch failed"))
    expect(messages).toHaveLength(0)
    expect(attempts).toBe(failure === "disabled" ? 0 : 1)
  })
})
