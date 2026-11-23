import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 3: /personal/store-applications moved to /organization/store-applications
// This stub returns 410 Gone so clients receive an informative response.
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/store-applications' })

export const GET = gone
export const POST = gone
