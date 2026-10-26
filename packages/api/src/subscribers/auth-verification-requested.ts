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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatExpiryNotice(expiresAt?: string | Date): { tr: string; durationLabel: string } {
  if (!expiresAt) {
    return {
      tr: "Bu doğrulama bağlantısı sınırlı bir süre için geçerlidir ve tek kullanımlıktır.",
      durationLabel: "sınırlı bir süre",
    }
  }

  const expDate = new Date(expiresAt)
  if (isNaN(expDate.getTime())) {
    return {
      tr: "Bu doğrulama bağlantısı sınırlı bir süre için geçerlidir ve tek kullanımlıktır.",
      durationLabel: "sınırlı bir süre",
    }
  }

  const now = new Date()
  const diffMs = expDate.getTime() - now.getTime()
  if (diffMs <= 0) {
    return {
      tr: "Bu doğrulama bağlantısının süresi dolmak üzeredir veya dolmuştur.",
      durationLabel: "süresi dolmuş",
    }
  }

  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  if (diffHours >= 1) {
    return {
      tr: `Bu doğrulama bağlantısı ${diffHours} saat süreyle geçerlidir ve tek kullanımlıktır.`,
      durationLabel: `${diffHours} saat`,
    }
  }

  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)))
  return {
    tr: `Bu doğrulama bağlantısı ${diffMinutes} dakika süreyle geçerlidir ve tek kullanımlıktır.`,
    durationLabel: `${diffMinutes} dakika`,
  }
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
    const storefrontUrl = (
      process.env.STOREFRONT_URL ||
      process.env.PUBLIC_ORIGIN ||
      process.env.MEDUSA_STOREFRONT_URL ||
      "http://localhost:8000"
    ).replace(/\/$/, "")

    const verificationUrl = `${storefrontUrl}/auth/verify-email?token=${encodeURIComponent(data.code)}`
    const safeEntityId = escapeHtml(data.entity_id)
    const expiryInfo = formatExpiryNotice(data.expires_at)

    const subject = "DoğruAdres E-posta Doğrulama"
    const text = `Merhaba,\n\nDoğruAdres hesabınızı doğrulamak için lütfen aşağıdaki güvenli bağlantıyı tarayıcınızda açınız:\n${verificationUrl}\n\nGüvenlik Notu: ${expiryInfo.tr}\n\nEğer bu talebi siz yapmadıysanız, bu e-postayı güvenle yok sayabilirsiniz.\n\nDoğruAdres Platformu`

    const safeVerificationUrl = escapeHtml(verificationUrl)
    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoğruAdres E-posta Doğrulama</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f8fafc; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #0e66c2;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">DoğruAdres</h1>
      <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Pazaryeri Güvenlik ve Kimlik Doğrulama</p>
    </div>
    
    <div style="padding: 32px;">
      <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 600;">E-posta Adresinizi Doğrulayın</h2>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
        Merhaba,<br><br>
        <strong>${safeEntityId}</strong> adresli hesabınızın e-posta doğrulama talebini aldık. Hesabınızı güvenle aktif etmek ve platform işlemlerine devam etmek için aşağıdaki butona tıklayınız:
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${safeVerificationUrl}" style="background-color: #0e66c2; color: #ffffff; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; display: inline-block; min-height: 48px; box-sizing: border-box; line-height: 20px;">
          E-posta Adresimi Doğrula
        </a>
      </div>

      <div style="background-color: #f1f5f9; border-left: 4px solid #0e66c2; padding: 14px 18px; border-radius: 6px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">
          <strong>Güvenlik Notu:</strong> ${expiryInfo.tr}
        </p>
      </div>

      <p style="margin: 24px 0 8px; font-size: 13px; color: #64748b;">
        Buton çalışmıyorsa, aşağıdaki güvenli bağlantıyı tarayıcınızın adres çubuğuna kopyalayabilirsiniz:
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; color: #0f172a; word-break: break-all;">
        <a href="${safeVerificationUrl}" style="color: #0e66c2; text-decoration: underline;">${safeVerificationUrl}</a>
      </div>

      <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
        Eğer bu hesabı siz oluşturmadıysanız veya bu talebi siz yapmadıysanız, bu e-postayı güvenle yok sayabilirsiniz.
      </p>
    </div>

    <div style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      <p style="margin: 0 0 6px;">DoğruAdres Pazaryeri Platformu</p>
      <p style="margin: 0;">Destek: <a href="mailto:destek@dogruadres.net" style="color: #64748b; text-decoration: underline;">destek@dogruadres.net</a></p>
    </div>
  </div>
</body>
</html>`

    const notifications: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
    await notifications.createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "email-verification",
      data: { subject, text, html },
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
