import { envelopeFingerprint, projectFoundationAuditEvent, validateAuditIndexEnvelope } from "../envelope"

export const source = () => ({
  id: "daaud_example", module: "dogruadres-access", organization_id: "daorg_example",
  actor_person_id: "daprs_example", actor_type: "user", actor_id: "user_example", role_context: "owner",
  action: "organization.membership_changed", resource: "membership", target_id: "damem_example",
  occurred_at: new Date("2026-10-18T00:00:00.000Z"), deleted_at: null,
})

describe("Audit Index version 1 validation and redaction", () => {
  it("preserves canonical source identity and normalizes a Date timestamp", () => {
    const e = projectFoundationAuditEvent(source())
    expect(e.source_event_id).toBe("daaud_example")
    expect(e.version).toBe(1)
    expect(e.occurred_at).toBe("2026-10-18T00:00:00.000Z")
    expect(validateAuditIndexEnvelope(e)).toEqual(e)
  })
  it("redacts by allowlist without copying personal or arbitrary audit values", () => {
    const e = projectFoundationAuditEvent({ ...source(), email: "synthetic@example.invalid", password: "do-not-project", invitation_token: "do-not-project",
      previous_values: { secret: "do-not-project" }, new_values: { arbitrary: "do-not-project" }, display_name: "do-not-project" })
    expect(JSON.stringify(e)).not.toContain("do-not-project")
    expect(JSON.stringify(e)).not.toContain("synthetic@example.invalid")
    expect(Object.keys(e).sort()).toEqual(["action", "actor", "occurred_at", "organization_id", "resource", "source_event_id", "source_module", "target_id", "version"])
  })
  it("strictly rejects extra wire-envelope fields including nested credentials", () => {
    const e = projectFoundationAuditEvent(source())
    expect(() => validateAuditIndexEnvelope({ ...e, email: "synthetic@example.invalid" })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
    expect(() => validateAuditIndexEnvelope({ ...e, actor: { ...e.actor, token: "do-not-project" } })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it.each([null, [], {}, { ...source(), module: "unregistered-module" }, { ...source(), deleted_at: new Date() },
    { ...source(), organization_id: null }, { ...source(), actor_id: "synthetic@example.invalid" }, { ...source(), occurred_at: new Date(NaN) },
    { ...source(), occurred_at: "2026-02-30T00:00:00.000Z" }, { ...source(), action: "unapproved.action" }, { ...source(), resource: "invitation" }])("fails closed for invalid source case %#", value => {
    expect(() => projectFoundationAuditEvent(value)).toThrow()
  })
  it("rejects unsupported wire versions and timestamps without canonical UTC", () => {
    const e = projectFoundationAuditEvent(source())
    expect(() => validateAuditIndexEnvelope({ ...e, version: 2 })).toThrow()
    expect(() => validateAuditIndexEnvelope({ ...e, occurred_at: "2026-10-18T02:00:00+02:00" })).toThrow()
  })
  it("does not reveal rejected input in validation errors", () => {
    expect(() => validateAuditIndexEnvelope({ token: "do-not-echo-this" })).toThrow(/^INVALID_AUDIT_INDEX_ENVELOPE$/)
  })
  it("fingerprints equal envelopes independently of input key insertion order", () => {
    const e = projectFoundationAuditEvent(source())
    expect(envelopeFingerprint(Object.fromEntries(Object.entries(e).reverse()))).toBe(envelopeFingerprint(e))
  })
})
