import { isDeepStrictEqual } from "node:util"

// Fixed source-only policy: five DELIVERY attempts including the initial claim.
// A reconcile-only lease at attempt 5 never invokes another Index write.
export const AUDIT_DELIVERY = Object.freeze({ maxAttempts: 5, leaseSeconds: 60, baseDelaySeconds: 30, maxDelaySeconds: 900 })
export const DELIVERY_ERROR_CODES = ["SOURCE_INVALID", "ENVELOPE_INVALID", "INDEX_CONFLICT", "INDEX_UNAVAILABLE", "ATTEMPTS_EXHAUSTED", "RECONCILIATION_DEFERRED"] as const
export type DeliveryErrorCode = typeof DELIVERY_ERROR_CODES[number]
export type OutboxClaim = Readonly<{ id: string; leaseToken: string; attempt: number; reconcileOnly: boolean }>
export const retryDelaySeconds = (attempt: number) => {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > AUDIT_DELIVERY.maxAttempts) throw new Error("INVALID_DELIVERY_ATTEMPT")
  return Math.min(AUDIT_DELIVERY.maxDelaySeconds, AUDIT_DELIVERY.baseDelaySeconds * 2 ** (attempt - 1))
}
export function canonicalEventForOutbox(outbox: Record<string, unknown>, event: Record<string, unknown> | null) {
  if (!event || outbox.source_module !== "dogruadres-access" || event.module !== "dogruadres-access" ||
      outbox.source_audit_event_id !== event.id || event.deleted_at != null || outbox.envelope_version !== 1) return null
  const date = new Date(event.occurred_at as string | Date)
  if (!Number.isFinite(date.getTime())) return null
  const expected = {
    version: 1, source_module: "dogruadres-access", source_audit_event_id: event.id,
    organization_id: event.organization_id ?? null,
    actor: { person_id: event.actor_person_id, type: event.actor_type, id: event.actor_id, role_context: event.role_context ?? null },
    action: event.action, resource: event.resource, target_id: event.target_id ?? null, occurred_at: date.toISOString(),
  }
  if (!isDeepStrictEqual(outbox.envelope, expected)) return null
  // Only a canonical row read within Foundation may produce this projection input.
  // Never return before/after data, arbitrary source attributes or the lease token.
  return { id: event.id, module: "dogruadres-access", organization_id: event.organization_id,
    actor_person_id: event.actor_person_id, actor_type: event.actor_type, actor_id: event.actor_id,
    role_context: event.role_context ?? null, action: event.action, resource: event.resource,
    target_id: event.target_id, occurred_at: date.toISOString(), deleted_at: null }
}
