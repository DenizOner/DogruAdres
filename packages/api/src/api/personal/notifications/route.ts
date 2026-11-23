import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 2: /personal/notifications moved to /organization/notifications
// This stub returns 410 Gone so clients receive an informative response
// rather than a 401 from the frontdoor allow-list passthrough.
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/notifications' })

export const GET = gone
export const POST = gone
