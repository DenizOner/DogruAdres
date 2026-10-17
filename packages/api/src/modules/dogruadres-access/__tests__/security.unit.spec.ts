import { canManageMembership, isOwnerDemotionAllowed, invitationTokenMatches, hashInvitationToken, deriveInvitationToken, verifiedEmailForActor } from "../security"
import { mayAcceptInvitation } from "../invitation-policy"
import { DOGRUADRES_AUDIT_MODULE } from "../service"

describe("DogruAdres organization security rules", () => {
  it("does not allow removing the final protected active Owner", () => {
    expect(isOwnerDemotionAllowed(1)).toBe(false)
    expect(isOwnerDemotionAllowed(2)).toBe(true)
  })

  it("allows ordinary role management only for active memberships", () => {
    expect(canManageMembership("active")).toBe(true)
    expect(canManageMembership("revoked")).toBe(false)
  })

  it("uses the server-owned module identifier for audit events", () => {
    expect(DOGRUADRES_AUDIT_MODULE).toBe("dogruadres-access")
  })

  it("requires pending, unexpired invitation and matching verified recipient", () => {
    const now = new Date("2026-10-17T10:00:00.000Z")
    const base = {
      status: "pending" as const,
      expiresAt: new Date("2026-10-18T10:00:00.000Z"),
      recipientEmail: "Buyer@example.test",
      verifiedEmail: "buyer@example.test",
      tokenMatches: true,
      now,
    }
    expect(mayAcceptInvitation(base)).toBe(true)
    expect(mayAcceptInvitation({ ...base, expiresAt: now })).toBe(false)
    expect(mayAcceptInvitation({ ...base, status: "accepted" })).toBe(false)
    expect(mayAcceptInvitation({ ...base, status: "revoked" })).toBe(false)
    expect(mayAcceptInvitation({ ...base, verifiedEmail: "other@example.test" })).toBe(false)
    expect(mayAcceptInvitation({ ...base, verifiedEmail: null })).toBe(false)
    expect(mayAcceptInvitation({ ...base, tokenMatches: false })).toBe(false)
  })

  it("compares invitation token digests without storing or returning plaintext", () => {
    const digest = hashInvitationToken("synthetic-one-time-token")
    expect(digest).not.toContain("synthetic-one-time-token")
    expect(invitationTokenMatches("synthetic-one-time-token", digest)).toBe(true)
    expect(invitationTokenMatches("different-token", digest)).toBe(false)
  })

  it("fails closed when the invitation secret is missing or shorter than 32 bytes", () => {
    const original = process.env.DOGRUADRES_INVITATION_SECRET
    try {
      delete process.env.DOGRUADRES_INVITATION_SECRET
      expect(() => deriveInvitationToken("invite_test")).toThrow("at least 32 bytes")
      process.env.DOGRUADRES_INVITATION_SECRET = "short"
      expect(() => deriveInvitationToken("invite_test")).toThrow("at least 32 bytes")
      process.env.DOGRUADRES_INVITATION_SECRET = "x".repeat(32)
      expect(deriveInvitationToken("invite_test")).toBeTruthy()
    } finally {
      if (original === undefined) delete process.env.DOGRUADRES_INVITATION_SECRET
      else process.env.DOGRUADRES_INVITATION_SECRET = original
    }
  })

  it("requires a verified email entity tied to the authenticated actor and provider", () => {
    const context = {
      actorType: "customer",
      actorId: "cus_test",
      authIdentityId: "auth_test",
      authProvider: "emailpass",
      authenticatedEmail: "person@example.test",
      providerIdentityEmail: "person@example.test",
      verifications: [{ entity_type: "email", entity_id: "Person@example.test", verified_at: new Date() }],
    }
    expect(verifiedEmailForActor(context)).toBe("person@example.test")
    expect(verifiedEmailForActor({ ...context, verifications: [{ ...context.verifications[0], entity_type: "invitation" }] })).toBeNull()
    expect(verifiedEmailForActor({ ...context, verifications: [{ ...context.verifications[0], verified_at: null }] })).toBeNull()
    expect(verifiedEmailForActor({ ...context, authenticatedEmail: "other@example.test" })).toBeNull()
    expect(verifiedEmailForActor({ ...context, providerIdentityEmail: "other@example.test" })).toBeNull()
    expect(verifiedEmailForActor({ ...context, verifications: [] })).toBeNull()
    expect(verifiedEmailForActor({ ...context, authProvider: undefined })).toBeNull()
  })
})
