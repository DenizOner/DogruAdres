import {
  normalizeEmail,
  verifiedEmailForActor,
  hashInvitationToken,
  invitationTokenMatches,
  deriveInvitationToken,
  isOwnerDemotionAllowed,
  canManageMembership,
  type AuthVerificationRecord,
} from "../security"

/**
 * Additional edge-case unit tests for security.ts utilities.
 *
 * Complements the basic coverage in the existing security.unit.spec.ts.
 * These tests focus on boundary conditions, input sanitization, and the
 * security properties of each pure utility.
 */
describe("normalizeEmail", () => {
  it("lower-cases the input", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com")
  })

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  hello@test.io  ")).toBe("hello@test.io")
  })

  it("both lower-cases and trims in one call", () => {
    expect(normalizeEmail("  UPPER@HOST.ORG  ")).toBe("upper@host.org")
  })

  it("handles an already-normalized email without modification", () => {
    expect(normalizeEmail("plain@example.test")).toBe("plain@example.test")
  })

  it("handles an empty string without throwing", () => {
    expect(normalizeEmail("")).toBe("")
  })
})

describe("isOwnerDemotionAllowed", () => {
  it("denies when count is 0 (no active protected owners)", () => {
    expect(isOwnerDemotionAllowed(0)).toBe(false)
  })

  it("denies when count is 1 (exactly the last protected owner)", () => {
    expect(isOwnerDemotionAllowed(1)).toBe(false)
  })

  it("allows when count is 2 (one would remain after demotion)", () => {
    expect(isOwnerDemotionAllowed(2)).toBe(true)
  })

  it("allows for large active owner counts", () => {
    expect(isOwnerDemotionAllowed(100)).toBe(true)
  })

  it("denies for non-integer floats (e.g., 1.5 rounds to truthy but is not integer)", () => {
    expect(isOwnerDemotionAllowed(1.5)).toBe(false)
  })

  it("denies for NaN", () => {
    expect(isOwnerDemotionAllowed(NaN)).toBe(false)
  })
})

describe("canManageMembership", () => {
  it("allows only `active` status", () => {
    expect(canManageMembership("active")).toBe(true)
  })

  it.each(["revoked", "pending", "suspended", "", "ACTIVE"])("denies status=%s", (status) => {
    expect(canManageMembership(status)).toBe(false)
  })
})

describe("hashInvitationToken", () => {
  it("produces a 64-character hex string (SHA-256)", () => {
    const digest = hashInvitationToken("test-token")
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
  })

  it("is deterministic: same input always produces same digest", () => {
    const token = "deterministic-token"
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token))
  })

  it("produces different digests for different inputs", () => {
    expect(hashInvitationToken("token-a")).not.toBe(hashInvitationToken("token-b"))
  })

  it("does not include the raw token in its output", () => {
    const token = "super-secret-token-abc123"
    expect(hashInvitationToken(token)).not.toContain(token)
  })
})

describe("invitationTokenMatches", () => {
  it("returns true for a matching token/hash pair", () => {
    const token = "matching-token"
    const hash = hashInvitationToken(token)
    expect(invitationTokenMatches(token, hash)).toBe(true)
  })

  it("returns false for a wrong token against a known hash", () => {
    const hash = hashInvitationToken("real-token")
    expect(invitationTokenMatches("wrong-token", hash)).toBe(false)
  })

  it("returns false when hash is from a completely different token", () => {
    const hash = hashInvitationToken("token-x")
    expect(invitationTokenMatches("token-y", hash)).toBe(false)
  })

  it("is case-sensitive: 'Token' != 'token'", () => {
    const hash = hashInvitationToken("token")
    expect(invitationTokenMatches("Token", hash)).toBe(false)
  })

  it("handles an empty token without throwing", () => {
    const hash = hashInvitationToken("")
    expect(invitationTokenMatches("", hash)).toBe(true)
  })
})

describe("deriveInvitationToken (secret validation)", () => {
  const ORIGINAL = process.env.DOGRUADRES_INVITATION_SECRET

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.DOGRUADRES_INVITATION_SECRET
    } else {
      process.env.DOGRUADRES_INVITATION_SECRET = ORIGINAL
    }
  })

  it("throws when secret is absent", () => {
    delete process.env.DOGRUADRES_INVITATION_SECRET
    expect(() => deriveInvitationToken("id_1")).toThrow("at least 32 bytes")
  })

  it("throws when secret is shorter than 32 bytes", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "a".repeat(31)
    expect(() => deriveInvitationToken("id_1")).toThrow("at least 32 bytes")
  })

  it("accepts a secret of exactly 32 bytes", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "a".repeat(32)
    expect(() => deriveInvitationToken("id_1")).not.toThrow()
  })

  it("accepts secrets longer than 32 bytes", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "b".repeat(64)
    expect(() => deriveInvitationToken("id_1")).not.toThrow()
  })

  it("produces a non-empty base64url string", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "c".repeat(32)
    const token = deriveInvitationToken("test-invite-id")
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThan(0)
  })

  it("is deterministic: same secret and id always produce the same token", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "d".repeat(32)
    const id = "invite_stable_123"
    expect(deriveInvitationToken(id)).toBe(deriveInvitationToken(id))
  })

  it("produces a different token for a different invitation id", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "e".repeat(32)
    expect(deriveInvitationToken("id_a")).not.toBe(deriveInvitationToken("id_b"))
  })

  it("produces a different token when the secret changes (key rotation)", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "f".repeat(32)
    const tokenWithKeyA = deriveInvitationToken("same-id")
    process.env.DOGRUADRES_INVITATION_SECRET = "g".repeat(32)
    const tokenWithKeyB = deriveInvitationToken("same-id")
    expect(tokenWithKeyA).not.toBe(tokenWithKeyB)
  })

  it("the derived token matches its own hash (round-trip)", () => {
    process.env.DOGRUADRES_INVITATION_SECRET = "h".repeat(32)
    const id = "round-trip-id"
    const token = deriveInvitationToken(id)
    const hash = hashInvitationToken(token)
    expect(invitationTokenMatches(token, hash)).toBe(true)
  })
})

