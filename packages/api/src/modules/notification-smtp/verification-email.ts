/** Trusted process configuration only; no request Host/Origin or implicit local fallback. */
export function resolveVerificationOrigin(env: Record<string, string | undefined> = process.env): string {
  const value = env.STOREFRONT_URL || env.PUBLIC_ORIGIN || env.MEDUSA_STOREFRONT_URL
  try {
    if (!value) throw new Error()
    const url = new URL(value)
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (url.origin !== value || url.username || url.password ||
        (url.protocol !== "https:" && !(["development", "test"].includes(env.NODE_ENV || "") && url.protocol === "http:" && loopback)) ||
        (env.NODE_ENV === "production" && loopback)) throw new Error()
    return url.origin
  } catch {
    throw new Error("Verification storefront origin is missing or invalid")
  }
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
      tr: "Bu doÄŸrulama baÄŸlantÄ±sÄ± sÄ±nÄ±rlÄ± bir sÃ¼re iÃ§in geÃ§erlidir ve tek kullanÄ±mlÄ±ktÄ±r.",
      durationLabel: "sÄ±nÄ±rlÄ± bir sÃ¼re",
    }
  }

  const expDate = new Date(expiresAt)
  if (isNaN(expDate.getTime())) {
    return {
      tr: "Bu doÄŸrulama baÄŸlantÄ±sÄ± sÄ±nÄ±rlÄ± bir sÃ¼re iÃ§in geÃ§erlidir ve tek kullanÄ±mlÄ±ktÄ±r.",
      durationLabel: "sÄ±nÄ±rlÄ± bir sÃ¼re",
    }
  }

  const now = new Date()
  const diffMs = expDate.getTime() - now.getTime()
  if (diffMs <= 0) {
    return {
      tr: "Bu doÄŸrulama baÄŸlantÄ±sÄ±nÄ±n sÃ¼resi dolmak Ã¼zeredir veya dolmuÅŸtur.",
      durationLabel: "sÃ¼resi dolmuÅŸ",
    }
  }

  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  if (diffHours >= 1) {
    return {
      tr: `Bu doÄŸrulama baÄŸlantÄ±sÄ± ${diffHours} saat sÃ¼reyle geÃ§erlidir ve tek kullanÄ±mlÄ±ktÄ±r.`,
      durationLabel: `${diffHours} saat`,
    }
  }

  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)))
  return {
    tr: `Bu doÄŸrulama baÄŸlantÄ±sÄ± ${diffMinutes} dakika sÃ¼reyle geÃ§erlidir ve tek kullanÄ±mlÄ±ktÄ±r.`,
    durationLabel: `${diffMinutes} dakika`,
  }
}

export function renderVerificationEmail(data: { entity_id: string; code?: string; expires_at?: string | Date }) {
    const storefrontUrl = resolveVerificationOrigin()
    if (typeof data.entity_id !== "string" || !data.entity_id || typeof data.code !== "string" || !data.code) throw new Error("Verification notification data is invalid")
    const verificationUrl = `${storefrontUrl}/auth/verify-email?token=${encodeURIComponent(data.code)}`
    const safeEntityId = escapeHtml(data.entity_id)
    const expiryInfo = formatExpiryNotice(data.expires_at)

    const subject = "DoÄŸruAdres E-posta DoÄŸrulama"
    const text = `Merhaba,\n\nDoÄŸruAdres hesabÄ±nÄ±zÄ± doÄŸrulamak iÃ§in lÃ¼tfen aÅŸaÄŸÄ±daki gÃ¼venli baÄŸlantÄ±yÄ± tarayÄ±cÄ±nÄ±zda aÃ§Ä±nÄ±z:\n${verificationUrl}\n\nGÃ¼venlik Notu: ${expiryInfo.tr}\n\nEÄŸer bu talebi siz yapmadÄ±ysanÄ±z, bu e-postayÄ± gÃ¼venle yok sayabilirsiniz.\n\nDoÄŸruAdres Platformu`

    const safeVerificationUrl = escapeHtml(verificationUrl)
    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoÄŸruAdres E-posta DoÄŸrulama</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f8fafc; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #0e66c2;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">DoÄŸruAdres</h1>
      <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Pazaryeri GÃ¼venlik ve Kimlik DoÄŸrulama</p>
    </div>

    <div style="padding: 32px;">
      <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 600;">E-posta Adresinizi DoÄŸrulayÄ±n</h2>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
        Merhaba,<br><br>
        <strong>${safeEntityId}</strong> adresli hesabÄ±nÄ±zÄ±n e-posta doÄŸrulama talebini aldÄ±k. HesabÄ±nÄ±zÄ± gÃ¼venle aktif etmek ve platform iÅŸlemlerine devam etmek iÃ§in aÅŸaÄŸÄ±daki butona tÄ±klayÄ±nÄ±z:
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${safeVerificationUrl}" style="background-color: #0e66c2; color: #ffffff; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; display: inline-block; min-height: 48px; box-sizing: border-box; line-height: 20px;">
          E-posta Adresimi DoÄŸrula
        </a>
      </div>

      <div style="background-color: #f1f5f9; border-left: 4px solid #0e66c2; padding: 14px 18px; border-radius: 6px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">
          <strong>GÃ¼venlik Notu:</strong> ${expiryInfo.tr}
        </p>
      </div>

      <p style="margin: 24px 0 8px; font-size: 13px; color: #64748b;">
        Buton Ã§alÄ±ÅŸmÄ±yorsa, aÅŸaÄŸÄ±daki gÃ¼venli baÄŸlantÄ±yÄ± tarayÄ±cÄ±nÄ±zÄ±n adres Ã§ubuÄŸuna kopyalayabilirsiniz:
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; color: #0f172a; word-break: break-all;">
        <a href="${safeVerificationUrl}" style="color: #0e66c2; text-decoration: underline;">${safeVerificationUrl}</a>
      </div>

      <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
        EÄŸer bu hesabÄ± siz oluÅŸturmadÄ±ysanÄ±z veya bu talebi siz yapmadÄ±ysanÄ±z, bu e-postayÄ± gÃ¼venle yok sayabilirsiniz.
      </p>
    </div>

    <div style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      <p style="margin: 0 0 6px;">DoÄŸruAdres Pazaryeri Platformu</p>
      <p style="margin: 0;">Destek: <a href="mailto:destek@dogruadres.net" style="color: #64748b; text-decoration: underline;">destek@dogruadres.net</a></p>
    </div>
  </div>
</body>
</html>`

    return { subject, text, html }
}
