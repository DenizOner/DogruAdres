import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { sendSmtpEmail } from "../dogruadres-access/smtp-client"

export class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-smtp"

  constructor(protected readonly container: any, protected readonly options: any) {
    super()
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    let runtimeConfig
    try {
      const access = this.container.resolve("dogruadresAccess", { allowUnregistered: true })
      if (access && typeof access.getActiveSmtpConfig === "function") {
        runtimeConfig = await access.getActiveSmtpConfig()
      }
    } catch {
      // Fallback to static env configuration in sendSmtpEmail
    }

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
  }
}

export default {
  services: [SmtpNotificationProviderService],
}
