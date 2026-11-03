import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"

export const AUTHENTICATE = false

// Matches the existing native registration contact syntax. Neither the phone
// nor its shape is proof of number possession, legal identity or Organization.
const update = z.object({
  mobile_phone: z.string().min(6).max(20).regex(/^[+]?[0-9]+$/),
  expected_version: z.number().int().min(0).max(2147483646),
}).strict()

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  if (Object.keys(req.query ?? {}).length)
    return res.status(400).json({ message: "Invalid input" })
  try {
    const data = await access(req).personalMobile(sessionToken(req))
    if (!data) return res.status(403).json({ message: "Access denied" })
    return res.json({ mobile_phone: data.mobile_phone, version: data.version,
      phone_verified: false })
  } catch {
    return res.status(503).json({ message: "Service unavailable" })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  let allowed = false
  try { allowed = await csrf(req) } catch {}
  if (!allowed) return res.status(403).json({ message: "Access denied" })
  if (Object.keys(req.query ?? {}).length)
    return res.status(400).json({ message: "Invalid input" })
  const parsed = update.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" })
  try {
    const data = await access(req).personalSaveMobile(
      sessionToken(req), parsed.data.mobile_phone, parsed.data.expected_version)
    if (!data) return res.status(403).json({ message: "Access denied or recent strong authentication required" })
    if ("conflict" in data)
      return res.status(409).json({ message: "Contact changed; refresh before retry" })
    return res.json({ mobile_phone: data.mobile_phone, version: data.version,
      phone_verified: false })
  } catch {
    // Do not expose a private phone, SQL or audit payload on failure.
    return res.status(503).json({ message: "Service unavailable" })
  }
}
