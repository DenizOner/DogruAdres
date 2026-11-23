import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 2: /personal/audit-timeline moved to /organization/audit-timeline
// This stub returns 410 Gone so clients receive an informative response
// rather than a 401 from the frontdoor allow-list passthrough.
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/audit-timeline' })

export const GET = gone
