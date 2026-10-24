import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { AuthWorkflowEvents } from "@medusajs/framework/utils"
import { sendSmtpEmail } from "../modules/dogruadres-access/smtp-client"

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
    const subject = "DogruAdres E-posta Dogrulama Kodu"
    const text = `Merhaba,\n\nDogruAdres kimlik dogrulama kodunuz: ${data.code}\n\nBu kod kisa bir sure icin gecerlidir. Eger bu talebi siz yapmadiysaniz bu mesaji dikkate almayiniz.\n\nDogruAdres Platformu`
    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <h2 style="color: #333;">DogruAdres E-posta Dogrulama</h2>
  <p>Merhaba,</p>
  <p>Hesabinizi dogrulamak icin asagidaki dogrulama kodunu kullanabilirsiniz:</p>
  <div style="background-color: #f5f5f5; padding: 16px; border-radius: 6px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">
    ${data.code}
  </div>
  <p style="color: #666; font-size: 14px;">Bu kod sinirli bir sure icin gecerlidir. Eger bu islemi siz talep etmediyseniz, bu e-postayi guvenle silebilirsiniz.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
  <p style="color: #999; font-size: 12px;">DogruAdres Marketplace Platform</p>
</div>`

    let runtimeOverride: any = undefined
    try {
      const access = (container as any).resolve("dogruadresAccess", { allowUnregistered: true })
      if (access && typeof access.getActiveSmtpConfig === "function") {
        const active = await access.getActiveSmtpConfig()
        if (active) {
          runtimeOverride = {
            enabled: active.enabled,
            host: active.host,
            port: active.port,
            security: active.security,
            username: active.username || undefined,
            password: active.password || undefined,
            fromEmail: active.from_email,
            fromName: active.from_name || undefined,
          }
        }
      }
    } catch {
      // Fallback to static env configuration
    }

    const result = runtimeOverride
      ? await sendSmtpEmail({ to: data.entity_id, subject, text, html }, runtimeOverride)
      : await sendSmtpEmail({ to: data.entity_id, subject, text, html })

    if (logger?.info) {
      logger.info(`[auth-verification-requested] Verification email successfully dispatched to ${data.entity_id} (MessageId: ${result.messageId})`)
    }
  } catch (error) {
    if (logger?.error) {
      logger.error(`[auth-verification-requested] Failed to dispatch verification email to ${data.entity_id}: ${(error as Error).message}`)
    }
  }
}

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.VERIFICATION_REQUESTED,
  context: {
    subscriberId: "auth-verification-requested-subscriber",
  },
}
