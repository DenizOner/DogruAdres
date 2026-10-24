import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { createInvitationWorkflow } from "../../../workflows/dogruadres-access/create-invitation"
import { acceptInvitationWorkflow } from "../../../workflows/dogruadres-access/accept-invitation"
import { deriveInvitationToken } from "../../../modules/dogruadres-access/security"
import { verifiedEmailForActorContext } from "../../dogruadres/invitations/accept/route"
import { access, csrf, enabled, sessionToken } from "../security"

// No client-provided actor, Person, role elevation, auth provider, or native JWT.
const organization = z.string().regex(/^daorg_[A-Za-z0-9_-]{1,80}$/)
const create = z.object({
  action: z.literal("create"),
  organization_id: organization,
  email: z.string().trim().email().max(320),
  role: z.literal("member"),
}).strict()
const accept = z.object({
  action: z.literal("accept"),
  token: z.string().min(1).max(256),
}).strict()
const body = z.discriminatedUnion("action", [create, accept])

export const AUTHENTICATE = false

/** Only the existing opaque personal session crosses the browser boundary.
 * The native invitation paths remain closed by nativeIngress. No bearer
 * credential is accepted or returned by this personal endpoint.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Cache-Control", "no-store")
  let validCsrf = false
  try { validCsrf = await csrf(req) } catch {}
  if (!enabled() || !validCsrf) return res.status(403).json({ message: "Access denied" })
  const parsed = body.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" })

  const token = sessionToken(req)
  const service = access(req)
  // A recently completed real MFA challenge is required for either mutation.
  // This principal is derived from the locked server-side identity ledger.
  const principal = await service.personalLinkPrimary(token)
  if (!principal || !["user", "member", "customer"].includes(principal.actor_type))
    return res.status(403).json({ message: "Access denied" })

  if (parsed.data.action === "create") {
    const input = parsed.data
    const scoped = await service.personalOrganizations(token, input.organization_id)
    if (!scoped || scoped.organizations.length !== 1 ||
        !["owner", "admin"].includes(scoped.organizations[0].role))
      return res.status(403).json({ message: "Access denied" })
    // The original Foundation workflow also rechecks Owner/Admin membership
    // under its own transaction; this read is never a mutation authorization.
    const { result } = await createInvitationWorkflow(req.scope).run({
      input: {
        organization_id: input.organization_id, email: input.email,
        role: "member", actor_person_id: principal.person_id,
        actor_type: principal.actor_type, actor_id: principal.actor_id,
      },
    })
    return res.status(201).json({
      invitation: { id: result.id, role: result.role, status: result.status, expires_at: result.expires_at },
      invitation_token: deriveInvitationToken(result.id),
    })
  }

  // Email ownership is proved by the *native* AuthVerification module, not TOTP,
  // a client-supplied email, or the fact that the personal session is active.
  const email = await verifiedEmailForActorContext(req, {
    actor_type: principal.actor_type,
    actor_id: principal.actor_id,
    auth_identity_id: principal.auth_identity_id,
    auth_provider: "emailpass",
    user_metadata: {},
  })
  if (!email) return res.status(403).json({ message: "Verified recipient email required" })
  try {
    const { result } = await acceptInvitationWorkflow(req.scope).run({
      input: {
        token: parsed.data.token, email, email_verified: true,
        actor: { actor_type: principal.actor_type, actor_id: principal.actor_id },
      },
    })
    return res.json({
      membership: {
        id: result.membership.id, organization_id: result.membership.organization_id,
        role: result.membership.role, status: result.membership.status,
      },
    })
  } catch (err: any) {
    return res.status(403).json({ message: err?.message || "Invitation is invalid, expired, revoked, or already used" })
  }
}
