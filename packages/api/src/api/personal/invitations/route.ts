import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { createInvitationWorkflow } from "../../../workflows/dogruadres-access/create-invitation"
import { acceptInvitationWorkflow } from "../../../workflows/dogruadres-access/accept-invitation"
import { deriveInvitationToken } from "../../../modules/dogruadres-access/security"
import { sendSmtpEmail } from "../../../modules/dogruadres-access/smtp-client"
import { verifiedEmailForActorContext } from "../../dogruadres/invitations/accept/route"
import { access, csrf, enabled, sessionToken } from "../security"

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function buildInvitationEmail(inviteUrl: string, recipientEmail: string) {
  const safeRecipient = escapeHtml(recipientEmail)
  const subject = "DoğruAdres Kuruluş Üyelik Daveti"
  const text = `Merhaba,\n\nDoğruAdres platformunda bir kuruluş üyelik daveti aldınız.\nDaveti onaylamak ve üyeliğinizi aktifleştirmek için lütfen aşağıdaki güvenli bağlantıyı tarayıcınızda açınız:\n${inviteUrl}\n\nGüvenlik Notu: Bu davet bağlantısı 7 gün süreyle geçerlidir ve tek kullanımlıktır. Yalnızca bu e-posta adresine bağlı doğrulanmış DoğruAdres hesabıyla kabul edilebilir.\n\nEğer bu daveti siz beklemiyorsanız, bu e-postayı güvenle yok sayabilirsiniz.\n\nDoğruAdres Platformu`

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoğruAdres Kuruluş Daveti</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f8fafc; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #0e66c2;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">DoğruAdres</h1>
      <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Kuruluş Yönetimi ve Üyelik Daveti</p>
    </div>
    <div style="padding: 32px;">
      <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 600;">Kuruluş Üyelik Daveti</h2>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
        Merhaba,<br><br>
        <strong>${safeRecipient}</strong> adresine bir kuruluş üyelik daveti iletildi. Daveti incelemek ve üyeliğinizi onaylamak için aşağıdaki bağlantıyı kullanabilirsiniz:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteUrl}" style="background-color: #0e66c2; color: #ffffff; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; display: inline-block; min-height: 48px; box-sizing: border-box; line-height: 20px;">
          Daveti Onayla ve Katıl
        </a>
      </div>
      <div style="background-color: #f1f5f9; border-left: 4px solid #0e66c2; padding: 14px 18px; border-radius: 6px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">
          <strong>Güvenlik Notu:</strong> Bu davet bağlantısı 7 gün süreyle geçerlidir ve tek kullanımlıktır. Yalnızca bu e-posta adresine bağlı doğrulanmış DoğruAdres hesabıyla kabul edilebilir.
        </p>
      </div>
      <p style="margin: 24px 0 8px; font-size: 13px; color: #64748b;">
        Buton çalışmıyorsa aşağıdaki güvenli bağlantıyı tarayıcınızın adres çubuğuna kopyalayabilirsiniz:
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; color: #0f172a; word-break: break-all;">
        <a href="${inviteUrl}" style="color: #0e66c2; text-decoration: underline;">${inviteUrl}</a>
      </div>
      <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
        Eğer bu daveti siz beklemiyorsanız, bu e-postayı güvenle yok sayabilirsiniz.
      </p>
    </div>
    <div style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      <p style="margin: 0 0 6px;">DoğruAdres Pazaryeri Platformu</p>
      <p style="margin: 0;">Destek: <a href="mailto:destek@dogruadres.net" style="color: #64748b; text-decoration: underline;">destek@dogruadres.net</a></p>
    </div>
  </div>
