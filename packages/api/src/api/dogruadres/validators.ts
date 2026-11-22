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
  // Company Admin was retired: this route cannot create a new Admin invitation.
  role: z.literal("member"),
})

export const acceptInvitationBody = z.object({
  token: z.string().min(1).max(256),
})

export const createVehicleBody = z.object({
  plate: z.string().max(64).nullable().optional(),
  vin: z.string().max(128).nullable().optional(),
  label: z.string().max(100).nullable().optional(),
  make: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  model_year: z.number().int().min(1886).max(2100).nullable().optional(),
}).strict().refine((data) => data.plate !== undefined || data.vin !== undefined, {
  message: "At least plate or vin must be provided",
})

export const updateVehicleBody = z.object({
  plate: z.string().max(64).nullable().optional(),
  vin: z.string().max(128).nullable().optional(),
  label: z.string().max(100).nullable().optional(),
  make: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  model_year: z.number().int().min(1886).max(2100).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
})

export type ProvisionOrganizationBody = z.infer<typeof provisionOrganizationBody>
export type ChangeMembershipBody = z.infer<typeof changeMembershipBody>
export type CreateInvitationBody = z.infer<typeof createInvitationBody>
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBody>
export type CreateVehicleBody = z.infer<typeof createVehicleBody>
export type UpdateVehicleBody = z.infer<typeof updateVehicleBody>
