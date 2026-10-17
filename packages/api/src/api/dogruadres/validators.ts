import { z } from "@medusajs/framework/zod"

const actorReference = z.object({
  actor_type: z.enum(["user", "member", "customer"]),
  actor_id: z.string().min(1).max(255),
})

export const provisionOrganizationBody = z.object({
  name: z.string().trim().min(1).max(200),
  initial_owners: z.array(actorReference).min(1).max(20),
})

export const changeMembershipBody = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  status: z.enum(["active", "revoked"]).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined)

export const createInvitationBody = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "member"]),
})

export const acceptInvitationBody = z.object({
  token: z.string().min(1).max(256),
})

export type ProvisionOrganizationBody = z.infer<typeof provisionOrganizationBody>
export type ChangeMembershipBody = z.infer<typeof changeMembershipBody>
export type CreateInvitationBody = z.infer<typeof createInvitationBody>
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBody>
