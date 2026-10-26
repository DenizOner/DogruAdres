import definition, { SmtpNotificationProviderService } from "../index"
import { sendSmtpEmail } from "../../dogruadres-access/smtp-client"

jest.mock("../../dogruadres-access/smtp-client", () => ({ sendSmtpEmail: jest.fn() }))
const send = sendSmtpEmail as jest.Mock
const input = { to: "recipient@example.invalid", channel: "email", template: "email-verification", data: { subject: "Doğrulama", text: "synthetic body", html: "<p>safe</p>" } }
describe("SMTP notification provider", () => {
  beforeEach(() => { send.mockReset(); send.mockResolvedValue({ messageId: "smtp-synthetic", accepted: [input.to] }) })
  it("exports the supported Notification Module provider definition", () => {
    expect(definition).toMatchObject({ services: [SmtpNotificationProviderService] })
    expect(definition.module).toBe("notification")
  })
  it("reads settings from the injected cradle on each send and dispatches once", async () => {
    let config: any = { enabled: true, host: "smtp.example.invalid", port: 465, security: "ssl", from_email: "first@example.invalid", password: "synthetic-password" }
    const access = { getActiveSmtpConfig: jest.fn(async () => config) }
    const provider = new SmtpNotificationProviderService({ dogruadresAccess: access } as any)
    expect(await provider.send(input)).toEqual({ id: "smtp-synthetic" })
    expect(send).toHaveBeenCalledWith({ to: input.to, ...input.data }, expect.objectContaining({ fromEmail: config.from_email, password: config.password }))
    config = { ...config, from_email: "second@example.invalid", enabled: false }
    await provider.send(input)
    expect(send.mock.calls[1][1]).toMatchObject({ fromEmail: config.from_email, enabled: false })
    expect(access.getActiveSmtpConfig).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it.each(["authentication", "TLS", "network", "provider"])("propagates %s failure as a sanitized error", async failure => {
    send.mockRejectedValue(new Error(`${failure}: recipient@example.invalid private-password synthetic-token`))
    const provider = new SmtpNotificationProviderService({ dogruadresAccess: { getActiveSmtpConfig: async () => null } } as any)
    await expect(provider.send(input)).rejects.toEqual(new Error("SMTP notification dispatch failed"))
    expect(send).toHaveBeenCalledTimes(1)
  })
  it("fails closed on unavailable or undecryptable runtime settings without env fallback", async () => {
    const provider = new SmtpNotificationProviderService({ dogruadresAccess: { getActiveSmtpConfig: async () => { throw Error("private database/credential details") } } } as any)
    await expect(provider.send(input)).rejects.toThrow("SMTP notification dispatch failed")
    expect(send).not.toHaveBeenCalled()
  })
})
