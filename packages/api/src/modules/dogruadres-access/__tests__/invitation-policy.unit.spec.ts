import { mayAcceptInvitation, type InvitationAcceptanceInput } from "../invitation-policy"

/**
 * Exhaustive unit tests for `mayAcceptInvitation`.
 *
 * The function is a pure predicate - every branch is testable without any
 * database or framework dependency. These tests complement the happy-path
 * coverage already present in security.unit.spec.ts by exercising every
 * independent gate and their combinations.
 */
describe("mayAcceptInvitation", () => {
  const future = new Date("2026-10-18T10:00:00.000Z")
  const now = new Date("2026-10-17T10:00:00.000Z")
  const past = new Date("2026-10-16T10:00:00.000Z")

  const valid: InvitationAcceptanceInput = {
    status: "pending",
    expiresAt: future,
    recipientEmail: "buyer@example.test",
    verifiedEmail: "buyer@example.test",
    tokenMatches: true,
    now,
  }

  // -- Happy path
  it("accepts a valid pending invitation", () => {
    expect(mayAcceptInvitation(valid)).toBe(true)
  })

  // -- Status gate
  it.each([
    ["accepted", "accepted" as const],
    ["revoked", "revoked" as const],
  ])("rejects status=%s", (_label, status) => {
    expect(mayAcceptInvitation({ ...valid, status })).toBe(false)
  })

  // -- Expiry gate
  it("rejects an invitation that expires exactly at `now`", () => {
    expect(mayAcceptInvitation({ ...valid, expiresAt: now })).toBe(false)
  })

  it("rejects an already-expired invitation", () => {
    expect(mayAcceptInvitation({ ...valid, expiresAt: past })).toBe(false)
  })

  it("accepts when `expiresAt` is one millisecond in the future", () => {
    const almostExpired = new Date(now.getTime() + 1)
    expect(mayAcceptInvitation({ ...valid, expiresAt: almostExpired })).toBe(true)
  })

  // -- Verified-email gate
  it("rejects when verifiedEmail is null (email not verified)", () => {
    expect(mayAcceptInvitation({ ...valid, verifiedEmail: null })).toBe(false)
  })

  it("rejects when verifiedEmail is an empty string", () => {
    expect(mayAcceptInvitation({ ...valid, verifiedEmail: "" })).toBe(false)
  })

  it("rejects when both recipient and verified emails are empty", () => {
    expect(mayAcceptInvitation({ ...valid, recipientEmail: "", verifiedEmail: "" })).toBe(false)
  })

  it("rejects when both emails normalize to whitespace-only empty strings", () => {
    expect(mayAcceptInvitation({ ...valid, recipientEmail: "  ", verifiedEmail: "\t " })).toBe(false)
  })

  // -- Email matching gate
  it("rejects a mismatched verified email", () => {
    expect(mayAcceptInvitation({ ...valid, verifiedEmail: "other@example.test" })).toBe(false)
  })

  it("accepts case-insensitive email match (recipient has uppercase)", () => {
    expect(mayAcceptInvitation({ ...valid, recipientEmail: "Buyer@Example.Test" })).toBe(true)
  })

  it("accepts case-insensitive email match (verified has uppercase)", () => {
    expect(mayAcceptInvitation({ ...valid, verifiedEmail: "BUYER@EXAMPLE.TEST" })).toBe(true)
  })

  it("accepts when both recipient and verified email have mixed casing", () => {
    expect(
      mayAcceptInvitation({
        ...valid,
        recipientEmail: "BUYER@Example.Test",
        verifiedEmail: "buyer@example.TEST",
      })
    ).toBe(true)
  })

  it("rejects when verified email does not match recipient (with whitespace trimming applied)", () => {
    expect(
      mayAcceptInvitation({ ...valid, verifiedEmail: "different@example.test", recipientEmail: " buyer@example.test" })
    ).toBe(false)
  })

  it("accepts when recipient email has leading/trailing whitespace that matches after trim", () => {
    expect(
      mayAcceptInvitation({ ...valid, recipientEmail: "  buyer@example.test  " })
    ).toBe(true)
  })

  // -- Token gate
  it("rejects when tokenMatches is false", () => {
    expect(mayAcceptInvitation({ ...valid, tokenMatches: false })).toBe(false)
  })

  // -- Multi-gate failures
  it("rejects when status is wrong and token does not match", () => {
    expect(mayAcceptInvitation({ ...valid, status: "revoked", tokenMatches: false })).toBe(false)
  })

  it("rejects when expired and verifiedEmail is null", () => {
    expect(mayAcceptInvitation({ ...valid, expiresAt: past, verifiedEmail: null })).toBe(false)
  })

  it("rejects when all gates fail simultaneously", () => {
    expect(
      mayAcceptInvitation({
        status: "accepted",
        expiresAt: past,
        recipientEmail: "a@example.test",
        verifiedEmail: "b@example.test",
        tokenMatches: false,
        now,
      })
    ).toBe(false)
  })

  // -- Boundary: future now
  it("rejects a pending invitation when the caller`s `now` is after expiry", () => {
    expect(mayAcceptInvitation({ ...valid, now: new Date(future.getTime() + 1) })).toBe(false)
  })
})
