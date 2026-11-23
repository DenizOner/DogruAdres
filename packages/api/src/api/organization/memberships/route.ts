import type {MedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {z} from '@medusajs/framework/zod'
import {access,csrf,enabled,sessionToken} from '../../personal/security'
import {IdentityAccessDenied} from '../../../modules/dogruadres-access/identity-session'

// #482 Aşama 2: Moved from /personal/memberships → /organization/memberships
// Auth chain: session cookie (da_session) → sessionToken() → personalMemberships()/
// personalManageProtectedOwner()/personalChangeMembershipRole()/personalRevokeMembership()
// All service calls are scoped to the caller's verified Organization membership.

const org = z.string().regex(/^daorg_[A-Za-z0-9_-]+$/)
const membershipId = z.string().min(1).max(255)

const revokeInput = z.object({
  action: z.literal('revoke').optional(),
  organization_id: org,
  membership_id: membershipId,
}).strict()

const roleChangeInput = z.object({
  action: z.literal('role').optional(),
  organization_id: org,
  membership_id: membershipId,
  // Approved #253: no new Organization Admin assignments; legacy only.
  role: z.literal('member'),
}).strict()

// B07 uses an explicit action; ordinary B06 can never assign Owner.
const protectedOwnerInput = z.object({
  action: z.literal('protected_owner'),
  organization_id: org,
  membership_id: membershipId,
  role: z.enum(['owner', 'admin']),
}).strict()

const input = z.union([protectedOwnerInput, roleChangeInput, revokeInput])

export const AUTHENTICATE = false

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!enabled()) return res.status(503).json({ message: 'Unavailable' })
  const id = org.safeParse(req.query.organization)
  if (!id.success || Object.keys(req.query).length !== 1) return res.status(400).json({ message: 'Invalid input' })
  try {
    const memberships = await access(req).personalMemberships(sessionToken(req), id.data)
    // ORM serialization may include implicit relations despite a select list.
    return res.json({ memberships: memberships.map(({ id, person_id, role, status, protected_owner }) =>
      ({ id, person_id, role, status, protected_owner })) })
  } catch (error) {
    return res.status(error instanceof IdentityAccessDenied ? 403 : 503)
      .json({ message: error instanceof IdentityAccessDenied ? 'Access denied' : 'Unavailable' })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!enabled() || !await csrf(req)) return res.status(403).json({ message: 'Access denied' })
  const parsed = input.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Invalid input' })
  const service = access(req)
  const token = sessionToken(req)
  try {
    if (parsed.data.action === 'protected_owner') {
      const membership = await service.personalManageProtectedOwner(
        token,
        parsed.data.organization_id,
        parsed.data.membership_id,
        parsed.data.role
      )
      return res.json({ membership })
    }
    if ('role' in parsed.data && parsed.data.role) {
      const membership = await service.personalChangeMembershipRole(
        token,
        parsed.data.organization_id,
        parsed.data.membership_id,
        parsed.data.role
      )
      return res.json({ membership })
    }
    const membership = await service.personalRevokeMembership(
      token,
      parsed.data.organization_id,
      parsed.data.membership_id
    )
    return res.json({ membership })
  } catch (error) {
    return res.status(error instanceof IdentityAccessDenied ? 403 : 503)
      .json({ message: error instanceof IdentityAccessDenied ? 'Access denied' : 'Unavailable' })
  }
}
