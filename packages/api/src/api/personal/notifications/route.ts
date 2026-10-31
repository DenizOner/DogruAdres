import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { z } from '@medusajs/framework/zod'
import { access, csrf, enabled, sessionToken } from '../security'
import { IdentityAccessDenied } from '../../../modules/dogruadres-access/identity-session'

export const AUTHENTICATE = false
const query = z.object({
  organization: z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/).optional(),
  offset: z.string().regex(/^(0|[1-9][0-9]{0,8})$/).optional(),
}).strict()
const body = z.object({ id: z.string().regex(/^danot_[0-9a-f-]{36}$/) }).strict()

async function handle(req: MedusaRequest, res: MedusaResponse, write: boolean) {
  res.setHeader('Cache-Control','no-store')
  if (!enabled()) return res.status(503).json({message:'Unavailable'})
  const token = sessionToken(req)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return res.status(401).json({message:'Access denied'})
  const parsed = query.safeParse(req.query)
  if (!parsed.success || (write && parsed.data.offset !== undefined)) return res.status(400).json({message:'Invalid input'})
  try {
    if (!await access(req).personalSession(token)) return res.status(401).json({message:'Access denied'})
    if (write) {
      if (!await csrf(req)) return res.status(403).json({message:'Access denied'})
      const input = body.safeParse(req.body)
      if (!input.success) return res.status(400).json({message:'Invalid input'})
      return res.json(await access(req).readPersonalNotification(token,input.data.id,parsed.data.organization))
    }
    return res.json(await access(req).personalNotifications(token,Number(parsed.data.offset ?? 0),parsed.data.organization))
  } catch (error) {
    if (error instanceof IdentityAccessDenied) return res.status(403).json({message:'Access denied'})
    return res.status(503).json({message:'Service unavailable'})
  }
}
export const GET = (req: MedusaRequest,res: MedusaResponse) => handle(req,res,false)
export const POST = (req: MedusaRequest,res: MedusaResponse) => handle(req,res,true)
