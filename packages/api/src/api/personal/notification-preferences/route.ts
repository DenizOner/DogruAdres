import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import {
  NotificationPreferenceConflictError,
  NotificationPreferenceValidationError,
} from "../../../modules/dogruadres-access/notification-preferences"

export const AUTHENTICATE = false

const channelSchema = z
  .object({
    platform: z.boolean(),
    email: z.enum(["immediate", "daily_digest", "off"]),
    mobile: z.boolean(),
  })
  .strict()

const preferencesSchema = z
  .object({
    security_account: channelSchema,
    owner_closing: channelSchema,
    organization_membership: channelSchema,
    store_operations: channelSchema,
    buyer_orders: channelSchema,
    seller_operations: channelSchema,
    platform_announcements: channelSchema,
    marketing_promotions: channelSchema,
  })
  .strict()

const expectedVersion = z.number().int().min(0).max(2147483646)

const postBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      preferences: preferencesSchema,
      expected_version: expectedVersion,
    })
    .strict(),
  z
    .object({
      action: z.literal("reset_defaults"),
      expected_version: expectedVersion,
    })
    .strict(),
])

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  if (Object.keys(req.query ?? {}).length) {
    return res.status(400).json({ message: "Invalid input" })
  }
  const token = sessionToken(req)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(401).json({ message: "Access denied" })
  }
  try {
    if (!(await access(req).personalSession(token))) {
      return res.status(401).json({ message: "Access denied" })
    }
    return res.json(await access(req).personalNotificationPreferences(token))
  } catch (error) {
    if (error instanceof IdentityAccessDenied) {
      return res.status(401).json({ message: "Access denied" })
    }
    return res.status(503).json({ message: "Service unavailable" })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  if (Object.keys(req.query ?? {}).length) {
    return res.status(400).json({ message: "Invalid input" })
  }
  const token = sessionToken(req)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(401).json({ message: "Access denied" })
  }
  try {
    if (!(await access(req).personalSession(token))) {
      return res.status(401).json({ message: "Access denied" })
    }
    let csrfOk = false
    try {
      csrfOk = await csrf(req)
    } catch {}
    if (!csrfOk) {
      return res.status(403).json({ message: "Access denied" })
    }
    const parsed = postBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" })
    }
    const result = await access(req).savePersonalNotificationPreferences(token, parsed.data)
    return res.json(result)
  } catch (error) {
    if (error instanceof IdentityAccessDenied) {
      return res.status(401).json({ message: "Access denied" })
    }
    if (error instanceof NotificationPreferenceValidationError) {
      return res.status(400).json({ message: error.message })
    }
    if (error instanceof NotificationPreferenceConflictError) {
      return res.status(409).json({ message: error.message })
    }
    return res.status(503).json({ message: "Service unavailable" })
  }
}
