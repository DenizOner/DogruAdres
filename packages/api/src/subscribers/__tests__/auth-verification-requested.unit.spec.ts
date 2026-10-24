import authVerificationRequestedSubscriber from "../auth-verification-requested"
import { sendSmtpEmail } from "../../modules/dogruadres-access/smtp-client"

jest.mock("../../modules/dogruadres-access/smtp-client", () => ({
  sendSmtpEmail: jest.fn(),
}))

describe("auth-verification-requested subscriber unit test", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("ignores events that are not of entity_type email", async () => {
    const container = {
      resolve: jest.fn().mockReturnValue(console),
    }

    await authVerificationRequestedSubscriber({
      event: {
        name: "auth.verification_requested",
        data: {
          entity_id: "phone-number",
          entity_type: "phone",
          code_provider: "token",
          auth_identity_id: "authid_1",
          code: "123456",
        },
      },
      container: container as any,
      pluginOptions: {},
    })

    expect(sendSmtpEmail).not.toHaveBeenCalled()
  })

  it("dispatches email when entity_type is email with valid code", async () => {
    ;(sendSmtpEmail as jest.Mock).mockResolvedValue({
      messageId: "mock-id-123",
      accepted: ["recipient@example.test"],
    })

    const container = {
      resolve: jest.fn().mockReturnValue(console),
    }

    await authVerificationRequestedSubscriber({
      event: {
        name: "auth.verification_requested",
        data: {
          entity_id: "recipient@example.test",
          entity_type: "email",
          code_provider: "token",
          auth_identity_id: "authid_test_gmail",
          code: "654321",
        },
      },
      container: container as any,
      pluginOptions: {},
    })

    expect(sendSmtpEmail).toHaveBeenCalledTimes(1)
    expect(sendSmtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.test",
        subject: "DoğruAdres E-posta Doğrulama",
        text: expect.stringContaining("654321"),
      })
    )
  })
  it("does not log recipient details or downstream SMTP error contents", async () => {
    const logger = { info: jest.fn(), error: jest.fn() }
    const container = {
      resolve: jest.fn().mockReturnValue(logger),
    }
    ;(sendSmtpEmail as jest.Mock).mockRejectedValue(
      new Error("SMTP error containing recipient@example.test and a credential")
    )

    await authVerificationRequestedSubscriber({
      event: {
        name: "auth.verification_requested",
        data: {
          entity_id: "recipient@example.test",
          entity_type: "email",
          code_provider: "token",
          auth_identity_id: "authid_synthetic",
          code: "test-only-token",
        },
      },
      container: container as any,
      pluginOptions: {},
    })

    expect(logger.error).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify([logger.info.mock.calls, logger.error.mock.calls])
    expect(logged).not.toContain("recipient@example.test")
    expect(logged).not.toContain("test-only-token")
    expect(logged).not.toContain("credential")
  })

  it("uses dynamic runtime SMTP config when access service provides it", async () => {
    ;(sendSmtpEmail as jest.Mock).mockResolvedValue({
      messageId: "mock-id-456",
      accepted: ["recipient@example.test"],
    })

    const mockAccess = {
      getActiveSmtpConfig: jest.fn().mockResolvedValue({
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        username: "apikey",
        password: "decrypted-pass",
        from_email: "notifications@dogruadres.com",
        from_name: "DogruAdres Platform",
      }),
    }

    const container = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === "dogruadresAccess") return mockAccess
        return console
      }),
    }

    await authVerificationRequestedSubscriber({
      event: {
        name: "auth.verification_requested",
        data: {
          entity_id: "recipient@example.test",
          entity_type: "email",
          code_provider: "token",
          auth_identity_id: "authid_test_gmail",
          code: "999888",
        },
      },
      container: container as any,
      pluginOptions: {},
    })

    expect(sendSmtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "recipient@example.test" }),
      expect.objectContaining({
        host: "smtp.sendgrid.net",
        fromEmail: "notifications@dogruadres.com",
        password: "decrypted-pass",
      })
    )
  })
});