describe("verifiedEmailForActor (additional branches)", () => {
  const now = new Date()
  const baseVerification: AuthVerificationRecord = {
    entity_type: "email",
    entity_id: "person@example.test",
    verified_at: now,
    deleted_at: null,
  }

  const base = {
    actorType: "customer",
    actorId: "cus_abc",
    authIdentityId: "auth_xyz",
    authProvider: "emailpass",
    authenticatedEmail: "person@example.test",
    providerIdentityEmail: "person@example.test",
    verifications: [baseVerification],
  }

  it("returns the normalized email when all conditions are met", () => {
    expect(verifiedEmailForActor(base)).toBe("person@example.test")
  })

  it("returns null when actorType is missing", () => {
    expect(verifiedEmailForActor({ ...base, actorType: undefined })).toBeNull()
  })

  it("returns null when actorId is missing", () => {
    expect(verifiedEmailForActor({ ...base, actorId: undefined })).toBeNull()
  })

  it("returns null when authIdentityId is missing", () => {
    expect(verifiedEmailForActor({ ...base, authIdentityId: undefined })).toBeNull()
  })

  it("returns null when authProvider is missing", () => {
    expect(verifiedEmailForActor({ ...base, authProvider: undefined })).toBeNull()
  })

  it("returns null when authenticatedEmail is missing", () => {
    expect(verifiedEmailForActor({ ...base, authenticatedEmail: undefined })).toBeNull()
  })

  it("returns null when providerIdentityEmail is missing", () => {
    expect(verifiedEmailForActor({ ...base, providerIdentityEmail: undefined })).toBeNull()
  })

  it("returns null when authenticatedEmail does not match providerIdentityEmail", () => {
    expect(verifiedEmailForActor({ ...base, providerIdentityEmail: "other@example.test" })).toBeNull()
  })

  it("returns null when the verifications array is empty", () => {
    expect(verifiedEmailForActor({ ...base, verifications: [] })).toBeNull()
  })

  it("returns null when the verification entity_type is not 'email'", () => {
    const verification = { ...baseVerification, entity_type: "phone" }
    expect(verifiedEmailForActor({ ...base, verifications: [verification] })).toBeNull()
  })

  it("returns null when the verification is soft-deleted", () => {
    const verification = { ...baseVerification, deleted_at: new Date() }
    expect(verifiedEmailForActor({ ...base, verifications: [verification] })).toBeNull()
  })

  it("returns null when verified_at is null (not yet verified)", () => {
    const verification = { ...baseVerification, verified_at: null }
    expect(verifiedEmailForActor({ ...base, verifications: [verification] })).toBeNull()
  })

  it("returns null when verified_at is undefined", () => {
    const verification = { ...baseVerification, verified_at: undefined }
    expect(verifiedEmailForActor({ ...base, verifications: [verification] })).toBeNull()
  })

  it("returns null when entity_id does not match authenticatedEmail (case-insensitive)", () => {
    const verification = { ...baseVerification, entity_id: "different@example.test" }
    expect(verifiedEmailForActor({ ...base, verifications: [verification] })).toBeNull()
  })

  it("accepts verification where entity_id has different casing (case-insensitive match)", () => {
    const verification = { ...baseVerification, entity_id: "PERSON@EXAMPLE.TEST" }
    expect(verifiedEmailForActor({ ...base, verifications: [verification] })).toBe("person@example.test")
  })

  it("accepts authenticatedEmail with mixed casing (result is always normalized)", () => {
    const result = verifiedEmailForActor({
      ...base,
      authenticatedEmail: "Person@Example.Test",
      providerIdentityEmail: "person@example.test",
      verifications: [{ ...baseVerification, entity_id: "Person@Example.Test" }],
    })
    expect(result).toBe("person@example.test")
  })

  it("returns null when verifications contains only a deleted record plus a non-email record", () => {
    const verifications: AuthVerificationRecord[] = [
      { ...baseVerification, deleted_at: new Date() },
      { ...baseVerification, entity_type: "sms" },
    ]
    expect(verifiedEmailForActor({ ...base, verifications })).toBeNull()
  })

  it("returns non-null when at least one valid email verification exists among invalid ones", () => {
    const verifications: AuthVerificationRecord[] = [
      { ...baseVerification, entity_type: "sms" },
      baseVerification, // valid
      { ...baseVerification, deleted_at: new Date() },
    ]
    expect(verifiedEmailForActor({ ...base, verifications })).toBe("person@example.test")
  })
})
