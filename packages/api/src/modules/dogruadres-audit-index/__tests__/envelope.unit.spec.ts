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
  it.each([
    ["organization.provisioned", "organization", "daorg_example"],
    ["organization.owner_assigned", "membership", "damem_example"],
  ])("accepts canonical Platform Staff %s without projecting private fields", (action, resource, targetId) => {
    const e = projectFoundationAuditEvent({
      ...source(), role_context: "platform_staff", action, resource, target_id: targetId,
      staff_grant_id: "private-grant", password: "do-not-project",
    })
    expect(e.actor.role_context).toBe("platform_staff")
    expect(e.action).toBe(action)
    expect(e.resource).toBe(resource)
    expect(e.target_id).toBe(targetId)
    expect(validateAuditIndexEnvelope(e)).toEqual(e)
    expect(JSON.stringify(e)).not.toContain("private-grant")
    expect(JSON.stringify(e)).not.toContain("do-not-project")
  })
  it.each([
    ["organization.membership_changed", "membership"],
    ["organization.invitation_created", "invitation"],
    ["organization.invitation_revoked", "invitation"],
    ["organization.invitation_accepted", "invitation"],
  ])("rejects Platform Staff paired with unrelated %s despite a valid resource", (action, resource) => {
    const legitimate = projectFoundationAuditEvent({
      ...source(), role_context: "owner", action, resource, target_id: "damem_example",
    })
    expect(validateAuditIndexEnvelope(legitimate)).toEqual(legitimate)
    expect(() => projectFoundationAuditEvent({
      ...source(), role_context: "platform_staff", action, resource, target_id: "damem_example",
    })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
    expect(() => validateAuditIndexEnvelope({
      ...legitimate, actor: { ...legitimate.actor, role_context: "platform_staff" },
    })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it.each(["organization.store_owner_paused","organization.store_owner_resumed"])(
    "indexes an Owner %s with correct Store scope and no private fields",action=>{
      const event={...source(),action,resource:"store-owner-pause",target_id:"sel_owner_store",
        previous_values:{token:"private-pause-token"},
        new_values:{request_id:"dasp_"+"a".repeat(32),reason:"private-pause-reason"}}
      const envelope=projectFoundationAuditEvent(event)
      expect(envelope.action).toBe(action)
      expect(envelope.resource).toBe("store-owner-pause")
      expect(envelope.target_id).toBe("sel_owner_store")
      expect(validateAuditIndexEnvelope(envelope)).toEqual(envelope)
      expect(JSON.stringify(envelope)).not.toContain("private-pause")
      for(const change of [{role_context:"member"},{role_context:"platform_staff"},
        {role_context:"admin"},{organization_id:"foreign"},
        {target_id:"not_a_seller"},{resource:"membership"}])
        expect(()=>projectFoundationAuditEvent({...event,...change}))
          .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
      expect(()=>validateAuditIndexEnvelope({...envelope,
        actor:{...envelope.actor,role_context:"platform_staff"}}))
        .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
    })
  it.each(["organization.store_owner_closing_started",
    "organization.store_owner_closing_withdrawn"])(
    "accepts only a protected Owner Store-closing envelope and redacts private values: %s",action=>{
      const event={...source(),action,resource:"store-owner-closing",target_id:"sel_owner_store",
        previous_values:{secret:"private-closing-secret"},
        new_values:{request_id:"dasc_"+"a".repeat(32),due_at:"2026-12-10T00:00:00.000Z",
          email:"private-closing-email"}}
      const envelope=projectFoundationAuditEvent(event)
      expect(envelope.action).toBe(action)
      expect(envelope.resource).toBe("store-owner-closing")
      expect(validateAuditIndexEnvelope(envelope)).toEqual(envelope)
      expect(JSON.stringify(envelope)).not.toContain("private-closing")
      for(const change of [{role_context:"member"},{role_context:"platform_staff"},
        {role_context:"admin"},{organization_id:"foreign"},
        {target_id:"not_a_seller"},{resource:"store-owner-pause"}])
        expect(()=>projectFoundationAuditEvent({...event,...change}))
          .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
    })
  it.each([
    ["organization.store_platform_closing_started","platform_staff"],
    ["organization.store_platform_closing_appealed","owner"]
  ])("accepts separate platform closing/Owner appeal source with private reasons omitted", (action,role)=>{
    const event={...source(),role_context:role,action,
      resource:"store-platform-closing",target_id:"sel_platform_stage1",
      new_values:{reason:"confidential-reason",reason_sha256:"fingerprint-only"},
      previous_values:{email:"private-owner-email"}}
    const envelope=projectFoundationAuditEvent(event)
    expect(envelope.action).toBe(action)
    expect(envelope.actor.role_context).toBe(role)
    expect(validateAuditIndexEnvelope(envelope)).toEqual(envelope)
    expect(JSON.stringify(envelope)).not.toContain("confidential-reason")
    expect(JSON.stringify(envelope)).not.toContain("private-owner-email")
    for(const wrongRole of ["member","admin",
      role==="owner"?"platform_staff":"owner"]){
      expect(()=>projectFoundationAuditEvent({...event,role_context:wrongRole}))
        .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
    }
    expect(()=>projectFoundationAuditEvent({...event,organization_id:"foreign"}))
      .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it.each(["organization.store_followed","organization.store_unfollowed"])(
    "projects a canonical Owner %s without private source data", action => {
      const e = projectFoundationAuditEvent({
        ...source(), action, resource:"buyer-store-follow", target_id:"sel_followed",
        previous_values:{secret:"private"},new_values:{price:"private"},
      })
      expect(e.action).toBe(action)
      expect(e.resource).toBe("buyer-store-follow")
      expect(e.target_id).toBe("sel_followed")
      expect(JSON.stringify(e)).not.toContain("private")
      expect(validateAuditIndexEnvelope(e)).toEqual(e)
      expect(() => projectFoundationAuditEvent({
        ...source(), action, resource:"membership",target_id:"sel_followed"
      })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
      expect(() => projectFoundationAuditEvent({
        ...source(), action, resource:"buyer-store-follow",target_id:"sel_followed",
        role_context:"member"
      })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
      expect(() => projectFoundationAuditEvent({
        ...source(), action, resource:"buyer-store-follow",target_id:"sel_followed",
        role_context:"platform_staff"
      })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
      expect(() => projectFoundationAuditEvent({
        ...source(), action, resource:"buyer-store-follow",target_id:"not_a_seller"
      })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
    })
  it.each(["organization.store_application_right_disabled",
    "organization.store_application_right_enabled"])(
    "indexes a canonical Staff company policy %s with private reason/grant redacted", action => {
      // IdentitySessions.staff() grants a Person-scoped task to strong sessions
      // of any of these three verified native actor types.
      for(const actorType of ["user","member","customer"] as const) {
        const event={
          ...source(),actor_type:actorType,role_context:"platform_staff",
          action,resource:"organization",target_id:"daorg_example",
          previous_values:{secret:"do-not-project"},
          new_values:{reason:"do-not-project",staff_grant_id:"do-not-project"},
        }
        const projected=projectFoundationAuditEvent(event)
        expect(projected.actor.role_context).toBe("platform_staff")
        expect(projected.actor.type).toBe(actorType)
        expect(projected.action).toBe(action)
        expect(projected.resource).toBe("organization")
        expect(projected.target_id).toBe(projected.organization_id)
        expect(validateAuditIndexEnvelope(projected)).toEqual(projected)
        expect(JSON.stringify(projected)).not.toContain("do-not-project")
        expect(Object.keys(projected).sort()).toEqual([
          "action","actor","occurred_at","organization_id","resource",
          "source_event_id","source_module","target_id","version"])
        for(const change of [
          {role_context:"owner"}, {role_context:"member"},
          {target_id:"daorg_foreign"}, {resource:"membership"},
          {organization_id:"wrong_scope"}, {actor_type:"administrator"},
        ]) expect(() => projectFoundationAuditEvent({...event,...change}))
          .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
      }
    })
  it("indexes private Store draft saves by Owner or explicitly granted Member without content",()=>{
    const data={...source(),action:"organization.store_application_draft_saved",
      resource:"store-application-draft",target_id:"dasdraft_"+"a".repeat(32),
      previous_values:{email:"hidden@example.invalid"},
      new_values:{name:"private example"}}
    const envelope=projectFoundationAuditEvent(data)
    expect(envelope.target_id).toBe(data.target_id)
    expect(JSON.stringify(envelope)).not.toContain("hidden@example.invalid")
    expect(JSON.stringify(envelope)).not.toContain("private example")
    expect(projectFoundationAuditEvent({...data,role_context:"member"}).actor.role_context).toBe("member")
    for(const changed of [{role_context:"platform_staff"},
      {target_id:"dasdraft_invalid"},{resource:"organization"},{organization_id:"bad"}])
      expect(()=>projectFoundationAuditEvent({...data,...changed}))
        .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it.each([
    "organization.store_draft_permission_granted",
    "organization.store_draft_permission_revoked"
  ])("only indexes Owner Member-grant changes without private data: %s",action=>{
    const sourceEvent={...source(),action,resource:"store-draft-permission",
      target_id:"daprs_target",new_values:{name:"private-name",email:"secret@example.invalid"}}
    const projected=projectFoundationAuditEvent(sourceEvent)
    expect(projected.action).toBe(action)
    expect(projected.actor.role_context).toBe("owner")
    expect(JSON.stringify(projected)).not.toContain("private-name")
    expect(JSON.stringify(projected)).not.toContain("secret@example.invalid")
    for(const change of [{role_context:"member"},{role_context:"admin"},
      {organization_id:"foreign"},{target_id:"sel_wrong"},{resource:"membership"}])
      expect(()=>projectFoundationAuditEvent({...sourceEvent,...change}))
        .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it("redacts private Staff Store rejection reason and denies forged Owner roles",()=>{
    const event={...source(),role_context:"platform_staff",
      action:"organization.store_application_rejected",
      resource:"store-application",target_id:"sel_pending_store",
      new_values:{reason:"PRIVATE-REVIEW-MESSAGE",staff_grant_id:"PRIVATE-GRANT"},
      previous_values:{name:"PRIVATE-NAME"}}
    const envelope=projectFoundationAuditEvent(event)
    expect(envelope.action).toBe("organization.store_application_rejected")
    expect(envelope.actor.role_context).toBe("platform_staff")
    expect(envelope.target_id).toBe("sel_pending_store")
    expect(JSON.stringify(envelope)).not.toContain("PRIVATE-")
    expect(validateAuditIndexEnvelope(envelope)).toEqual(envelope)
    for(const change of [{role_context:"owner"},{role_context:"member"},
      {resource:"membership"},{target_id:"not_a_seller"},
      {organization_id:"foreign"}])
      expect(()=>projectFoundationAuditEvent({...event,...change}))
        .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it.each(["organization.store_reactivation_claimed","organization.store_reactivation_released","organization.store_reactivated"])(
    "indexes only authorized Staff reactivation events without internal name, claim, reason or grant: %s",action=>{
    const event={...source(),role_context:"platform_staff",
      action,resource:"store-application",
      target_id:"sel_reopened_store",
      previous_values:{private_reason:"DO-NOT-RELAY"},
      new_values:{application_id:"daapp_secret",staff_grant_id:"DO-NOT-RELAY",
        name:"PRIVATE-STORE-NAME",handle:"private-store-handle",
        claim_audit_id:"daaud_private",status:"open"}}
    const projected=projectFoundationAuditEvent(event)
    expect(projected.action).toBe(action)
    expect(projected.resource).toBe("store-application")
    expect(projected.target_id).toBe("sel_reopened_store")
    expect(validateAuditIndexEnvelope(projected)).toEqual(projected)
    expect(JSON.stringify(projected)).not.toContain("DO-NOT-RELAY")
    expect(JSON.stringify(projected)).not.toContain("daapp_secret")
    for(const change of [{role_context:"owner"},{role_context:"member"},
      {resource:"organization"},{target_id:"wrong_store"},
      {organization_id:"foreign"}])
      expect(()=>projectFoundationAuditEvent({...event,...change}))
        .toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })
  it.each(["root", "platform-staff", "platform_staff ", "superuser"])("still rejects unsupported role %s", role => {
    expect(() => projectFoundationAuditEvent({ ...source(), role_context: role })).toThrow("INVALID_AUDIT_INDEX_ENVELOPE")
  })

})
