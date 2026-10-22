import {
  provisionOrganizationBody,
  changeMembershipBody,
  createInvitationBody,
  acceptInvitationBody,
} from "../validators"

/**
 * Unit tests for the Zod request validators defined in validators.ts.
 *
 * These tests ensure the parse/reject boundary exactly matches what the
 * middleware accepts, so a validator change that widens or narrows the
 * accepted surface is caught before reaching a route handler.
 */

// ── provisionOrganizationBody ─────────────────────────────────────────────
describe("provisionOrganizationBody", () => {
  const validActor = { actor_type: "user", actor_id: "user_1" }

  it("accepts a well-formed payload", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "My Organization",
      initial_owners: [validActor],
    })
    expect(result.success).toBe(true)
  })

  it("trims whitespace from name during parse", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "  Trimmed Name  ",
      initial_owners: [validActor],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe("Trimmed Name")
  })

  it("rejects an empty name", () => {
    const result = provisionOrganizationBody.safeParse({ name: "", initial_owners: [validActor] })
    expect(result.success).toBe(false)
  })

  it("rejects a name that is only whitespace", () => {
    const result = provisionOrganizationBody.safeParse({ name: "   ", initial_owners: [validActor] })
    expect(result.success).toBe(false)
  })

  it("rejects a name longer than 200 characters", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "a".repeat(201),
      initial_owners: [validActor],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a name of exactly 200 characters", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "a".repeat(200),
      initial_owners: [validActor],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty initial_owners array", () => {
    const result = provisionOrganizationBody.safeParse({ name: "Org", initial_owners: [] })
    expect(result.success).toBe(false)
  })

  it("accepts up to 20 initial owners", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "Org",
      initial_owners: Array.from({ length: 20 }, (_, i) => ({ actor_type: "user", actor_id: `user_${i}` })),
    })
    expect(result.success).toBe(true)
  })

  it("rejects more than 20 initial owners", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "Org",
      initial_owners: Array.from({ length: 21 }, (_, i) => ({ actor_type: "user", actor_id: `user_${i}` })),
    })
    expect(result.success).toBe(false)
  })

  it.each(["user", "member", "customer"])("accepts actor_type=%s", (actor_type) => {
    const result = provisionOrganizationBody.safeParse({
      name: "Org",
      initial_owners: [{ actor_type, actor_id: "id_1" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown actor_type", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "Org",
      initial_owners: [{ actor_type: "admin", actor_id: "id_1" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an actor with an empty actor_id", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "Org",
      initial_owners: [{ actor_type: "user", actor_id: "" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an actor_id longer than 255 characters", () => {
    const result = provisionOrganizationBody.safeParse({
      name: "Org",
      initial_owners: [{ actor_type: "user", actor_id: "x".repeat(256) }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing name field", () => {
    const result = provisionOrganizationBody.safeParse({ initial_owners: [validActor] })
    expect(result.success).toBe(false)
  })

  it("rejects missing initial_owners field", () => {
    const result = provisionOrganizationBody.safeParse({ name: "Org" })
    expect(result.success).toBe(false)
  })
})

// ── changeMembershipBody ──────────────────────────────────────────────────
describe("changeMembershipBody", () => {
  it("accepts role-only change", () => {
    expect(changeMembershipBody.safeParse({ role: "admin" }).success).toBe(true)
  })

  it("accepts status-only change", () => {
    expect(changeMembershipBody.safeParse({ status: "revoked" }).success).toBe(true)
  })

  it("accepts both role and status", () => {
    expect(changeMembershipBody.safeParse({ role: "member", status: "active" }).success).toBe(true)
  })

  it("rejects an empty payload (both role and status absent)", () => {
    expect(changeMembershipBody.safeParse({}).success).toBe(false)
  })

  it("rejects an unknown role", () => {
    expect(changeMembershipBody.safeParse({ role: "superadmin" }).success).toBe(false)
  })

  it("rejects an unknown status", () => {
    expect(changeMembershipBody.safeParse({ status: "suspended" }).success).toBe(false)
  })

  it.each(["owner", "admin", "member"])("accepts role=%s", (role) => {
    expect(changeMembershipBody.safeParse({ role }).success).toBe(true)
  })

  it.each(["active", "revoked"])("accepts status=%s", (status) => {
    expect(changeMembershipBody.safeParse({ status }).success).toBe(true)
  })
})

// ── createInvitationBody ──────────────────────────────────────────────────
describe("createInvitationBody", () => {
  it("accepts a valid invitation body", () => {
    const result = createInvitationBody.safeParse({ email: "buyer@example.test", role: "member" })
    expect(result.success).toBe(true)
  })

  it("accepts role=admin", () => {
    const result = createInvitationBody.safeParse({ email: "a@b.io", role: "admin" })
    expect(result.success).toBe(true)
  })

  it("rejects role=owner", () => {
    const result = createInvitationBody.safeParse({ email: "a@b.io", role: "owner" })
    expect(result.success).toBe(false)
  })

  it("rejects a non-email string", () => {
    const result = createInvitationBody.safeParse({ email: "not-an-email", role: "member" })
    expect(result.success).toBe(false)
  })

  it("rejects an email longer than 320 characters", () => {
    const local = "a".repeat(310)
    const result = createInvitationBody.safeParse({ email: `${local}@example.test`, role: "member" })
    expect(result.success).toBe(false)
  })

  it("rejects a missing email", () => {
    const result = createInvitationBody.safeParse({ role: "member" })
    expect(result.success).toBe(false)
  })

  it("rejects a missing role", () => {
    const result = createInvitationBody.safeParse({ email: "a@b.io" })
    expect(result.success).toBe(false)
  })
})

// ── acceptInvitationBody ──────────────────────────────────────────────────
describe("acceptInvitationBody", () => {
  it("accepts a valid token", () => {
    const result = acceptInvitationBody.safeParse({ token: "some-invitation-token" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty token", () => {
    const result = acceptInvitationBody.safeParse({ token: "" })
    expect(result.success).toBe(false)
  })

  it("rejects a token longer than 256 characters", () => {
    const result = acceptInvitationBody.safeParse({ token: "a".repeat(257) })
    expect(result.success).toBe(false)
  })

  it("accepts a token of exactly 256 characters", () => {
    const result = acceptInvitationBody.safeParse({ token: "a".repeat(256) })
    expect(result.success).toBe(true)
  })

  it("accepts a token of exactly 1 character", () => {
    const result = acceptInvitationBody.safeParse({ token: "x" })
    expect(result.success).toBe(true)
  })

  it("rejects a missing token field", () => {
    const result = acceptInvitationBody.safeParse({})
    expect(result.success).toBe(false)
  })
})

