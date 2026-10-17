import {
  authorizeOrganizationAccess,
  type OrganizationAuthorizationResolver,
} from "../organization-authorization"

const principal = { actorId: "user_1", actorType: "user" }
const baseInput = {
  principal,
  organizationId: "org_1",
  action: "vehicle.read",
  operation: "read" as const,
  resourceId: "vehicle_1",
}

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
    role: "member",
    protectedOwner: false,
  }),
  resolveResourceOrganization: async () => "org_1",
  resolvePolicy: async () => true,
}

describe("authorizeOrganizationAccess", () => {
  it("allows only after principal, membership, resource scope, and policy resolve", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, allowResolver)
    ).resolves.toEqual({
      allowed: true,
      personId: "person_1",
      organizationId: "org_1",
    })
  })

  it.each([
    ["principal", { ...baseInput, principal: null }],
    ["organization context", { ...baseInput, organizationId: null }],
    ["action", { ...baseInput, action: "" }],
    ["existing resource identifier", { ...baseInput, resourceId: null }],
    ["resource identifier on create", { ...baseInput, operation: "create", resourceId: "vehicle_1" }],
  ] as const)("denies when %s is missing or mismatched", async (_name, input) => {
    await expect(authorizeOrganizationAccess(input, allowResolver)).resolves.toEqual({
      allowed: false,
    })
  })

  it("denies a client-selected organization without a membership", async () => {
    const resolver = {
      ...allowResolver,
      resolveMembership: async () => null,
    }

    await expect(authorizeOrganizationAccess(baseInput, resolver)).resolves.toEqual({
      allowed: false,
    })
  })

  it("denies revoked membership even when a mapping and policy resolver exist", async () => {
    await expect(authorizeOrganizationAccess(baseInput, {
      ...allowResolver,
      resolveMembership: async (personId, organizationId) => ({
        personId,
        organizationId,
        status: "revoked",
        role: "owner",
        protectedOwner: true,
      }),
    })).resolves.toEqual({ allowed: false })
  })

  it("resolves existing resource ownership server-side and denies another organization", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolveResourceOrganization: async () => "org_2",
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies when no policy resolver is supplied or the policy does not allow", async () => {
    await expect(authorizeOrganizationAccess(baseInput)).resolves.toEqual({
      allowed: false,
    })
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePolicy: async () => false,
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("denies an authenticated actor with no canonical Person mapping", async () => {
    await expect(authorizeOrganizationAccess(baseInput, {
      ...allowResolver,
      resolvePrincipalIdentity: async () => null,
    })).resolves.toEqual({ allowed: false })
  })

  it("keeps one Person's roles independent across Organizations", async () => {
    const memberships = new Map([
      ["org_1", { personId: "person_1", organizationId: "org_1", status: "active" as const, role: "owner" as const, protectedOwner: true }],
      ["org_2", { personId: "person_1", organizationId: "org_2", status: "active" as const, role: "member" as const, protectedOwner: false }],
    ])
    const resolver: OrganizationAuthorizationResolver = {
      ...allowResolver,
      resolveMembership: async (personId, organizationId) => {
        const membership = memberships.get(organizationId)
        return membership?.personId === personId ? membership : null
      },
      resolvePolicy: async ({ organizationId, action }) =>
        action === "organization.read" || (organizationId === "org_1" && action === "membership.manage"),
      resolveResourceOrganization: async (resourceId) => resourceId,
    }

    await expect(authorizeOrganizationAccess({
      ...baseInput,
      organizationId: "org_1",
      resourceId: "org_1",
      action: "membership.manage",
    }, resolver)).resolves.toMatchObject({ allowed: true, personId: "person_1", organizationId: "org_1" })

    await expect(authorizeOrganizationAccess({
      ...baseInput,
      organizationId: "org_2",
      resourceId: "org_2",
      action: "membership.manage",
    }, resolver)).resolves.toEqual({ allowed: false })
  })

  it("denies when a resolver throws", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePrincipalIdentity: async () => {
          throw new Error("resolver unavailable")
        },
      })
    ).resolves.toEqual({ allowed: false })
  })

  it("does not treat a mismatched principal mapping as the authenticated actor", async () => {
    await expect(
      authorizeOrganizationAccess(baseInput, {
        ...allowResolver,
        resolvePrincipalIdentity: async () => ({
          actorId: "user_2",
          actorType: "user",
          personId: "person_1",
        }),
      })
    ).resolves.toEqual({ allowed: false })
  })
})
