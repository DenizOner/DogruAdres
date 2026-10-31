import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const AUTHENTICATE = false

// B20 is moving to a verified Person × Organization business workspace.
// The historical Person-only preferences remain stored non-destructively,
// but this old personal route must never read or change them.
const businessWorkspaceRequired = (res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  return res.status(403).json({ message: "Company workspace required" })
}

export const GET = async (_req: MedusaRequest, res: MedusaResponse) =>
  businessWorkspaceRequired(res)

export const POST = async (_req: MedusaRequest, res: MedusaResponse) =>
  businessWorkspaceRequired(res)
