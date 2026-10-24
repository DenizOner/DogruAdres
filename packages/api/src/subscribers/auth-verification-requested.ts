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
    const storefrontUrl = (
      process.env.STOREFRONT_URL ||
      process.env.PUBLIC_ORIGIN ||
      process.env.MEDUSA_STOREFRONT_URL ||
      "http://localhost:8000"
    ).replace(/\/$/, "")

    const verificationUrl = `${storefrontUrl}/auth/verify-email?token=${encodeURIComponent(data.code)}`
    const subject = "DogruAdres E-posta Dogrulama Kodu"
    const text = `Merhaba,\n\nDogruAdres hesabinizi dogrulamak icin lutfen asagidaki baglantiyi tarayicinizda aciniz:\n${verificationUrl}\n\nDogrulama Kodunuz: ${data.code}\n\nBu dogrulama baglantisi 24 saat sureyle gecerlidir ve tek kullanimliktir. Eger bu talebi siz yapmadiysaniz bu mesaji dikkate almayiniz.\n\nDogruAdres Platformu`

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DogruAdres E-posta Dogrulama</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f8fafc; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #137fec;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">DogruAdres</h1>
      <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Pazaryeri Guvenlik ve Kimlik Dogrulama</p>
    </div>
    
    <div style="padding: 32px;">
      <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 600;">E-posta Adresinizi Dogrulayin</h2>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
        Merhaba,<br><br>
        <strong>${data.entity_id}</strong> adresli hesabinizin e-posta dogrulama talebini aldik. Hesabinizi guvenle aktif etmek ve platform islemlerine devam etmek icin asagidaki butona tiklayiniz:
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verificationUrl}" style="background-color: #137fec; color: #ffffff; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; display: inline-block; min-height: 48px; box-sizing: border-box; line-height: 20px;">
          E-posta Adresimi Dogrula
        </a>
      </div>

      <div style="background-color: #f1f5f9; border-left: 4px solid #137fec; padding: 14px 18px; border-radius: 6px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">
          <strong>Guvenlik Notu:</strong> Bu dogrulama baglantisi <strong>24 saat</strong> sureyle gecerlidir ve tek kullanimliktir.
        </p>
      </div>

      <p style="margin: 24px 0 8px; font-size: 13px; color: #64748b;">
        Buton calismiyorsa, asagidaki guvenli baglantiyi tarayicinizin adres cubuguna kopyalayabilirsiniz:
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; color: #0f172a; word-break: break-all;">
        <a href="${verificationUrl}" style="color: #137fec; text-decoration: underline;">${verificationUrl}</a>
      </div>

      <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
        Eger bu hesabi siz olusturmadiysaniz veya bu talebi siz yapmadiysaniz, bu e-postayi guvenle yok sayabilirsiniz.
      </p>
    </div>

    <div style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      <p style="margin: 0 0 6px;">DogruAdres Pazaryeri Platformu</p>
      <p style="margin: 0;">Destek: <a href="mailto:destek@dogruadres.net" style="color: #64748b; text-decoration: underline;">destek@dogruadres.net</a></p>
    </div>
  </div>
</body>
</html>`

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
