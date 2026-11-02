import { resolveVerificationOrigin, renderVerificationEmail } from "../verification-email"
import { SmtpNotificationProviderService } from "../index"
import { sendSmtpEmail } from "../../dogruadres-access/smtp-client"
jest.mock("../../dogruadres-access/smtp-client", () => ({ sendSmtpEmail: jest.fn() }))
const send = sendSmtpEmail as jest.Mock
const original = process.env
beforeEach(() => { process.env = { ...original }; delete process.env.STOREFRONT_URL; delete process.env.PUBLIC_ORIGIN; delete process.env.MEDUSA_STOREFRONT_URL; send.mockReset() })
afterAll(() => { process.env = original })
describe("verification storefront origin", () => {
  it.each(["STOREFRONT_URL", "PUBLIC_ORIGIN", "MEDUSA_STOREFRONT_URL"])("uses supported %s with exact HTTPS origin in production", key => {
    expect(resolveVerificationOrigin({ NODE_ENV: "production", [key]: "https://shop.example.invalid" })).toBe("https://shop.example.invalid")
  })
  it("honors precedence and rejects invalid first configured value rather than falling back", () => {
    expect(resolveVerificationOrigin({ STOREFRONT_URL: "https://first.example.invalid", PUBLIC_ORIGIN: "https://second.example.invalid" })).toBe("https://first.example.invalid")
    expect(() => resolveVerificationOrigin({ STOREFRONT_URL: "invalid", PUBLIC_ORIGIN: "https://second.example.invalid" })).toThrow("Verification storefront origin is missing or invalid")
  })
  it.each([undefined, "", "http://localhost:8000", "https://localhost", "http://shop.example.invalid", "ftp://shop.example.invalid", "https://user:secret@shop.example.invalid", "https://shop.example.invalid/", "https://shop.example.invalid/path", "https://shop.example.invalid?token=private", "https://shop.example.invalid#secret", " https://shop.example.invalid", "not-an-origin"])("rejects absent or unsafe production origin %#", value => {
    expect(() => resolveVerificationOrigin({ NODE_ENV: "production", STOREFRONT_URL: value })).toThrow("Verification storefront origin is missing or invalid")
  })
  it.each(["http://localhost:8000", "http://127.0.0.1:8000", "http://[::1]:8000"])("permits explicitly configured local test/development origin %s", value => {
    for (const mode of ["test", "development"]) expect(resolveVerificationOrigin({ NODE_ENV: mode, STOREFRONT_URL: value })).toBe(value)
  })
  it("does not permit non-loopback plaintext or implicit development fallback", () => {
    expect(() => resolveVerificationOrigin({ NODE_ENV: "development" })).toThrow()
    expect(() => resolveVerificationOrigin({ NODE_ENV: "test", STOREFRONT_URL: "http://localhost.attacker.invalid" })).toThrow()
  })
  it("preserves Turkish template, recipient escaping, URL encoding and expiry", () => {
    process.env.STOREFRONT_URL = "https://shop.example.invalid"
    const code = "synthetic/?&'<>"
    const message = renderVerificationEmail({ entity_id: '<tag>&"\'@example.invalid', code, expires_at: new Date(Date.now()+3600000) })
    expect(message.subject).toBe("DoğruAdres E-posta Doğrulama")
    expect(message.html).toContain("&lt;tag&gt;&amp;&quot;&#039;")
    expect(message.html).not.toContain("<tag>")
    expect(message.text).toContain("https://shop.example.invalid/auth/verify-email?token="+encodeURIComponent(code))
    expect(message.html).toContain("tek kullanımlıktır")
  })
  it("rejects before settings/transport on invalid production config with no private errors", async () => {
    process.env.NODE_ENV = "production"
    process.env.STOREFRONT_URL = "https://user:private@invalid.example/path"
    const access = { getActiveSmtpConfig: jest.fn() }
    const provider = new SmtpNotificationProviderService({ dogruadresAccess: access } as any)
    await expect(provider.send({ to: "recipient@example.invalid", channel: "email", template: "email-verification", data: { code: "synthetic-private-token" } })).rejects.toEqual(new Error("SMTP notification dispatch failed"))
    expect(access.getActiveSmtpConfig).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
