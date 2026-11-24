import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "node:crypto"
import { enabled } from "./security"
import { renderPersonalConsole } from "./console-view"

export const AUTHENTICATE = false

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  if (!enabled()) return res.status(503).send("Kişisel çalışma alanı etkin değil")
  const nonce = randomBytes(18).toString("base64")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
  )
  res.type("html").send(renderPersonalConsole(nonce))
}
