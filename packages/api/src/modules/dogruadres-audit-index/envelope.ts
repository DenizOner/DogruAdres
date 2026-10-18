import { z } from "zod"

// Version 1 indexes Foundation only. Register other source contracts explicitly
// in a later checkpoint; this is not permission to ingest arbitrary domain data.
export const FOUNDATION_AUDIT_SOURCE = "dogruadres-access" as const
const reference = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/)
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
})
const resources = {
  "organization.provisioned": "organization",
  "organization.owner_assigned": "membership",
  "organization.membership_changed": "membership",
  "organization.invitation_created": "invitation",
  "organization.invitation_revoked": "invitation",
  "organization.invitation_accepted": "invitation",
} as const
const schema = z.object({
  version: z.literal(1),
  source_module: z.literal(FOUNDATION_AUDIT_SOURCE),
  source_event_id: reference,
  organization_id: reference,
  actor: z.object({
    person_id: reference,
    type: z.enum(["user", "member", "customer"]),
    id: reference,
    role_context: z.enum(["platform_administrator", "owner", "admin", "member"]).nullable(),
  }).strict(),
  action: z.enum(Object.keys(resources) as [keyof typeof resources, ...(keyof typeof resources)[]]),
  resource: z.enum(["organization", "membership", "invitation"]),
  target_id: reference,
  occurred_at: timestamp,
}).strict().refine(value => resources[value.action] === value.resource)

export type AuditIndexEnvelopeV1 = z.infer<typeof schema>
export function validateAuditIndexEnvelope(value: unknown): AuditIndexEnvelopeV1 {
  const result = schema.safeParse(value)
  // Do not include rejected input, identifiers, credentials or Zod issue details.
  if (!result.success) throw new Error("INVALID_AUDIT_INDEX_ENVELOPE")
  return result.data
}

export function projectFoundationAuditEvent(value: unknown): AuditIndexEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_FOUNDATION_AUDIT_SOURCE")
  const source = value as Record<string, unknown>
  if (source.module !== FOUNDATION_AUDIT_SOURCE || source.deleted_at != null) throw new Error("INVALID_FOUNDATION_AUDIT_SOURCE")
  const occurredAt = source.occurred_at
  if (occurredAt instanceof Date && !Number.isFinite(occurredAt.getTime())) throw new Error("INVALID_FOUNDATION_AUDIT_SOURCE")
  // Redaction by construction, not a blacklist: never spread source/actor input.
  // No display names, email, IP, free text, before/after or outbox transport state.
  return validateAuditIndexEnvelope({
    version: 1,
    source_module: FOUNDATION_AUDIT_SOURCE,
    source_event_id: source.id,
    organization_id: source.organization_id,
    actor: { person_id: source.actor_person_id, type: source.actor_type, id: source.actor_id, role_context: source.role_context ?? null },
    action: source.action,
    resource: source.resource,
    target_id: source.target_id,
    occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
  })
}

// Stable field order comes from validation, not the caller's object key order.
export const envelopeFingerprint = (value: unknown) => JSON.stringify(validateAuditIndexEnvelope(value))
