import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 3: /personal/store-rename-requests moved to /organization/store-rename-requests
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/store-rename-requests' })

export const GET = gone
export const POST = gone
