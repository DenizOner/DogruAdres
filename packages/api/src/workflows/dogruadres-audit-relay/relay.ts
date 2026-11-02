import type { OutboxClaim, DeliveryErrorCode } from "../../modules/dogruadres-access/audit-delivery-policy"
import { projectFoundationAuditEvent } from "../../modules/dogruadres-audit-index/envelope"

// Narrow module ports intentionally have NO Context/EntityManager parameter.
export interface FoundationAuditRelaySource {
  claimFoundationAuditOutbox(): Promise<OutboxClaim | null>
  readClaimedFoundationAudit(claim: OutboxClaim): Promise<{ state: "lost" | "invalid" } | { state: "valid"; event: Record<string, unknown> }>
  acknowledgeFoundationAudit(claim: OutboxClaim): Promise<boolean>
  deferFoundationAudit(claim: OutboxClaim, code: DeliveryErrorCode): Promise<boolean>
  quarantineFoundationAudit(claim: OutboxClaim, code: DeliveryErrorCode): Promise<boolean>
}
export interface FoundationAuditRelayIndex {
  inspectFoundationAuditEvent(event: unknown): Promise<"missing" | "matching" | "conflict">
  indexFoundationAuditEvent(event: unknown): Promise<unknown>
}
export type RelayOutcome = "idle" | "delivered" | "lease_lost" | "deferred" | "quarantined" | "source_unavailable" | "ack_unconfirmed"

// One bounded invocation, no process-local delivery truth, loop, timer or worker.
// Crashes leave durable claims recoverable after lease expiry; Index is at-least-
// once/idempotent, NOT part of a Foundation physical transaction/compensation.
export async function relayOneFoundationAudit(source: FoundationAuditRelaySource, index: FoundationAuditRelayIndex): Promise<RelayOutcome> {
  let claim: OutboxClaim | null
  try { claim = await source.claimFoundationAuditOutbox() } catch { return "source_unavailable" }
  if (!claim) return "idle"
  const defer = async (reconciliation = false): Promise<RelayOutcome> => {
    try { return await source.deferFoundationAudit(claim!, reconciliation ? "RECONCILIATION_DEFERRED" : "INDEX_UNAVAILABLE") ? "deferred" : "lease_lost" }
    catch { return "source_unavailable" }
  }
  const quarantine = async (code: DeliveryErrorCode): Promise<RelayOutcome> => {
    try { return await source.quarantineFoundationAudit(claim!, code) ? "quarantined" : "lease_lost" }
    catch { return "source_unavailable" }
  }
  const acknowledge = async (): Promise<RelayOutcome> => {
    // Only called after a committed matching inspection or successful Index write.
    // Lost/ambiguous ACK never triggers another write here. Expiry/reconciliation
    // handles it later, even if the ACK actually committed before transport failed.
    try { return await source.acknowledgeFoundationAudit(claim!) ? "delivered" : "lease_lost" }
    catch { return "ack_unconfirmed" }
  }
  let canonical
  try {
    const result = await source.readClaimedFoundationAudit(claim)
    if (result.state === "lost") return "lease_lost"
    if (result.state !== "valid") return quarantine("SOURCE_INVALID")
    canonical = result.event
  } catch { return "source_unavailable" }
  try {
    const projected = projectFoundationAuditEvent(canonical)
    // Explicit canonical audit identity -> Index identity, never outbox row ID.
    if (projected.source_event_id !== canonical.id) return quarantine("SOURCE_INVALID")
    canonical = { id: projected.source_event_id, module: projected.source_module, organization_id: projected.organization_id,
      actor_person_id: projected.actor.person_id, actor_type: projected.actor.type, actor_id: projected.actor.id,
      role_context: projected.actor.role_context, action: projected.action, resource: projected.resource,
      target_id: projected.target_id, occurred_at: projected.occurred_at, deleted_at: null }
  } catch { return quarantine("ENVELOPE_INVALID") }
  let observed
  try { observed = await index.inspectFoundationAuditEvent(canonical) } catch { return defer(true) }
  if (observed === "matching") return acknowledge()
  if (observed === "conflict") return quarantine("INDEX_CONFLICT")
  // Fifth attempt's expired/ambiguous lease is reconciliation-only. Never sixth write.
  if (claim.reconcileOnly) return quarantine("ATTEMPTS_EXHAUSTED")
  try { await index.indexFoundationAuditEvent(canonical) } catch {
    // A rejected write can have committed before the response was lost. Re-read
    // committed contents before any final failure, not merely a matching ID.
    try { observed = await index.inspectFoundationAuditEvent(canonical) } catch { return defer(true) }
    if (observed === "matching") return acknowledge()
    if (observed === "conflict") return quarantine("INDEX_CONFLICT")
    return claim.attempt >= 5 ? quarantine("ATTEMPTS_EXHAUSTED") : defer()
  }
  return acknowledge()
}
