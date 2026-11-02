import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { AuthWorkflowEvents, Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/framework/types"

export interface AuthVerificationRequestedPayload {
  entity_id: string
  entity_type: string
  code_provider: string
  auth_identity_id: string
  code?: string
  expires_at?: string | Date
  metadata?: Record<string, unknown>
}

export default async function authVerificationRequestedSubscriber({
  event,
  container,
}: SubscriberArgs<AuthVerificationRequestedPayload>) {
  const data = event.data
  if (!data || data.entity_type !== "email" || !data.entity_id || !data.code) {
    return
  }

  const logger = (container as any).resolve("logger", { allowUnregistered: true }) ?? console

  try {
    const notifications: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
    await notifications.createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "email-verification",
      data: { code: data.code, expires_at: data.expires_at },
    })
    if (logger?.info) {
      logger.info(`[auth-verification-requested] Verification email accepted by SMTP transport`)
    }
  } catch (error) {
    if (logger?.error) {
      logger.error(`[auth-verification-requested] Verification email dispatch failed`)
    }
    throw new Error("Verification email dispatch failed")
  }
}

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.VERIFICATION_REQUESTED,
  context: {
    subscriberId: "auth-verification-requested-subscriber",
  },
}
