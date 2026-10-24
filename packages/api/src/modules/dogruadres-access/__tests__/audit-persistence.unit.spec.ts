import type { Context } from "@medusajs/framework/types"
import { randomBytes } from "node:crypto"
import AccessService, { DOGRUADRES_AUDIT_MODULE } from "../service"
import { hashInvitationToken } from "../security"

// Isolated method doubles test context/cardinality/error propagation, NOT SQL
// rollback or the trigger. No module/container/bootstrap/database is initialized.
function fixture() {
  const context = { transactionManager: { execute: jest.fn(async () => []), flush: jest.fn(async () => undefined) } } as unknown as Context
  const service = Object.create(AccessService.prototype) as AccessService
  const audits = jest.fn(async (data: Record<string, unknown>[], _context?: Context) => data.map((event, index) => ({ ...event, id: `audit_${index}` })))
  const outbox = jest.fn(async (data: Record<string, unknown>[], _context?: Context) => data.map((event, index) => ({ ...event, id: `outbox_${index}` })))
  const organizations = jest.fn(async (_data: unknown, _context?: Context) => [{ id: "org_test", name: "Test", status: "active" }])
  const memberships = jest.fn(async (data: Record<string, unknown>[], _context?: Context) => data.map((value, index) => ({ ...value, id: `membership_${index}` })))
  const invitation = { id: "invitation_test", organization_id: "org_test", role: "member", status: "pending", expires_at: new Date(Date.now() + 60000), recipient_email: "recipient@example.invalid", token_hash: hashInvitationToken("unit-token") }
  Object.assign(service, {
    createAuditEvents: audits, createAuditOutboxes: outbox, createOrganizations: organizations, createMemberships: memberships,
    lockActor_: jest.fn(async () => undefined),
    ensureActorPerson_: jest.fn(async (actor: { actor_id: string }) => ({ id: `person_${actor.actor_id}` })),
    getActiveMembership: jest.fn(async () => ({ id: "owner", role: "owner", status: "active", protected_owner: true })),
    getMembershipInOrganization: jest.fn(async () => ({ id: "member_target", person_id: "target", role: "member", status: "active", protected_owner: false })),
    getOrganization: jest.fn(async () => ({ id: "org_test" })), listPeople: jest.fn(async () => [{ id: "person_owner" }]),
    updateMemberships: jest.fn(async (data: Record<string, unknown>) => data),
    createInvitations: jest.fn(async () => [invitation]), updateInvitations: jest.fn(async (data: Record<string, unknown>) => ({ ...invitation, ...data })),
    getInvitationInOrganization: jest.fn(async () => invitation), listInvitations: jest.fn(async () => [invitation]), listMemberships: jest.fn(async () => []),
  })
  return { service, context, audits, outbox, organizations, memberships }
}
const actor = { actor_id: "owner", actor_type: "user" }
const provision = (f: ReturnType<typeof fixture>) => f.service.provisionOrganization({ name: "Test", provisioned_by: actor, initial_owners: [actor, { actor_id: "second", actor_type: "user" }] }, f.context)

