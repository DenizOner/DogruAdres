import { isOwnerDemotionAllowed, invitationTokenMatches, hashInvitationToken } from "../security"
import { mayAcceptInvitation } from "../invitation-policy"

describe("DogruAdres organization security rules", () => {
  it("does not allow removing the final protected active Owner", () => {
    expect(isOwnerDemotionAllowed(1)).toBe(false)
    expect(isOwnerDemotionAllowed(2)).toBe(true)
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
})
