import {
  authorizeOrganizationAccess,
  type OrganizationAuthorizationResolver,
  type OrganizationAuthorizationInput,
} from "../organization-authorization"

/**
 * Additional edge-case unit tests for `authorizeOrganizationAccess`.
 *
 * These complement the existing organization-authorization.unit.spec.ts by
 * covering `operation: "create"` semantics, resolver function shape
 * validation, boundary conditions, and combinations not yet exercised.
 */

const principal = { actorId: "user_1", actorType: "user" }

const allowResolver: OrganizationAuthorizationResolver = {
  resolvePrincipalIdentity: async ({ actorId, actorType }) => ({
    actorId,
    actorType,
    personId: "person_1",
  }),
  resolveMembership: async (personId, organizationId) => ({
    personId,
    organizationId,
    status: "active",
    role: "owner",
    protectedOwner: true,
  }),
  resolveResourceOrganization: async () => "org_1",
  resolvePolicy: async () => true,
}

// ── create operation ──────────────────────────────────────────────────────
describe("authorizeOrganizationAccess — operation: create", () => {
  const createInput: OrganizationAuthorizationInput = {
    principal,
    organizationId: "org_1",
    action: "organization.create",
    operation: "create",
    // No resourceId for create
  }

  it("allows a create when no resourceId is provided", async () => {
    await expect(
      authorizeOrganizationAccess(createInput, allowResolver)
    ).resolves.toMatchObject({ allowed: true })
  })

  it("denies a create when a resourceId is supplied (prevents client-forced ownership)", async () => {
    await expect(
      authorizeOrganizationAccess({ ...createInput, resourceId: "org_1" }, allowResolver)
    ).resolves.toEqual({ allowed: false })
  })

  it("does NOT call resolveResourceOrganization on create operations", async () => {
    let called = false
    const resolver: OrganizationAuthorizationResolver = {
      ...allowResolver,
      resolveResourceOrganization: async () => {
        called = true
        return "org_1"
      },
    }
    await authorizeOrganizationAccess(createInput, resolver)
    expect(called).toBe(false)
  })
})

// ── resolver shape validation ─────────────────────────────────────────────
describe("authorizeOrganizationAccess — resolver shape guard", () => {
  const baseInput: OrganizationAuthorizationInput = {
    principal,
    organizationId: "org_1",
    action: "org.read",
    operation: "read",
    resourceId: "org_1",
  }

  it("denies when resolver is null", async () => {
    await expect(authorizeOrganizationAccess(baseInput, null)).resolves.toEqual({ allowed: false })
  })

  it("denies when resolver is undefined", async () => {
    await expect(authorizeOrganizationAccess(baseInput, undefined)).resolves.toEqual({ allowed: false })
  })

  it("denies when resolvePrincipalIdentity is not a function", async () => {
    const resolver = { ...allowResolver, resolvePrincipalIdentity: "not-a-function" as unknown as OrganizationAuthorizationResolver["resolvePrincipalIdentity"] }
    await expect(authorizeOrganizationAccess(baseInput, resolver)).resolves.toEqual({ allowed: false })
  })

  it("denies when resolveMembership is not a function", async () => {
    const resolver = { ...allowResolver, resolveMembership: null as unknown as OrganizationAuthorizationResolver["resolveMembership"] }
    await expect(authorizeOrganizationAccess(baseInput, resolver)).resolves.toEqual({ allowed: false })
  })

  it("denies when resolveResourceOrganization is not a function", async () => {
    const resolver = { ...allowResolver, resolveResourceOrganization: 42 as unknown as OrganizationAuthorizationResolver["resolveResourceOrganization"] }
    await expect(authorizeOrganizationAccess(baseInput, resolver)).resolves.toEqual({ allowed: false })
  })

  it("denies when resolvePolicy is not a function", async () => {
    const resolver = { ...allowResolver, resolvePolicy: true as unknown as OrganizationAuthorizationResolver["resolvePolicy"] }
    await expect(authorizeOrganizationAccess(baseInput, resolver)).resolves.toEqual({ allowed: false })
  })
})

// ── principal validation ──────────────────────────────────────────────────
describe("authorizeOrganizationAccess — principal guard", () => {
  const baseInput: OrganizationAuthorizationInput = {
    principal,
    organizationId: "org_1",
    action: "org.read",
    operation: "read",
    resourceId: "org_1",
  }

  it("denies when principal.actorId is an empty string", async () => {
    await expect(
      authorizeOrganizationAccess({ ...baseInput, principal: { actorId: "", actorType: "user" } }, allowResolver)
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when principal.actorType is an empty string", async () => {
    await expect(
      authorizeOrganizationAccess({ ...baseInput, principal: { actorId: "user_1", actorType: "" } }, allowResolver)
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when organizationId is an empty string", async () => {
    await expect(
      authorizeOrganizationAccess({ ...baseInput, organizationId: "" }, allowResolver)
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when action is null", async () => {
    await expect(
      authorizeOrganizationAccess({ ...baseInput, action: null }, allowResolver)
    ).resolves.toEqual({ allowed: false })
  })
})

// ── identity pin binding ──────────────────────────────────────────────────
describe("authorizeOrganizationAccess — identity pinning", () => {
  const baseInput: OrganizationAuthorizationInput = {
    principal,
    organizationId: "org_1",
    action: "org.read",
    operation: "read",
    resourceId: "org_1",
  }

  it("denies when the resolved identity actorType differs from the request principal", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePrincipalIdentity: async ({ actorId }) => ({
          actorId,
          actorType: "customer", // does not match principal.actorType="user"
          personId: "person_1",
        }),
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when the resolved identity actorId differs from the request principal", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePrincipalIdentity: async (_p) => ({
          actorId: "user_99", // spoofed different id
          actorType: "user",
          personId: "person_1",
        }),
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when the resolved personId is an empty string", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePrincipalIdentity: async ({ actorId, actorType }) => ({
          actorId,
          actorType,
          personId: "",
        }),
      })
    ).resolves.toEqual({ allowed: false })
  })
})

// ── resource scope mismatch ───────────────────────────────────────────────
describe("authorizeOrganizationAccess — resource scope", () => {
  const baseInput: OrganizationAuthorizationInput = {
    principal,
    organizationId: "org_1",
    action: "org.read",
    operation: "read",
    resourceId: "org_1",
  }

  it("denies when resolveResourceOrganization returns null", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolveResourceOrganization: async () => null,
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when resolveResourceOrganization returns a different organization", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolveResourceOrganization: async () => "org_2",
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when resolveResourceOrganization returns an empty string", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolveResourceOrganization: async () => "",
      })
    ).resolves.toEqual({ allowed: false })
  })
})

// ── fail-closed resilience ────────────────────────────────────────────────
describe("authorizeOrganizationAccess — fail-closed resilience", () => {
  const baseInput: OrganizationAuthorizationInput = {
    principal,
    organizationId: "org_1",
    action: "org.read",
    operation: "read",
    resourceId: "org_1",
  }

  it("denies and does not propagate when resolveMembership throws", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolveMembership: async () => { throw new Error("db outage") },
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies and does not propagate when resolveResourceOrganization throws", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolveResourceOrganization: async () => { throw new Error("network error") },
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies and does not propagate when resolvePolicy throws", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePolicy: async () => { throw new Error("policy service unavailable") },
      })
    ).resolves.toEqual({ allowed: false })
  })
})
