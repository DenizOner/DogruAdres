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
  "organization.store_followed": "buyer-store-follow",
  "organization.store_unfollowed": "buyer-store-follow",
  "organization.store_owner_paused": "store-owner-pause",
  "organization.store_owner_resumed": "store-owner-pause",
  "organization.store_owner_closing_started": "store-owner-closing",
  "organization.store_owner_closing_withdrawn": "store-owner-closing",
  "organization.store_platform_closing_started": "store-platform-closing",
  "organization.store_platform_closing_appealed": "store-platform-closing",
  "organization.store_application_right_disabled": "organization",
  "organization.store_application_right_enabled": "organization",
  "organization.store_application_rejected": "store-application",
  "organization.store_reactivation_claimed": "store-application",
  "organization.store_reactivation_released": "store-application",
  "organization.store_reactivated": "store-application",
  "organization.store_application_draft_saved": "store-application-draft",
  "organization.store_draft_permission_granted": "store-draft-permission",
  "organization.store_draft_permission_revoked": "store-draft-permission",
} as const
const isCompanyPolicyAction = (action: string) =>
  action === "organization.store_application_right_disabled" ||
  action === "organization.store_application_right_enabled"
const schema = z.object({
  version: z.literal(1),
  source_module: z.literal(FOUNDATION_AUDIT_SOURCE),
  source_event_id: reference,
  organization_id: reference,
  actor: z.object({
    person_id: reference,
    type: z.enum(["user", "member", "customer"]),
    id: reference,
    role_context: z.enum(["platform_administrator", "platform_staff", "owner", "admin", "member"]).nullable(),
  }).strict(),
  action: z.enum(Object.keys(resources) as [keyof typeof resources, ...(keyof typeof resources)[]]),
  resource: z.enum(["organization", "membership", "invitation", "buyer-store-follow", "store-application", "store-application-draft", "store-draft-permission", "store-owner-pause", "store-owner-closing", "store-platform-closing"]),
  target_id: reference,
  occurred_at: timestamp,
}).strict()
  .refine(value => resources[value.action] === value.resource)
  // A Buyer Organization follow is emitted only by an active protected Owner.
  // Keep the canonical Seller target and Organization scope distinct.
  .refine(value => value.resource !== "buyer-store-follow" ||
    (value.actor.role_context === "owner" &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^sel_[A-Za-z0-9_-]+$/.test(value.target_id)))
  // Only the protected Organization Owner's canonical Store action crosses Index.
  // A valid envelope alone never grants source-side mutation permission.
  .refine(value => value.resource !== "store-owner-pause" ||
    (value.actor.role_context === "owner" &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^sel_[A-Za-z0-9_-]+$/.test(value.target_id)))
  // The closing intent is exclusively a protected Organization Owner action,
  // not a native Seller/Member capability or a platform Staff grant.
  .refine(value => value.resource !== "store-owner-closing" ||
    (value.actor.role_context === "owner" &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^sel_[A-Za-z0-9_-]+$/.test(value.target_id)))
  // Platform start and Owner appeal have distinct, independent strong grants.
  .refine(value => value.resource !== "store-platform-closing" ||
    (/^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^sel_[A-Za-z0-9_-]+$/.test(value.target_id) &&
     (value.action==="organization.store_platform_closing_started"
       ?value.actor.role_context==="platform_staff"
       :value.actor.role_context==="owner")))
  // Owner or explicitly authorized Member may prepare private draft input.
  // The writer verifies the live membership+audited grant, not this envelope.
  .refine(value => value.action !== "organization.store_application_draft_saved" ||
    (["owner","member"].includes(value.actor.role_context??"") &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^dasdraft_[0-9a-f]{32}$/.test(value.target_id)))
  // Only the protected Owner may delegate/revoke an Organization draft action.
  .refine(value => !["organization.store_draft_permission_granted",
                     "organization.store_draft_permission_revoked"].includes(value.action) ||
    (value.actor.role_context === "owner" &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^daprs_[A-Za-z0-9_-]+$/.test(value.target_id)))
  // The real Staff permission is granted to the canonical Person after
  // strong authentication, regardless of which verified native actor type
  // ('user' / 'member' / 'customer') their current Person session binds.
  // Keep role, Organization scope and target restrictions fail-closed.
  .refine(value => !isCompanyPolicyAction(value.action) ||
    (value.actor.role_context === "platform_staff" &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     value.target_id === value.organization_id))
  // A pending Seller rejection is a platform Staff decision, never an
  // Organization Owner role or a native SellerMember implicit entitlement.
  .refine(value => !["organization.store_application_rejected","organization.store_reactivation_claimed","organization.store_reactivation_released","organization.store_reactivated"].includes(value.action) ||
    (value.actor.role_context === "platform_staff" &&
     /^daorg_[A-Za-z0-9_-]{1,80}$/.test(value.organization_id) &&
     /^sel_[A-Za-z0-9_-]+$/.test(value.target_id)))
  // Only explicitly registered canonical Staff actions may cross the Index
  // boundary. A valid Staff role alone does not authorize arbitrary events.
  .refine(value => value.actor.role_context !== "platform_staff" ||
    value.action === "organization.provisioned" ||
    value.action === "organization.owner_assigned" ||
    value.action === "organization.store_application_rejected" ||
    value.action === "organization.store_reactivation_claimed" ||
    value.action === "organization.store_reactivation_released" ||
    value.action === "organization.store_reactivated" ||
    value.action === "organization.store_platform_closing_started" ||
    isCompanyPolicyAction(value.action))

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

// Inspect BOTH envelope and persisted indexing columns, never identity alone.
export function matchesAuditIndexProjection(value: unknown, expected: AuditIndexEnvelopeV1): boolean {
  try {
    if (!value || typeof value !== "object") return false
    const row = value as Record<string, unknown>
    if (row.deleted_at != null || row.envelope_version !== 1 || envelopeFingerprint(row.envelope) !== envelopeFingerprint(expected)) return false
    const actual = { source_module: row.source_module, source_event_id: row.source_event_id, organization_id: row.organization_id,
      actor_person_id: row.actor_person_id, actor_type: row.actor_type, actor_id: row.actor_id,
      action: row.action, resource: row.resource, target_id: row.target_id, occurred_at: new Date(row.occurred_at as string | Date).toISOString() }
    const wanted = { source_module: expected.source_module, source_event_id: expected.source_event_id, organization_id: expected.organization_id,
      actor_person_id: expected.actor.person_id, actor_type: expected.actor.type, actor_id: expected.actor.id,
      action: expected.action, resource: expected.resource, target_id: expected.target_id, occurred_at: expected.occurred_at }
    return JSON.stringify(actual) === JSON.stringify(wanted)
  } catch { return false }
}
