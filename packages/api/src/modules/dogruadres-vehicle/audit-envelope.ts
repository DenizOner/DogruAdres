import { z } from "zod"
export const VEHICLE_SOURCE = "dogruadres-vehicle" as const
const reference = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/)
const timestamp = z.string().refine(v => { const d = new Date(v); return Number.isFinite(d.getTime()) && d.toISOString() === v })
const schema = z.object({ version: z.literal(1), source_module: z.literal(VEHICLE_SOURCE), source_event_id: reference,
  organization_id: reference, actor: z.object({ person_id: reference, type: z.enum(["user", "member", "customer"]), id: reference,
    role_context: z.enum(["owner", "admin", "member"]) }).strict(), action: z.enum(["vehicle.created", "vehicle.updated", "vehicle.deleted"]),
  resource: z.literal("vehicle"), target_id: reference, occurred_at: timestamp }).strict()
export type VehicleEnvelope = z.infer<typeof schema>
export function validateVehicleEnvelope(value: unknown): VehicleEnvelope {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error("INVALID_VEHICLE_ENVELOPE")
  return result.data
}
export function projectVehicleAudit(event: Record<string, any>): VehicleEnvelope {
  if (event.module !== VEHICLE_SOURCE || event.deleted_at != null) throw new Error("INVALID_VEHICLE_SOURCE")
  return validateVehicleEnvelope({ version: 1, source_module: VEHICLE_SOURCE, source_event_id: event.id,
    organization_id: event.organization_id, actor: { person_id: event.actor_person_id, type: event.actor_type,
      id: event.actor_id, role_context: event.role_context }, action: event.action, resource: event.resource,
    target_id: event.target_id, occurred_at: event.occurred_at instanceof Date ? event.occurred_at.toISOString() : event.occurred_at })
}
// Index currently accepts Foundation only. This is a Vehicle SOURCE contract,
// not permission to feed its envelope to Foundation's relay or Index ingestion.