</body>
</html>`;
  return { subject, text, html };
}

// No client-provided actor, Person, role elevation, auth provider, or native JWT.
const organization = z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const create = z.object({
  action: z.literal("create"),
  organization_id: organization,
  email: z.string().trim().email().max(320),
  role: z.literal("member"),
}).strict()
const accept = z.object({
  action: z.literal("accept"),
  token: z.string().min(1).max(256),
}).strict()
const body = z.discriminatedUnion("action", [create, accept])

export const AUTHENTICATE = false

/** Only the existing opaque personal session crosses the browser boundary.
 * The native invitation paths remain closed by nativeIngress. No bearer
 * credential is accepted or returned by this personal endpoint.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  let validCsrf = false
  try { validCsrf = await csrf(req) } catch {}
  if (!enabled() || !validCsrf) return res.status(403).json({ message: "Access denied" })
  const parsed = body.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" })

  const token = sessionToken(req)
  const service = access(req)
  // A recently completed real MFA challenge is required for either mutation.
  // This principal is derived from the locked server-side identity ledger.
  const principal = await service.personalLinkPrimary(token)
  if (!principal || !["user", "member", "customer"].includes(principal.actor_type))
    return res.status(403).json({ message: "Access denied" })

  if (parsed.data.action === "create") {
    const input = parsed.data
    const scoped = await service.personalOrganizations(token, input.organization_id)
    if (!scoped || scoped.organizations.length !== 1 ||
        !["owner", "admin"].includes(scoped.organizations[0].role))
      return res.status(403).json({ message: "Access denied" })
    // Never derive an invitation link from caller-controlled headers or localhost defaults.
    // Check configuration before creating a persistent invitation record.
    const configuredOrigin = process.env.DOGRUADRES_PUBLIC_ORIGIN
    if (!configuredOrigin) {
      return res.status(503).json({ message: "Davet bağlantısı şu anda oluşturulamıyor." })
    }
    // The original Foundation workflow also rechecks Owner/Admin membership
    // under its own transaction; this read is never a mutation authorization.
    const { result } = await createInvitationWorkflow(req.scope).run({
      input: {
        organization_id: input.organization_id, email: input.email,
        role: "member", actor_person_id: principal.person_id,
        actor_type: principal.actor_type, actor_id: principal.actor_id,
      },
    })

    const derivedToken = deriveInvitationToken(result.id)
    const publicOrigin = configuredOrigin.replace(/\/$/, "")
    const inviteUrl = `${publicOrigin}/personal?invitation_token=${encodeURIComponent(derivedToken)}`

    let deliveryStatus: "sent" | "failed" = "failed"


    try {
      let runtimeOverride: any = undefined
      if (service && typeof service.getActiveSmtpConfig === "function") {
        const active = await service.getActiveSmtpConfig()
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

      const emailContent = buildInvitationEmail(inviteUrl, input.email)

      if (runtimeOverride) {
        await sendSmtpEmail({ to: input.email, ...emailContent }, runtimeOverride)
      } else {
        await sendSmtpEmail({ to: input.email, ...emailContent })
      }
      deliveryStatus = "sent"
    } catch {
      // SMTP provider errors may contain recipient, credentials or sensitive server details.
      deliveryStatus = "failed"
    }

    return res.status(201).json({
      invitation: { id: result.id, role: result.role, status: result.status, expires_at: result.expires_at },
      delivery: { status: deliveryStatus },
    })
  }

  // Email ownership is proved by the *native* AuthVerification module, not TOTP,
  // a client-supplied email, or the fact that the personal session is active.
  const email = await verifiedEmailForActorContext(req, {
    actor_type: principal.actor_type,
    actor_id: principal.actor_id,
    auth_identity_id: principal.auth_identity_id,
    auth_provider: "emailpass",
    user_metadata: {},
  })
  if (!email) return res.status(403).json({ message: "Verified recipient email required" })
  try {
    const { result } = await acceptInvitationWorkflow(req.scope).run({
      input: {
        token: parsed.data.token, email, email_verified: true,
        actor: { actor_type: principal.actor_type, actor_id: principal.actor_id },
      },
    })
    return res.json({
      membership: {
        id: result.membership.id, organization_id: result.membership.organization_id,
        role: result.membership.role, status: result.membership.status,
      },
    })
  } catch {
    // Invitation failures may include sensitive actor or organization details.
    // Never reflect workflow or persistence errors into public HTTP responses.
    return res.status(403).json({ message: "Bu bağlantıyla mevcut oturumda devam edilemiyor. Uygun hesapla giriş yapın veya yeni davet isteyin." })
  }
}
