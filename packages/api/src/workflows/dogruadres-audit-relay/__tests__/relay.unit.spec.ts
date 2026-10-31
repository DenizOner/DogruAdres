import { relayOneFoundationAudit } from "../relay"
import type { OutboxClaim } from "../../../modules/dogruadres-access/audit-delivery-policy"

// Module-port doubles only: no DB/runner/worker, no claim of actual at-least-once
// transport, transaction identity, concurrent SKIP LOCKED or runtime acceptance.
function fixture(options: Partial<OutboxClaim> = {}) {
  const claim: OutboxClaim = { id: "daaob_test", leaseToken: "synthetic-lease", attempt: 1, reconcileOnly: false, ...options }
  const event = { id: "daaud_test", module: "dogruadres-access", actor_id: "user_test", actor_person_id: "daprs_test", actor_type: "user",
    role_context: "owner", organization_id: "daorg_test", action: "organization.membership_changed", resource: "membership", target_id: "damem_test", occurred_at: "2026-10-18T00:00:00.000Z" }
  const source = {
    claimFoundationAuditOutbox: jest.fn(async () => claim as OutboxClaim | null),
    readClaimedFoundationAudit: jest.fn(async (_claim: OutboxClaim) => ({ state: "valid" as "valid" | "invalid" | "lost", event })),
    acknowledgeFoundationAudit: jest.fn(async (_claim: OutboxClaim) => true),
    deferFoundationAudit: jest.fn(async (_claim: OutboxClaim, _code: unknown) => true),
    quarantineFoundationAudit: jest.fn(async (_claim: OutboxClaim, _code: unknown) => true),
  }
  const index = { inspectFoundationAuditEvent: jest.fn(async (_event: unknown) => "missing" as "matching" | "missing" | "conflict"), indexFoundationAuditEvent: jest.fn(async (_event: unknown) => ({ created: true })) }
  return { source, index, claim, event }
}
describe("Foundation outbox relay decisions (mocked, NOT database acceptance)", () => {
  it("acknowledges only after the independent Index call resolves", async () => {
    const f = fixture()
    expect(await relayOneFoundationAudit(f.source, f.index)).toBe("delivered")
    expect(f.index.indexFoundationAuditEvent.mock.invocationCallOrder[0]).toBeLessThan(f.source.acknowledgeFoundationAudit.mock.invocationCallOrder[0])
    expect(f.index.indexFoundationAuditEvent.mock.calls[0]).toHaveLength(1) // no source Context forwarded
  })
  it("handles a duplicate committed identity through content inspection without a write", async () => {
    const f = fixture(); f.index.inspectFoundationAuditEvent.mockResolvedValueOnce("matching")
    expect(await relayOneFoundationAudit(f.source, f.index)).toBe("delivered")
    expect(f.index.indexFoundationAuditEvent).not.toHaveBeenCalled()
  })
  it("accepts out-of-order event time without a timestamp checkpoint dropping events", async () => {
    const newer = fixture(), older = fixture({ id: "daaob_older" })
    older.event.id = "daaud_older"; older.event.occurred_at = "2026-01-01T00:00:00.000Z"
    expect(await relayOneFoundationAudit(newer.source, newer.index)).toBe("delivered")
    expect(await relayOneFoundationAudit(older.source, older.index)).toBe("delivered")
  })
  it("quarantines invalid provenance without using arbitrary event input", async () => {
    const f = fixture(); f.source.readClaimedFoundationAudit.mockResolvedValueOnce({ state: "invalid", event: f.event })
    expect(await relayOneFoundationAudit(f.source, f.index)).toBe("quarantined")
    expect(f.source.quarantineFoundationAudit).toHaveBeenCalledWith(f.claim,"SOURCE_INVALID")
    expect(f.index.indexFoundationAuditEvent).not.toHaveBeenCalled()
  })
  it("redacts unexpected attributes before crossing the Index boundary", async () => {
    const f = fixture(); Object.assign(f.event,{ password: "do-not-copy", previous_values: { token: "do-not-copy" } })
    await relayOneFoundationAudit(f.source,f.index)
    expect(JSON.stringify(f.index.indexFoundationAuditEvent.mock.calls)).not.toContain("do-not-copy")
    expect((f.index.indexFoundationAuditEvent.mock.calls[0][0] as {id: string}).id).toBe(f.event.id)
  })
  it("quarantines a contract rejection without Index mutation", async () => {
    const f = fixture(); f.event.action = "unknown.action"
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("quarantined")
    expect(f.source.quarantineFoundationAudit).toHaveBeenCalledWith(f.claim,"ENVELOPE_INVALID")
    expect(f.index.indexFoundationAuditEvent).not.toHaveBeenCalled()
  })
  it("defers during Index outage instead of acknowledging or losing source evidence", async () => {
    const f = fixture(); f.index.inspectFoundationAuditEvent.mockRejectedValueOnce(new Error("synthetic outage"))
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("deferred")
    expect(f.source.acknowledgeFoundationAudit).not.toHaveBeenCalled()
    expect(f.source.quarantineFoundationAudit).not.toHaveBeenCalled()
  })
  it("reconciles a write failure that actually committed", async () => {
    const f = fixture(); f.index.indexFoundationAuditEvent.mockRejectedValueOnce(new Error("synthetic lost response"))
    f.index.inspectFoundationAuditEvent.mockResolvedValueOnce("missing").mockResolvedValueOnce("matching")
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("delivered")
  })
  it("retries a failed uncommitted write only inside the five-attempt budget", async () => {
    const f = fixture(); f.index.indexFoundationAuditEvent.mockRejectedValueOnce(new Error("synthetic failure"))
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("deferred")
    expect(f.source.deferFoundationAudit).toHaveBeenCalledWith(f.claim,"INDEX_UNAVAILABLE")
  })
  it("checks Index absence before quarantining the fifth failed write", async () => {
    const f = fixture({ attempt: 5 }); f.index.indexFoundationAuditEvent.mockRejectedValueOnce(new Error("synthetic failure"))
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("quarantined")
    expect(f.index.inspectFoundationAuditEvent).toHaveBeenCalledTimes(2)
    expect(f.source.quarantineFoundationAudit).toHaveBeenCalledWith(f.claim,"ATTEMPTS_EXHAUSTED")
  })
  it("never performs a sixth write on an expired fifth-attempt lease", async () => {
    const f = fixture({ attempt: 5, reconcileOnly: true })
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("quarantined")
    expect(f.index.indexFoundationAuditEvent).not.toHaveBeenCalled()
  })
  it("recovers a committed fifth attempt despite expired acknowledgment lease", async () => {
    const f = fixture({ attempt: 5, reconcileOnly: true }); f.index.inspectFoundationAuditEvent.mockResolvedValueOnce("matching")
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("delivered")
    expect(f.index.indexFoundationAuditEvent).not.toHaveBeenCalled()
  })
  it("retains pending reconciliation when Index remains unreachable after five attempts", async () => {
    const f = fixture({ attempt: 5, reconcileOnly: true }); f.index.inspectFoundationAuditEvent.mockRejectedValueOnce(new Error("synthetic outage"))
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("deferred")
    expect(f.source.quarantineFoundationAudit).not.toHaveBeenCalled()
    expect(f.index.indexFoundationAuditEvent).not.toHaveBeenCalled()
  })
  it("recovers an ambiguous ACK on the next lease without a duplicate Index write", async () => {
    const f = fixture(); f.source.acknowledgeFoundationAudit.mockRejectedValueOnce(new Error("synthetic lost ack"))
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("ack_unconfirmed")
    f.source.claimFoundationAuditOutbox.mockResolvedValueOnce({ ...f.claim, leaseToken: "new-synthetic-lease", attempt: 2 })
    f.index.inspectFoundationAuditEvent.mockResolvedValueOnce("matching")
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("delivered")
    expect(f.index.indexFoundationAuditEvent).toHaveBeenCalledTimes(1)
  })
  it("rejects stale acknowledgments without altering another lease", async () => {
    const f = fixture(); f.source.acknowledgeFoundationAudit.mockResolvedValueOnce(false)
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("lease_lost")
    expect(f.source.deferFoundationAudit).not.toHaveBeenCalled()
  })
  it("does not overwrite a conflicting Index projection", async () => {
    const f = fixture(); f.index.inspectFoundationAuditEvent.mockResolvedValueOnce("conflict")
    expect(await relayOneFoundationAudit(f.source,f.index)).toBe("quarantined")
    expect(f.source.quarantineFoundationAudit).toHaveBeenCalledWith(f.claim,"INDEX_CONFLICT")
  })
})
