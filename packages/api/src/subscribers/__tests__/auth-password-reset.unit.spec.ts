import subscriber, { CustomerPasswordResetPayload } from "../auth-password-reset"
import { AuthWorkflowEvents, Modules } from "@medusajs/framework/utils"

const payload: CustomerPasswordResetPayload = {
  actor_type: "customer",
  entity_id: "recipient@example.invalid",
  token: "synthetic.encoded.token",
}
function setup() {
  const logger = { info: jest.fn(), error: jest.fn() }
  const notifications = { createNotifications: jest.fn().mockResolvedValue({ id: "noti_synthetic" }) }
  const container = { resolve: jest.fn((key: string) => key === Modules.NOTIFICATION ? notifications : logger) }
  const args: any = { event: { name: AuthWorkflowEvents.PASSWORD_RESET, data: payload }, container, pluginOptions: {} }
  return { args, logger, notifications }
}

describe("customer password-reset notification boundary", () => {
  it("dispatches a customer reset exactly once through the installed native email channel", async () => {
    const { args, notifications, logger } = setup()
    await subscriber(args)
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
    expect(notifications.createNotifications.mock.calls[0][0]).toEqual({
      to: payload.entity_id, channel: "email", template: "customer-password-reset",
      data: { token: payload.token },
    })
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/recipient|synthetic\.encoded/)
  })

  it("ignores staff actors, missing tokens and missing recipients without dispatch", async () => {
    for (const data of [
      { ...payload, actor_type: "user" },
      { ...payload, actor_type: "member" },
      { ...payload, token: undefined },
      { ...payload, entity_id: undefined },
      { ...payload, actor_type: undefined },
    ]) {
      const { args, notifications } = setup()
      await subscriber({ ...args, event: { ...args.event, data } })
      expect(notifications.createNotifications).not.toHaveBeenCalled()
    }
  })

  it("does not leak downstream recipient, reset token or SMTP errors", async () => {
    const { args, notifications, logger } = setup()
    notifications.createNotifications.mockRejectedValue(
      new Error("recipient@example.invalid synthetic.encoded.token synthetic-private-smtp-reply")
    )
    await expect(subscriber(args)).rejects.toThrow("Password reset notification dispatch failed")
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/recipient|synthetic\.encoded|synthetic-private/)
  })
})
