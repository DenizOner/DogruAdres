/**
 * MOVED: This route has been relocated to /organization/vehicles (#482 Aşama 1).
 * All handlers return 410 Gone to surface misrouted clients promptly.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  return res.status(410).json({ message: "Moved to /organization/vehicles" })
}

export const GET = gone
export const POST = gone
export const PATCH = gone
export const DELETE = gone
