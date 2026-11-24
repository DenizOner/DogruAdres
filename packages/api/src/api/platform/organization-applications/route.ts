import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, csrf, enabled, sessionToken } from "../../personal/security"
import { IdentityAccessDenied } from "../../../modules/dogruadres-access/identity-session"
import {
  reviewApplicationPayload,
  decodeOrganizationDraftCursor,
  TaxCertificateReviewUnavailable
} from "../../../modules/dogruadres-access/organization-application"

export const AUTHENTICATE = false

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  const query = req.query ?? {}
  if (req.headers.authorization)
    return res.status(400).json({ message: "Invalid request" })

  // Scanned, isolated PNG raster for platform reviewer preview
  if (query.action === "review_preview") {
    if (Object.keys(query).some(key => !["action", "application_id"].includes(key)))
      return res.status(400).json({ message: "Invalid request" })
    const appId = typeof query.application_id === "string" ? query.application_id : ""
    if (!/^daorgapp_[0-9a-f]{32}$/.test(appId))
      return res.status(400).json({ message: "Invalid request" })
    try {
      const preview = await access(req).personalReadOrganizationApplicationReviewPreview(
        sessionToken(req), appId
      )
      if (!preview) return res.status(403).json({ message: "Access denied" })
      res.setHeader("Content-Type", "image/png")
      res.setHeader("Content-Disposition", 'inline; filename="review-preview.png"')
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox")
      res.setHeader("X-Content-Type-Options", "nosniff")
      return res.status(200).send(preview.content)
    } catch {
      // Never leak scanner signatures, filesystem paths or raw document bytes.
      return res.status(503).json({ message: "Document review unavailable" })
    }
  }

  // Submitted application review queue
  if (query.action === "review_queue") {
    if (Object.keys(query).some(key => !["action", "cursor"].includes(key)))
      return res.status(400).json({ message: "Invalid request" })
    const cursor = query.cursor === undefined ? undefined : decodeOrganizationDraftCursor(query.cursor)
    if (cursor === null)
      return res.status(400).json({ message: "Invalid request" })
    try {
      const page = await access(req).personalSubmittedOrganizationApplications(sessionToken(req), cursor)
      return page ? res.status(200).json(page) :
        res.status(403).json({ message: "Access denied" })
    } catch (error) {
      return res.status(error instanceof IdentityAccessDenied ? 403 : 503)
        .json({ message: error instanceof IdentityAccessDenied ? "Access denied" : "Unavailable" })
    }
  }

  return res.status(400).json({ message: "Invalid request" })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  if (!enabled()) return res.status(503).json({ message: "Unavailable" })
  let allowed = false
  try { allowed = await csrf(req) } catch {}
  if (!allowed || req.headers.authorization) return res.status(403).json({ message: "Access denied" })
  if (Object.keys(req.query ?? {}).length) return res.status(400).json({ message: "Invalid request" })

  const action = (req.body as { action?: unknown } | undefined)?.action

  if (action === "review_decision") {
    const parsed = reviewApplicationPayload.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ message: "Invalid review decision" })
    try {
      const result = await access(req).personalReviewOrganizationApplication(
        sessionToken(req), parsed.data
      )
      if (!result) return res.status(403).json({ message: "Access denied" })
      if (result.conflict) return res.status(409).json({ message: "Application changed; read the current version" })
      return res.status(200).json(result)
    } catch (error) {
      return res.status(error instanceof IdentityAccessDenied ? 403 : 503)
        .json({ message: error instanceof IdentityAccessDenied ? "Access denied" :
          error instanceof TaxCertificateReviewUnavailable ? "Document review unavailable" : "Unavailable" })
    }
  }

  return res.status(400).json({ message: "Invalid request" })
}
