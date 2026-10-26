import { AbstractNotificationProviderService, ModuleProvider, Modules } from "@medusajs/framework/utils"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { sendSmtpEmail } from "../dogruadres-access/smtp-client"
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
      const runtimeConfig = await this.container.dogruadresAccess.getActiveSmtpConfig()

      const result = await sendSmtpEmail(
        {
          to: notification.to,
          subject: (notification.data?.subject as string) || "DogruAdres Bildirimi",
          text: (notification.content?.text as string) || String(notification.data?.text || ""),
          html: (notification.content?.html as string) || (notification.data?.html as string),
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
