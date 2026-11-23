import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 3: /personal/store-owner-pause moved to /organization/store-owner-pause
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/store-owner-pause' })

export const GET = gone
export const POST = gone
