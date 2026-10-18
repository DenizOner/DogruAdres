import Service from "../service"
import { projectFoundationAuditEvent } from "../envelope"
import type { Context } from "@medusajs/framework/types"

// Method doubles prove control flow/context only; SQL uniqueness, transaction
// identity and concurrent delivery require a future isolated PostgreSQL test.
const source = () => ({ id: "daaud_example", module: "dogruadres-access", organization_id: "daorg_example", actor_person_id: "daprs_example",
  actor_type: "user", actor_id: "user_example", role_context: "owner", action: "organization.membership_changed", resource: "membership",
  target_id: "damem_example", occurred_at: new Date("2026-10-18T00:00:00.000Z") })
function fixture(existing: Record<string, unknown>[] = []) {
  const service = Object.create(Service.prototype) as Service
  const execute = jest.fn(async () => undefined)
  const list = jest.fn(async (_filter: unknown, _config?: unknown, _context?: Context) => existing)
  const create = jest.fn(async (rows: Record<string, unknown>[], _context?: Context) => rows.map(row => ({ ...row, id: "daidx_example" })))
  Object.assign(service, { listAuditIndexEntries: list, createAuditIndexEntries: create })
  const context = { transactionManager: { execute } } as unknown as Context
  return { service, execute, list, create, context }
}
describe("Audit Index internal service persistence foundation", () => {
  it("indexes only projected fields with server-owned indexing time and same context", async () => {
    const f = fixture(), before = Date.now()
    const result = await f.service.indexFoundationAuditEvent({ ...source(), indexed_at: "client-value", password: "do-not-project" }, f.context)
    expect(result.created).toBe(true)
    expect(f.execute).toHaveBeenCalledTimes(1)
    expect(f.list.mock.calls[0][1]).toEqual({ withDeleted: true })
    expect(f.list.mock.calls[0][2]).toBe(f.context)
    expect(f.create.mock.calls[0][1]).toBe(f.context)
    const row = f.create.mock.calls[0][0][0]
    expect(row.source_event_id).toBe(source().id)
    expect((row.indexed_at as Date).getTime()).toBeGreaterThanOrEqual(before)
    expect(JSON.stringify(row)).not.toContain("do-not-project")
  })
  it("returns an identical retry without inserting a second identity", async () => {
    const f = fixture([{ id: "daidx_existing", envelope: projectFoundationAuditEvent(source()), deleted_at: null }])
    const result = await f.service.indexFoundationAuditEvent(source(), f.context)
    expect(result.created).toBe(false)
    expect(f.create).not.toHaveBeenCalled()
  })
  it.each(["different-payload", "soft-deleted", "ambiguous"])("rejects duplicate identity with %s", async kind => {
    const entry = { envelope: projectFoundationAuditEvent(source()), deleted_at: kind === "soft-deleted" ? new Date() : null }
    const rows = kind === "ambiguous" ? [entry, entry] : [entry]
    const f = fixture(rows)
    await expect(f.service.indexFoundationAuditEvent(kind === "different-payload" ? { ...source(), target_id: "damem_other" } : source(), f.context)).rejects.toThrow()
    expect(f.create).not.toHaveBeenCalled()
  })
  it("rejects invalid input before locking or persistence", async () => {
    const f = fixture()
    await expect(f.service.indexFoundationAuditEvent({}, f.context)).rejects.toThrow()
    expect(f.execute).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled()
  })
  it("does not swallow an index persistence failure", async () => {
    const f = fixture(); f.create.mockRejectedValueOnce(new Error("synthetic write failure"))
    await expect(f.service.indexFoundationAuditEvent(source(), f.context)).rejects.toThrow("synthetic write failure")
  })
})
