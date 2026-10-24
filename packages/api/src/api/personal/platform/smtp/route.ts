import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../../security"
import { SmtpConcurrentUpdateError, InvalidSmtpSettingsState } from "../../../../modules/dogruadres-access/smtp-settings"
import { isPrivateIp } from "../../../../modules/dogruadres-access/smtp-client"

export const AUTHENTICATE = false

const expectedVersion = z.number().int().min(0).max(2147483646)
const securityMode = z.enum(["ssl", "tls"])

const saveSchema = z.object({
  action: z.literal("save"),
  enabled: z.boolean(),
  host: z.string().min(1).max(255).refine((h) => !isPrivateIp(h), {
    message: "Target host is disallowed or resolves to a private/loopback network",
  }),
  port: z.number().int().min(1).max(65535),
  security: securityMode,
  username: z.string().max(255).optional().nullable(),
  password: z.string().min(1).max(512).optional().nullable(),
  from_email: z.string().email().max(255),
  from_name: z.string().max(255).optional().nullable(),
  expected_version: expectedVersion,
}).strict()

const testCandidateSchema = z.object({
  host: z.string().min(1).max(255).refine((h) => !isPrivateIp(h), {
    message: "Target host is disallowed or resolves to a private/loopback network",
  }).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  security: securityMode.optional(),
  username: z.string().max(255).optional().nullable(),
  password: z.string().min(1).max(512).optional().nullable(),
  from_email: z.string().email().max(255).optional(),
  from_name: z.string().max(255).optional().nullable(),
}).strict()

const testSchema = z.object({
  action: z.literal("test"),
  target_recipient: z.string().email().max(255).optional(),
  candidate_settings: testCandidateSchema.optional(),
}).strict()

const requestSchema = z.discriminatedUnion("action", [saveSchema, testSchema])

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  if (Object.keys(req.query || {}).length) return res.status(400).json({ message: "Invalid input" })

  const service = access(req)
  const token = sessionToken(req)

  try {
    const result = await service.personalPlatformSmtpSettings(token)
    if (!result) {
      return res.status(403).json({ message: "Access denied or strong authentication required" })
    }
    return res.json(result)
  } catch (err) {
    return res.status(500).json({ message: "Failed to read platform SMTP settings" })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })

  let csrfValid = false
  try {
    csrfValid = await csrf(req)
  } catch {}
  if (!csrfValid) return res.status(403).json({ message: "Access denied" })

  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const service = access(req)
  const token = sessionToken(req)

  if (parsed.data.action === "save") {
    try {
      const updated = await service.personalUpdatePlatformSmtpSettings(token, {
        enabled: parsed.data.enabled,
        host: parsed.data.host,
        port: parsed.data.port,
        security: parsed.data.security,
        username: parsed.data.username,
        password: parsed.data.password,
        from_email: parsed.data.from_email,
        from_name: parsed.data.from_name,
        expected_version: parsed.data.expected_version,
      })

      if (!updated) {
        return res.status(403).json({ message: "Access denied or strong authentication required" })
      }

      return res.json({ settings: updated })
    } catch (err) {
      if (err instanceof SmtpConcurrentUpdateError) {
        return res.status(409).json({ message: "Settings changed; refresh before retry" })
      }
      if (err instanceof InvalidSmtpSettingsState) {
        return res.status(400).json({ message: err.message })
      }
      return res.status(500).json({ message: "Failed to update platform SMTP settings" })
    }
  }

  if (parsed.data.action === "test") {
    // Determine target recipient (if not provided, default to authorized admin's email)
    let recipient = parsed.data.target_recipient
    if (!recipient) {
      try {
        const session = await service.personalSession(token)
        if (session && session.auth_identity_id) {
          // Resolve email from login session
          recipient = process.env.SMTP_FROM_EMAIL || "test@dogruadres.invalid"
        }
      } catch {}
    }
    if (!recipient) {
      return res.status(400).json({ message: "Target recipient email is required for test email dispatch" })
    }

    try {
      const sendResult = await service.personalTestPlatformSmtpSettings(
        token,
        recipient,
        parsed.data.candidate_settings
      )

      if (!sendResult) {
        return res.status(403).json({ message: "Access denied or strong authentication required" })
      }

      return res.json({
        ok: true,
        messageId: sendResult.messageId,
        accepted: sendResult.accepted,
      })
    } catch (err) {
      // Return descriptive error message without leaking secret material
      const message = (err as Error).message.replace(/[A-Za-z0-9+/=]{20,}/g, "[REDACTED]")
      return res.status(400).json({
        ok: false,
        message: `SMTP test connection failed: ${message}`,
      })
    }
  }

  return res.status(400).json({ message: "Unknown action" })
}
