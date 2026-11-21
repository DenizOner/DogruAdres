import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { access, csrf, enabled, sessionToken } from "../security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import { CompanyLauncherConflict, CompanyLauncherInvalid } from "../../../modules/dogruadres-access/company-launcher"

export const AUTHENTICATE = false
const organization = z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const app = z.enum(["organization", "store-applications", "memberships"])
const readQuery = z.object({ organization: organization }).strict()
const writeBody = z.object({
  organization,
  app_ids: z.array(app).max(3),
  collapsed_ids: z.array(app).max(3),
  expected_version: z.number().int().min(0).max(2147483646),
}).strict()

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  const parsed = readQuery.safeParse(req.query)
  if (!parsed.success || req.headers["x-seller-id"] !== undefined)
    return res.status(400).json({ message: "Invalid context" })
  try {
    const data = await access(req).personalCompanyLauncher(
      sessionToken(req), parsed.data.organization
    )
    return data ? res.status(200).json(data) :
      res.status(403).json({ message: "Access denied" })
  } catch (error) {
    return res.status(error instanceof IdentityAccessDenied ? 403 : 503)
      .json({ message: error instanceof IdentityAccessDenied ? "Access denied" : "Unavailable" })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  let valid = false
  try { valid = await csrf(req) } catch {}
  if (!valid || req.headers["x-seller-id"] !== undefined)
    return res.status(403).json({ message: "Access denied" })
  const parsed = writeBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" })
  try {
    const data = await access(req).personalSaveCompanyLauncher(
      sessionToken(req), parsed.data
    )
    return data ? res.status(200).json(data) :
      res.status(403).json({ message: "Access denied" })
  } catch (error) {
    if (error instanceof CompanyLauncherConflict)
      return res.status(409).json({ message: "Launcher changed; reload before saving" })
    if (error instanceof CompanyLauncherInvalid)
      return res.status(400).json({ message: "Invalid preference" })
    return res.status(error instanceof IdentityAccessDenied ? 403 : 503)
      .json({ message: error instanceof IdentityAccessDenied ? "Access denied" :
        "Outcome uncertain; read current launcher before retrying" })
  }
}
