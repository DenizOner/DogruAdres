import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

// #482 Aşama 3: /personal/store-platform-closing-email-visit moved to /organization/store-platform-closing-email-visit
export const AUTHENTICATE = false

const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: 'Moved to /organization/store-platform-closing-email-visit' })

export const POST = gone
