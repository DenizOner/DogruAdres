import subscriber from "../auth-verification-requested"
import passwordResetSubscriber, { type CustomerPasswordResetPayload } from "../auth-password-reset"
import { AuthWorkflowEvents, Modules } from "@medusajs/framework/utils"

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
    expect(sent).toMatchObject({ to: payload.entity_id, channel: "email", template: "email-verification", data: { code: payload.code } })
    expect(sent.data).not.toHaveProperty("html")
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

// Existing CI-selected suite also covers customer reset negatives.
const resetPayload: CustomerPasswordResetPayload = {
  actor_type: "customer",
  entity_id: "recipient@example.invalid",
  token: "synthetic.encoded.token",
}
function setupReset() {
  const logger = { info: jest.fn(), error: jest.fn() }
  const notifications = { createNotifications: jest.fn().mockResolvedValue({ id: "noti_synthetic" }) }
  const container = { resolve: jest.fn((key: string) => key === Modules.NOTIFICATION ? notifications : logger) }
  const args: any = { event: { name: AuthWorkflowEvents.PASSWORD_RESET, data: resetPayload }, container, pluginOptions: {} }
  return { args, logger, notifications }
}

describe("customer password-reset notification boundary", () => {
  it("dispatches a customer reset exactly once through the installed native email channel", async () => {
    const { args, notifications, logger } = setupReset()
    await passwordResetSubscriber(args)
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
    expect(notifications.createNotifications.mock.calls[0][0]).toEqual({
      to: resetPayload.entity_id, channel: "email", template: "customer-password-reset",
      data: { token: resetPayload.token },
    })
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/recipient|synthetic\.encoded/)
  })

  it("ignores staff actors, missing tokens and missing recipients without dispatch", async () => {
    for (const data of [
      { ...resetPayload, actor_type: "user" },
      { ...resetPayload, actor_type: "member" },
      { ...resetPayload, token: undefined },
      { ...resetPayload, entity_id: undefined },
      { ...resetPayload, actor_type: undefined },
    ]) {
      const { args, notifications } = setupReset()
      await passwordResetSubscriber({ ...args, event: { ...args.event, data } })
      expect(notifications.createNotifications).not.toHaveBeenCalled()
    }
  })

  it("does not leak downstream recipient, reset token or SMTP errors", async () => {
    const { args, notifications, logger } = setupReset()
    notifications.createNotifications.mockRejectedValue(
      new Error("recipient@example.invalid synthetic.encoded.token synthetic-private-smtp-reply")
    )
    await expect(passwordResetSubscriber(args)).rejects.toThrow("Password reset notification dispatch failed")
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/recipient|synthetic\.encoded|synthetic-private/)
  })
})
