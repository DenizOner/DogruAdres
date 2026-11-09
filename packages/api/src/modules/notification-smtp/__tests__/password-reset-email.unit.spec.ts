import { renderCustomerPasswordResetEmail } from "../password-reset-email"
import { SmtpNotificationProviderService } from "../index"
import { sendSmtpEmail } from "../../dogruadres-access/smtp-client"

jest.mock("../../dogruadres-access/smtp-client", () => ({ sendSmtpEmail: jest.fn() }))
const send = sendSmtpEmail as jest.Mock
const original = process.env
beforeEach(() => {
  process.env = { ...original, NODE_ENV: "production", STOREFRONT_URL: "https://shop.example.invalid" }
  delete process.env.PUBLIC_ORIGIN
  delete process.env.MEDUSA_STOREFRONT_URL
  send.mockReset().mockResolvedValue({ messageId: "smtp_synthetic" })
})
afterAll(() => { process.env = original })

const token = "eyJhbGciOiJIUzI1NiJ9.eyJwdXJwb3NlIjoicmVzZXQifQ.signature"

describe("customer password reset message", () => {
  it("uses a trusted exact HTTPS origin and preserves the native token only in the mail body", () => {
    const msg = renderCustomerPasswordResetEmail({ token })
    const link = new URL(msg.text.split("\n").find(line => line.startsWith("https://"))!)
    expect(link.origin).toBe("https://shop.example.invalid")
    expect(link.pathname).toBe("/reset-password")
    expect(link.searchParams.get("token")).toBe(token)
    expect(msg.subject).toBe("DoğruAdres Parola Sıfırlama")
    expect(msg.text).toContain("15 dakika")
    expect(msg.html).toContain("href=")
    expect(msg.html).not.toContain("<script")
  })
  it("rejects invalid tokens, unsafe origin and credential-bearing URLs", () => {
    for (const invalid of [undefined, "", "tiny", "anything\r\nInjected: yes", "<script>alert(1)</script>", "x".repeat(4097)]) {
      expect(() => renderCustomerPasswordResetEmail({ token: invalid })).toThrow()
    }
    for (const origin of ["http://shop.example.invalid", "https://localhost:3000",
      "https://u:p@shop.example.invalid", "https://shop.example.invalid/path"]) {
      process.env.STOREFRONT_URL = origin
      expect(() => renderCustomerPasswordResetEmail({ token })).toThrow()
    }
  })
  it("dispatches through native SMTP without exposing a token in returned or thrown errors", async () => {
    const access = { getActiveSmtpConfig: jest.fn().mockResolvedValue({
      enabled: true, host: "smtp.example.invalid", port: 465, security: "ssl",
      username: null, password: null, from_email: "noreply@example.invalid",
    }) }
    const provider = new SmtpNotificationProviderService({ dogruadresAccess: access } as any)
    const response = await provider.send({
      to: "recipient@example.invalid", channel: "email", template: "customer-password-reset",
      data: { token },
    })
    expect(response).toEqual({ id: "smtp_synthetic" })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].text).toContain("/reset-password?token=")
    expect(JSON.stringify(response)).not.toContain(token)
    process.env.STOREFRONT_URL = "https://u:private@invalid.example.invalid"
    access.getActiveSmtpConfig.mockClear()
    send.mockClear()
    await expect(provider.send({
      to: "recipient@example.invalid", channel: "email", template: "customer-password-reset",
      data: { token },
    })).rejects.toEqual(new Error("SMTP notification dispatch failed"))
    expect(access.getActiveSmtpConfig).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
