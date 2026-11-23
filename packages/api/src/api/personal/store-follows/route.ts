import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 3: /personal/store-follows moved to /organization/store-follows
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/store-follows' })

export const GET = gone
export const POST = gone
