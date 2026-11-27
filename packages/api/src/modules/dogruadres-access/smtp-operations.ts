/// <reference lib="es2022.intl" />
import type { Context } from "@medusajs/framework/types"
import {
  securitySql,
  type SecuritySql,
} from "./identity-session"
import {
  PlatformSmtpPersistence,
  assertSmtpCredentialReuse,
  type UpdateSmtpSettingsInput,
  type SmtpAuditActor,
} from "./smtp-settings"
import { sendSmtpEmail } from "./smtp-client"

export class SmtpOperations {
  constructor(
    private db: SecuritySql,
    private sharedContext: Context
  ) {}

  async getActiveSmtpConfig(context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    return new PlatformSmtpPersistence(sql).readSettings(true)
  }

  async personalPlatformSmtpSettings(token: string, context: Context = {}) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const staff = await sessions.staff(token, "platform.smtp.manage", "platform")
    if (!staff) return null
    const persistence = new PlatformSmtpPersistence(sql)
    const settings = await persistence.readSettings(false)
    return {
      settings,
      can_manage: true,
    }
  }

  async personalUpdatePlatformSmtpSettings(
    token: string,
    input: UpdateSmtpSettingsInput,
    context: Context = {}
  ) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const staff = await sessions.staff(token, "platform.smtp.manage", "platform")
    if (!staff) return null
    const actor: SmtpAuditActor = {
      person_id: staff.person_id,
      actor_type: staff.actor_type as SmtpAuditActor["actor_type"],
      actor_id: staff.actor_id,
    }
    const persistence = new PlatformSmtpPersistence(sql)
    return persistence.updateSettings(input, actor)
  }

  async personalTestPlatformSmtpSettings(
    token: string,
    targetRecipient: string,
    candidateSettings?: Partial<UpdateSmtpSettingsInput>,
    context: Context = {}
  ) {
    const sql = securitySql(context.transactionManager)
    const sessions = new IdentitySessions(sql)
    const staff = await sessions.staff(token, "platform.smtp.manage", "platform")
    if (!staff) return null

    const persistence = new PlatformSmtpPersistence(sql)
    const current = await persistence.readSettings(true)

    const testHost = candidateSettings?.host || current.host
    const testPort = candidateSettings?.port || current.port
    const testSecurity = candidateSettings?.security || current.security
    const testUsername = candidateSettings?.username !== undefined ? candidateSettings.username : current.username
    const testPassword = candidateSettings?.password !== undefined ? candidateSettings.password : current.password
    const testFromEmail = candidateSettings?.from_email || current.from_email
    const testFromName = candidateSettings?.from_name !== undefined ? candidateSettings.from_name : current.from_name

    // Never offer a stored, write-only password to a new SMTP server or AUTH
    // identity merely because an authorized operator left Password blank.
    assertSmtpCredentialReuse(
      current,
      { host: testHost, port: testPort, security: testSecurity, username: testUsername ?? null },
      Boolean(current.password),
      candidateSettings?.password
    )

    return sendSmtpEmail(
      {
        to: targetRecipient,
        subject: "DogruAdres Platform SMTP Test Mesaji",
        text: `DogruAdres Platform SMTP Yapilandirma Testi basariyla tamamlandi.\n\nZaman: ${new Date().toISOString()}\nSunucu: ${testHost}:${testPort}`,
        html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #ddd;border-radius:6px;"><h3>DogruAdres Platform SMTP Test</h3><p>SMTP Yapilandirma Testi basariyla tamamlandi.</p><p><strong>Sunucu:</strong> ${testHost}:${testPort}</p><p><strong>Zaman:</strong> ${new Date().toISOString()}</p></div>`,
      },
      {
        enabled: true,
        host: testHost,
        port: testPort,
        security: testSecurity,
        username: testUsername || undefined,
        password: testPassword || undefined,
        fromEmail: testFromEmail,
        fromName: testFromName || undefined,
      }
    )
  }

  // B22 initial Store application: Organization Owner creates an application
  // and a direct Organization reference; only Mercur Admin approves Seller.
  
}
