import subscriber from "../auth-verification-requested"
import { Modules } from "@medusajs/framework/utils"

const payload = { entity_id: "recipient@example.invalid", entity_type: "email", code_provider: "token", auth_identity_id: "synthetic-auth", code: "synthetic-token/?&\"'<>" }
function setup() {
  const logger = { info: jest.fn(), error: jest.fn() }
  const notifications = { createNotifications: jest.fn().mockResolvedValue({ id: "noti_test", status: "success" }) }
  const container = { resolve: jest.fn((key: string) => key === Modules.NOTIFICATION ? notifications : logger) }
  return { logger, notifications, args: { event: { name: "auth.verification_requested", data: payload }, container: container as any, pluginOptions: {} } }
}
describe("native verification notification dispatch", () => {
  it("ignores incomplete and non-email events", async () => {
    for (const data of [{ ...payload, entity_type: "phone" }, { ...payload, code: undefined }]) {
      const { args, notifications } = setup()
      await subscriber({ ...args, event: { ...args.event, data } })
      expect(notifications.createNotifications).not.toHaveBeenCalled()
    }
  })
  it("dispatches exactly once via the native email channel and preserves the Turkish template", async () => {
    const { args, notifications } = setup()
    await subscriber(args)
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
    const sent = notifications.createNotifications.mock.calls[0][0]
    expect(sent).toMatchObject({ to: payload.entity_id, channel: "email", template: "email-verification", data: { subject: "DoğruAdres E-posta Doğrulama" } })
    expect(sent.data.text).toContain(`/auth/verify-email?token=${encodeURIComponent(payload.code)}`)
    expect(sent.data.html).toContain("tek kullanımlıktır")
    expect(sent.data.html).not.toContain(payload.code)
  })
  it("escapes recipient and operator-controlled URL in HTML", async () => {
    const original = process.env.STOREFRONT_URL
    try {
      process.env.STOREFRONT_URL = 'https://example.invalid/\"<tag>&'
      const { args, notifications } = setup()
      await subscriber({ ...args, event: { ...args.event, data: { ...payload, entity_id: '<tag>&\"\'@example.invalid' } } })
      const html = notifications.createNotifications.mock.calls[0][0].data.html
      expect(html).toContain("&lt;tag&gt;&amp;&quot;&#039;")
      expect(html).not.toContain('<tag>')
      expect(html).not.toContain('href="https://example.invalid/\"')
    } finally {
      if (original === undefined) delete process.env.STOREFRONT_URL
      else process.env.STOREFRONT_URL = original
    }
  })
  it("rejects notification errors without leaking downstream messages into errors or logs", async () => {
    const { args, notifications, logger } = setup()
    notifications.createNotifications.mockRejectedValue(new Error(`${payload.entity_id} ${payload.code} private-password`))
    await expect(subscriber(args)).rejects.toThrow("Verification email dispatch failed")
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/recipient|synthetic-token|private-password/)
  })
})
