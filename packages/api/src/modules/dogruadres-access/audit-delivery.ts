import { randomUUID } from "node:crypto"
import { AUDIT_DELIVERY, DELIVERY_ERROR_CODES, canonicalEventForOutbox, type OutboxClaim, type DeliveryErrorCode } from "./audit-delivery-policy"

export type DeliveryManager = { execute(query: string, parameters?: unknown[]): Promise<Record<string, any>[]> }
export async function claimAuditDelivery(tx: DeliveryManager): Promise<OutboxClaim | null> {
  const rows = await tx.execute(`WITH candidate AS (
    SELECT id, attempt_count FROM da_audit_outbox
    WHERE deleted_at IS NULL AND status='pending'
      AND (next_attempt_at IS NULL OR next_attempt_at<=now())
      AND (lease_expires_at IS NULL OR lease_expires_at<=now())
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE da_audit_outbox o SET
    attempt_count=CASE WHEN o.attempt_count<5 THEN o.attempt_count+1 ELSE o.attempt_count END,
    lease_token=?, lease_expires_at=now()+(? * interval '1 second'), updated_at=now()
    FROM candidate c WHERE o.id=c.id
    RETURNING o.id,o.lease_token,o.attempt_count,(c.attempt_count>=5) AS reconcile_only`, [randomUUID(), AUDIT_DELIVERY.leaseSeconds])
  if (!rows.length) return null
  const row = rows[0]
  return { id: row.id, leaseToken: row.lease_token, attempt: row.attempt_count, reconcileOnly: row.reconcile_only }
}
export async function loadClaimedAuditEvent(tx: DeliveryManager, claim: OutboxClaim) {
  const rows = await tx.execute(`SELECT o.*,to_jsonb(a) AS canonical_event FROM da_audit_outbox o
    LEFT JOIN da_audit_event a ON a.id=o.source_audit_event_id
    WHERE o.id=? AND o.lease_token=? AND o.status='pending' AND o.deleted_at IS NULL AND o.lease_expires_at>now()
    FOR UPDATE OF o`, [claim.id, claim.leaseToken])
  if (!rows.length) return { state: "lost" as const }
  const event = canonicalEventForOutbox(rows[0], rows[0].canonical_event)
  return event ? { state: "valid" as const, event } : { state: "invalid" as const }
}
export async function acknowledgeAuditDelivery(tx: DeliveryManager, claim: OutboxClaim) {
  const rows = await tx.execute(`UPDATE da_audit_outbox SET status='delivered',delivered_at=now(),
    next_attempt_at=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=now()
    WHERE id=? AND lease_token=? AND lease_expires_at>now() AND status='pending' AND deleted_at IS NULL RETURNING id`, [claim.id, claim.leaseToken])
  return rows.length === 1
}
export async function deferAuditDelivery(tx: DeliveryManager, claim: OutboxClaim, code: DeliveryErrorCode) {
  if (!["INDEX_UNAVAILABLE", "RECONCILIATION_DEFERRED"].includes(code)) throw new Error("INVALID_DELIVERY_ERROR_CODE")
  const rows = await tx.execute(`UPDATE da_audit_outbox SET next_attempt_at=now()+
    (LEAST(?, ? * power(2,attempt_count-1)) * interval '1 second'),
    lease_token=NULL,lease_expires_at=NULL,last_error_code=?,updated_at=now()
    WHERE id=? AND lease_token=? AND lease_expires_at>now() AND status='pending' AND deleted_at IS NULL RETURNING id`,
    [AUDIT_DELIVERY.maxDelaySeconds, AUDIT_DELIVERY.baseDelaySeconds, code, claim.id, claim.leaseToken])
  return rows.length === 1
}
export async function quarantineAuditDelivery(tx: DeliveryManager, claim: OutboxClaim, code: DeliveryErrorCode) {
  if (!DELIVERY_ERROR_CODES.includes(code) || ["INDEX_UNAVAILABLE", "RECONCILIATION_DEFERRED"].includes(code)) throw new Error("INVALID_DELIVERY_ERROR_CODE")
  // Integration must first inspect Index contents for ambiguous/exhausted delivery.
  // Source corruption is a permanent provenance failure, never proof of delivery.
  const rows = await tx.execute(`UPDATE da_audit_outbox SET status='quarantined',next_attempt_at=NULL,
    lease_token=NULL,lease_expires_at=NULL,last_error_code=?,updated_at=now()
    WHERE id=? AND lease_token=? AND lease_expires_at>now() AND status='pending' AND deleted_at IS NULL
      AND (? <> 'ATTEMPTS_EXHAUSTED' OR attempt_count=5) RETURNING id`, [code, claim.id, claim.leaseToken, code])
  return rows.length === 1
}
