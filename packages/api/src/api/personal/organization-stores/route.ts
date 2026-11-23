import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 3: /personal/organization-stores moved to /organization/stores
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/stores' })

export const GET = gone
