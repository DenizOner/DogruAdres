import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import { AuditIndexEntry } from "./models"
import { matchesAuditIndexProjection, projectFoundationAuditEvent } from "./envelope"

type LockManager = { execute(query: string, parameters: string[]): Promise<unknown> }

export default class AuditIndexModuleService extends MedusaService({ AuditIndexEntry }) {
  // Fresh Index-owned read transaction; caller must NOT pass source context.
  @InjectTransactionManager()
  async inspectFoundationAuditEvent(sourceEvent: unknown, @MedusaContext() sharedContext: Context = {}) {
    const envelope = projectFoundationAuditEvent(sourceEvent)
    const transaction = sharedContext.transactionManager as LockManager | undefined
    if (!transaction) throw new Error("AUDIT_INDEX_TRANSACTION_REQUIRED")
    await transaction.execute("SELECT pg_advisory_xact_lock(hashtext('dogruadres-audit-index'), hashtext(?))", [JSON.stringify([envelope.source_module, envelope.source_event_id])])
    const rows = await this.listAuditIndexEntries({ source_module: envelope.source_module, source_event_id: envelope.source_event_id }, { withDeleted: true }, sharedContext)
    if (!rows.length) return "missing" as const
    return rows.length === 1 && matchesAuditIndexProjection(rows[0], envelope) ? "matching" as const : "conflict" as const
  }
  // Internal persistence boundary only. The future AF-2B relay must obtain the
  // committed canonical event through supported source interfaces and authenticate
  // its provenance; field validation is NOT source authentication. No HTTP route.
  // Generated CRUD is infrastructure plumbing, not an untrusted ingestion API.
  @InjectTransactionManager()
  async indexFoundationAuditEvent(sourceEvent: unknown, @MedusaContext() sharedContext: Context = {}) {
    const envelope = projectFoundationAuditEvent(sourceEvent)
    const transaction = sharedContext.transactionManager as LockManager | undefined
    if (!transaction) throw new Error("AUDIT_INDEX_TRANSACTION_REQUIRED")
    // Index-owned manager only. Never forward a source module EntityManager.
    // Serialize retries for the same identity, then re-read persisted projection.
    await transaction.execute("SELECT pg_advisory_xact_lock(hashtext('dogruadres-audit-index'), hashtext(?))", [JSON.stringify([envelope.source_module, envelope.source_event_id])])
    const existing = await this.listAuditIndexEntries({ source_module: envelope.source_module, source_event_id: envelope.source_event_id }, { withDeleted: true }, sharedContext)
    if (existing.length > 1) throw new Error("AUDIT_INDEX_IDENTITY_AMBIGUOUS")
    if (existing.length) {
      // Never resurrect or overwrite a mismatching source identity silently.
      if (!matchesAuditIndexProjection(existing[0], envelope)) throw new Error("AUDIT_INDEX_IDENTITY_CONFLICT")
      return { entry: existing[0], created: false }
    }
    const [entry] = await this.createAuditIndexEntries([{
      source_module: envelope.source_module, source_event_id: envelope.source_event_id,
      envelope_version: envelope.version, organization_id: envelope.organization_id,
      actor_person_id: envelope.actor.person_id, actor_type: envelope.actor.type, actor_id: envelope.actor.id,
      action: envelope.action, resource: envelope.resource, target_id: envelope.target_id,
      occurred_at: new Date(envelope.occurred_at), indexed_at: new Date(), envelope,
    }], sharedContext)
    return { entry, created: true }
  }
}