describe("Foundation canonical audit and outbox persistence contract", () => {
  let oldSecret: string | undefined
  beforeEach(() => { oldSecret = process.env.DOGRUADRES_INVITATION_SECRET; process.env.DOGRUADRES_INVITATION_SECRET = randomBytes(32).toString("hex") })
  afterEach(() => { if (oldSecret === undefined) delete process.env.DOGRUADRES_INVITATION_SECRET; else process.env.DOGRUADRES_INVITATION_SECRET = oldSecret })

  it("writes one provisioning audit plus one per initial Owner, linked one-to-one to outbox", async () => {
    const f = fixture()
    await provision(f)
    expect(f.audits.mock.calls[0][0].map(event => event.action)).toEqual(["organization.provisioned", "organization.owner_assigned", "organization.owner_assigned"])
    expect(f.outbox.mock.calls[0][0].map(row => row.source_audit_event_id)).toEqual(["audit_0", "audit_1", "audit_2"])
    for (const mock of [f.organizations, f.memberships, f.audits, f.outbox]) expect(mock.mock.calls[0][1]).toBe(f.context)
  })

  it("uses the same audit/outbox integration for the other four mutation paths", async () => {
    const f = fixture()
    const input = { organization_id: "org_test", actor_person_id: "person_owner", actor_type: "user", actor_id: "owner" }
    await f.service.changeMembership({ ...input, membership_id: "member_target", role: "admin" }, f.context)
    await f.service.createOrganizationInvitation({ ...input, email: "recipient@example.invalid", role: "member" }, f.context)
    await f.service.revokeOrganizationInvitation({ ...input, invitation_id: "invitation_test" }, f.context)
    await f.service.acceptOrganizationInvitation({ token: "unit-token", email: "recipient@example.invalid", email_verified: true, actor }, f.context)
    expect(f.audits.mock.calls.map(call => call[0][0].action)).toEqual([
      "organization.membership_changed", "organization.invitation_created", "organization.invitation_revoked", "organization.invitation_accepted",
    ])
    expect(f.outbox).toHaveBeenCalledTimes(4)
    for (const call of [...f.audits.mock.calls, ...f.outbox.mock.calls]) { expect(call[0]).toHaveLength(1); expect(call[1]).toBe(f.context) }
  })

  it("allowlists the envelope and excludes arbitrary before/after values and secrets", async () => {
    const f = fixture()
    const persist = Reflect.get(f.service, "persistAuditEventsWithOutbox_")
    await persist.call(f.service, [{ actor_person_id: "person_owner", actor_type: "user", actor_id: "owner", module: DOGRUADRES_AUDIT_MODULE,
      action: "organization.membership_changed", resource: "membership", occurred_at: new Date("2026-10-18T00:00:00.000Z"),
      previous_values: { password: "synthetic-do-not-project" }, new_values: { token: "synthetic-do-not-project", email: "private@example.invalid" } }], f.context)
    const row = f.outbox.mock.calls[0][0][0]
    expect(row).toEqual(expect.objectContaining({ source_module: DOGRUADRES_AUDIT_MODULE, source_audit_event_id: "audit_0", envelope_version: 1, status: "pending" }))
    expect(Object.keys(row.envelope as object).sort()).toEqual(["action", "actor", "occurred_at", "organization_id", "resource", "source_audit_event_id", "source_module", "target_id", "version"])
    expect(JSON.stringify(row)).not.toContain("synthetic-do-not-project")
    expect(JSON.stringify(row)).not.toContain("private@example.invalid")
    expect(JSON.stringify(row)).not.toContain("previous_values")
    expect(JSON.stringify(row)).not.toContain("new_values")
  })

  it("refuses audit/outbox writes without the caller transaction", async () => {
    const f = fixture()
    await expect(Reflect.get(f.service, "persistAuditEventsWithOutbox_").call(f.service, [{}], {})).rejects.toThrow("active transaction")
    expect(f.audits).not.toHaveBeenCalled(); expect(f.outbox).not.toHaveBeenCalled()
  })

  it("propagates a domain failure without writing audit or outbox", async () => {
    const f = fixture(); f.organizations.mockRejectedValueOnce(new Error("synthetic domain failure"))
    await expect(provision(f)).rejects.toThrow("synthetic domain failure")
    expect(f.audits).not.toHaveBeenCalled(); expect(f.outbox).not.toHaveBeenCalled()
  })

  it("propagates audit failure and does not attempt outbox", async () => {
    const f = fixture(); f.audits.mockRejectedValueOnce(new Error("synthetic audit failure"))
    await expect(provision(f)).rejects.toThrow("synthetic audit failure")
    expect(f.outbox).not.toHaveBeenCalled()
  })

  it("propagates outbox failure rather than returning business success", async () => {
    const f = fixture(); f.outbox.mockRejectedValueOnce(new Error("synthetic outbox failure"))
    await expect(provision(f)).rejects.toThrow("synthetic outbox failure")
    expect(f.audits).toHaveBeenCalledTimes(1)
  })

  it("rejects incomplete canonical audit cardinality before outbox", async () => {
    const f = fixture(); f.audits.mockResolvedValueOnce([])
    await expect(provision(f)).rejects.toThrow("audit cardinality")
    expect(f.outbox).not.toHaveBeenCalled()
  })

  it("rejects duplicated canonical IDs before outbox", async () => {
    const f = fixture()
    f.audits.mockImplementationOnce(async data => data.map(event => ({ ...event, id: "duplicate" })))
    await expect(provision(f)).rejects.toThrow("audit cardinality")
    expect(f.outbox).not.toHaveBeenCalled()
  })
  it("rejects incomplete outbox cardinality", async () => {
    const f = fixture(); f.outbox.mockResolvedValueOnce([])
    await expect(provision(f)).rejects.toThrow("outbox cardinality")
  })
})
