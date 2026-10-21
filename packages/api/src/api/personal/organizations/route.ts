import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { access, enabled, sessionToken } from "../security"
export const AUTHENTICATE = false
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control","no-store")
  if (!enabled()) return res.status(503).json({message:"Unavailable"})
  const id = req.query.id
  // Scope is established by the server-held session; no client-provided role,
  // actor, Organization override or implicit Query option is accepted.
  if (Object.keys(req.query).some(key => key !== "id") ||
      (id !== undefined && (typeof id !== "string" || !/^daorg_[A-Za-z0-9_-]{1,80}$/.test(id))))
    return res.status(400).json({message:"Invalid input"})
  const result = await access(req).personalOrganizations(sessionToken(req),id)
  return result ? res.json(result) : res.status(403).json({message:"Access denied"})
}
