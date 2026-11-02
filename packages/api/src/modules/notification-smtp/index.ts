import { AbstractNotificationProviderService, ModuleProvider, Modules } from "@medusajs/framework/utils"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { sendSmtpEmail } from "../dogruadres-access/smtp-client"
import { renderVerificationEmail } from "./verification-email"
import type DogruAdresAccessModuleService from "../dogruadres-access/service"

export class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-smtp"

  constructor(protected readonly container: { dogruadresAccess: Pick<DogruAdresAccessModuleService, "getActiveSmtpConfig"> }) {
    super()
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    try {
      // Medusa injects a cradle, not an Awilix container. Read on every send;
      // a settings/decryption failure must never fall back to stale env settings.
      // Render/validate inside native dispatch so configuration rejection records
      // Notification failure before settings access or any transport side effect.
      const message = notification.template === "email-verification"
        ? renderVerificationEmail({ entity_id: notification.to, code: notification.data?.code as string, expires_at: notification.data?.expires_at as string | undefined })
        : {
            subject: (notification.data?.subject as string) || "DogruAdres Bildirimi",
            text: (notification.content?.text as string) || String(notification.data?.text || ""),
            html: (notification.content?.html as string) || (notification.data?.html as string),
          }
      const runtimeConfig = await this.container.dogruadresAccess.getActiveSmtpConfig()

      const result = await sendSmtpEmail(
        {
          to: notification.to,
          ...message,
        },
        runtimeConfig
          ? {
              enabled: runtimeConfig.enabled,
              host: runtimeConfig.host,
              port: runtimeConfig.port,
              security: runtimeConfig.security,
              username: runtimeConfig.username || undefined,
              password: runtimeConfig.password || undefined,
              fromEmail: runtimeConfig.from_email,
              fromName: runtimeConfig.from_name || undefined,
            }
          : undefined
      )

      return { id: result.messageId }
    } catch {
      // Native Notification and event-bus errors may be logged. Never propagate
      // server replies, recipient data, decrypted credentials or message bodies.
      throw new Error("SMTP notification dispatch failed")
    }
  }
}

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [SmtpNotificationProviderService],
})
