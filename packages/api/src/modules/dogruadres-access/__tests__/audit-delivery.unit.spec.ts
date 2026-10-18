import { claimAuditDelivery, acknowledgeAuditDelivery, deferAuditDelivery, quarantineAuditDelivery, loadClaimedAuditEvent } from "../audit-delivery"
import { canonicalEventForOutbox, retryDelaySeconds } from "../audit-delivery-policy"

// SQL doubles validate SQL/argument/fencing contracts, NOT real row locking,
// concurrent transactions, PostgreSQL CHECK constraints or physical rollback.
const claim = { id: "daaob_test", leaseToken: "synthetic-lease", attempt: 1, reconcileOnly: false }
const event = () => ({ id: "daaud_test", module: "dogruadres-access", actor_id: "user_test", actor_person_id: "daprs_test", actor_type: "user",
  role_context: "owner", organization_id: "daorg_test", action: "organization.membership_changed", resource: "membership", target_id: "damem_test", occurred_at: "2026-10-18T00:00:00.000Z", deleted_at: null })
function outbox() {
  const a = event()
  return { source_module: a.module, source_audit_event_id: a.id, envelope_version: 1, envelope: { version: 1, source_module: a.module, source_audit_event_id: a.id,
    organization_id: a.organization_id, actor: { person_id: a.actor_person_id, type: a.actor_type, id: a.actor_id, role_context: a.role_context },
    action: a.action, resource: a.resource, target_id: a.target_id, occurred_at: a.occurred_at } }
}
describe("Foundation durable delivery contracts (mocked; PostgreSQL NOT TESTED)", () => {
  it("claims with one atomic locked update and durable accounting", async () => {
    const execute = jest.fn(async (_sql: string, _args?: unknown[]) => [{ id: claim.id, lease_token: "fresh-token", attempt_count: 1, reconcile_only: false }])
    expect(await claimAuditDelivery({ execute })).toEqual({ ...claim, leaseToken: "fresh-token" })
    expect(execute).toHaveBeenCalledTimes(1)
    const sql = execute.mock.calls[0][0]
    expect(sql).toContain("FOR UPDATE SKIP LOCKED")
    expect(sql).toContain("attempt_count+1")
    expect(sql).toContain("lease_expires_at<=now()")
    expect(sql).toContain("next_attempt_at<=now()")
    expect(execute.mock.calls[0][1]?.[0]).toMatch(/^[a-f0-9-]{36}$/)
  })
  it("does not manufacture a claim when the locking query returns no eligible row", async () => {
    expect(await claimAuditDelivery({ execute: jest.fn(async () => []) })).toBeNull()
  })
  it("delegates competing mock claims to SQL and never invents a second row", async () => {
    const execute = jest.fn(async (_sql: string, _args?: unknown[]): Promise<Record<string, any>[]> => [])
    execute.mockResolvedValueOnce([{ id: claim.id, lease_token: "one-token", attempt_count: 1, reconcile_only: false }])
    const results = await Promise.all([claimAuditDelivery({ execute }), claimAuditDelivery({ execute })])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(execute).toHaveBeenCalledTimes(2)
    // The mock's single row is NOT evidence that PostgreSQL actually serializes.
    expect(execute.mock.calls.every(([sql]) => sql.includes("SKIP LOCKED"))).toBe(true)
  })
  it("preserves fifth-attempt accounting for a reconciliation-only expired lease", async () => {
    const execute = jest.fn(async () => [{ id: claim.id, lease_token: "reconcile-token", attempt_count: 5, reconcile_only: true }])
    const result = await claimAuditDelivery({ execute })
    expect(result?.attempt).toBe(5); expect(result?.reconcileOnly).toBe(true)
    expect(result?.leaseToken).not.toBe(claim.leaseToken)
  })
  it("fences acknowledgment by pending state, token and unexpired DB lease", async () => {
    const execute = jest.fn(async (_sql: string, _args?: unknown[]) => [])
    expect(await acknowledgeAuditDelivery({ execute }, claim)).toBe(false)
    const [sql, args] = execute.mock.calls[0]
    expect(args).toEqual([claim.id, claim.leaseToken])
    expect(sql).toContain("lease_expires_at>now()")
    expect(sql).toContain("status='pending'")
  })
  it("bounds all five backoff delays and rejects a sixth delivery attempt", () => {
    expect([1,2,3,4,5].map(retryDelaySeconds)).toEqual([30,60,120,240,480])
    for (const invalid of [0,6,NaN,1.5]) expect(() => retryDelaySeconds(invalid)).toThrow()
  })
  it("persists only safe retry codes and releases the matching lease", async () => {
    const execute = jest.fn(async (_sql: string, _args?: unknown[]) => [{ id: claim.id }])
    expect(await deferAuditDelivery({ execute }, claim, "RECONCILIATION_DEFERRED")).toBe(true)
    expect(execute.mock.calls[0][1]).toEqual([900,30,"RECONCILIATION_DEFERRED",claim.id,claim.leaseToken])
    await expect(quarantineAuditDelivery({ execute }, claim, "INDEX_UNAVAILABLE")).rejects.toThrow("INVALID_DELIVERY_ERROR_CODE")
  })
  it("verifies source linkage/module/version and exact canonical envelope contents", () => {
    const a = event(), o = outbox()
    expect(canonicalEventForOutbox(o, a)?.id).toBe(a.id)
    for (const bad of [{ ...o, source_audit_event_id: "foreign" }, { ...o, source_module: "foreign" }, { ...o, envelope_version: 2 }, { ...o, envelope: {} }]) expect(canonicalEventForOutbox(bad, a)).toBeNull()
    expect(canonicalEventForOutbox(o, { ...a, deleted_at: new Date() })).toBeNull()
    expect(canonicalEventForOutbox(o, null)).toBeNull()
  })
  it("removes arbitrary canonical payload values at the source boundary", () => {
    const safe = canonicalEventForOutbox(outbox(), { ...event(), password: "do-not-copy", previous_values: { token: "do-not-copy" } })
    expect(JSON.stringify(safe)).not.toContain("do-not-copy")
  })
  it("does not resolve canonical data for a lost lease", async () => {
    expect(await loadClaimedAuditEvent({ execute: jest.fn(async () => []) }, claim)).toEqual({ state: "lost" })
  })
})
