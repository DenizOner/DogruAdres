import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
// 410 Gone — moved to /platform/store-closings (#482 Aşama 5)
export const AUTHENTICATE = false
const gone = (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(410).json({ message: "Moved to /platform/store-closings" })
export const GET = gone
export const POST = gone
