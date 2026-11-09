import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { AuthWorkflowEvents, Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/framework/types"

export type CustomerPasswordResetPayload = {
  entity_id?: string
  actor_type?: string
  token?: string
}

/**
 * Native Medusa reset tokens are created only by the Auth workflow.
 * Notify customers through the installed Notification/SMTP provider.
 * Never email staff/admin tokens to the customer storefront.
 */
export default async function customerPasswordResetSubscriber({
  event,
  container,
}: SubscriberArgs<CustomerPasswordResetPayload>) {
  const data = event.data
  if (!data || data.actor_type !== "customer") return
  if (typeof data.entity_id !== "string" || !data.entity_id ||
      typeof data.token !== "string" || !data.token) return

  const logger = (container as any).resolve("logger", { allowUnregistered: true }) ?? console
  try {
    const notifications: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
    await notifications.createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "customer-password-reset",
      data: { token: data.token },
    })
    logger?.info?.("[customer-password-reset] Notification accepted by SMTP transport")
  } catch {
    logger?.error?.("[customer-password-reset] Notification dispatch failed")
    throw new Error("Password reset notification dispatch failed")
  }
}

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.PASSWORD_RESET,
  context: { subscriberId: "customer-password-reset-subscriber" },
}
