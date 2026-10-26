import type { Context } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import AccessService from "../service"

describe("provisionPersonalOrganization - Verified Initial Owner Enforcement (B03)", () => {
  const previousSecret = process.env.COOKIE_SECRET
  beforeAll(() => {
    process.env.COOKIE_SECRET = "unit-only-" + "x".repeat(48)
  })
  afterAll(() => {
    if (previousSecret === undefined) delete process.env.COOKIE_SECRET
    else process.env.COOKIE_SECRET = previousSecret
  })

  function setup(options: {
    staffGrant?: any[]
    verifiedBindings?: (actorType: string, actorId: string) => any[]
  } = {}) {
    const staffRow = {
      id: "grant_123",
      person_id: "person_staff",
      actor_type: "user",
      actor_id: "user_staff",
    }

    const queryMock = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from da_platform_staff_grant")) {
        return options.staffGrant !== undefined ? options.staffGrant : [staffRow]
      }
      if (sql.includes("from da_browser_session")) {
        return [{
          id: "session_hash",
          person_id: "person_staff",
          auth_identity_id: "auth_staff",
          actor_type: "user",
          actor_id: "user_staff",
          epoch: 0,
          current_epoch: 0,
          csrf_hash: "csrf_hash",
          status: "active",
          created_at: new Date(Date.now() - 1000),
          last_activity_at: new Date(Date.now() - 1000),
          last_strong_auth_at: new Date(Date.now() - 1000),
          now_ms: Date.now(),
        }]
      }
      if (sql.includes("from da_session_policy")) {
        return [{
          idle_timeout_seconds: 1800,
          absolute_lifetime_seconds: 28800,
          recent_auth_seconds: 300,
          mfa_activated: "false",
        }]
      }
      if (sql.includes("from da_login_binding") || sql.includes("from da_verified_actor_binding")) {
        if (options.verifiedBindings) {
          const actorType = params[0] as string
          const actorId = params[1] as string
          return options.verifiedBindings(actorType, actorId)
        }
        return []
      }
      if (sql.includes("insert into da_security_outbox")) {
        return []
      }
      return []
    })

    const context = {
      transactionManager: {
        execute: queryMock,
        flush: jest.fn(async () => undefined),
      },
    } as unknown as Context

    const service = Object.create(AccessService.prototype) as AccessService
    const provisionOrgMock = jest.fn(async (input: any) => ({
      organization: { id: "daorg_created", name: input.name, status: "active" },
      memberships: input.initial_owners.map((owner: any, index: number) => ({
        id: `damem_${index}`,
        person_id: `person_${owner.actor_id}`,
        role: "owner",
        status: "active",
        protected_owner: true,
      })),
    }))

    Object.assign(service, {
      provisionOrganization: provisionOrgMock,
    })

    return { service, context, queryMock, provisionOrgMock }
  }

  const token = "a".repeat(43)
  const defaultInput = {
    name: "Platform Org",
    initial_owners: [
      { actor_type: "user", actor_id: "usr_verified_1" },
    ],
  }

  it("denies unverified native actor without active binding", async () => {
    const { service, context, provisionOrgMock } = setup({
      verifiedBindings: () => [],
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when binding is revoked (revoked_at IS NOT NULL)", async () => {
    // SQL query filters out revoked bindings (where b.revoked_at is null) -> returns []
    const { service, context, provisionOrgMock } = setup({
      verifiedBindings: () => [],
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when actor binding is ambiguous (multiple active rows)", async () => {
    const { service, context, provisionOrgMock } = setup({
      verifiedBindings: () => [{ person_id: "p1" }, { person_id: "p2" }],
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when canonical Person is disabled or deleted", async () => {
    // SQL query filters out disabled/deleted people -> returns []
    const { service, context, provisionOrgMock } = setup({
      verifiedBindings: () => [],
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies duplicate initial owners resolving to the same canonical Person", async () => {
    const { service, context, provisionOrgMock } = setup({
      verifiedBindings: () => [{ person_id: "person_common" }],
    })

    const duplicateInput = {
      name: "Duplicate Org",
      initial_owners: [
        { actor_type: "user", actor_id: "usr_1" },
        { actor_type: "user", actor_id: "usr_2" },
      ],
    }

    await expect(service.provisionPersonalOrganization(token, duplicateInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Initial Owners must be distinct canonical Persons")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies request without valid platform staff grant", async () => {
    const { service, context, provisionOrgMock } = setup({
      staffGrant: [],
      verifiedBindings: () => [{ person_id: "p1" }],
    })

    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.FORBIDDEN, "Platform staff grant and strong authentication required")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("successfully provisions when two distinct initial Owners are properly verified", async () => {
    const { service, context, queryMock, provisionOrgMock } = setup({
      verifiedBindings: (_actorType: string, actorId: string) => {
        if (actorId === "usr_1") return [{ person_id: "person_1" }]
        if (actorId === "usr_2") return [{ person_id: "person_2" }]
        return []
      },
    })

    const twoOwnersInput = {
      name: "Dual Owner Org",
      initial_owners: [
        { actor_type: "user", actor_id: "usr_1" },
        { actor_type: "user", actor_id: "usr_2" },
      ],
    }

    const result = await service.provisionPersonalOrganization(token, twoOwnersInput, context)
    expect(result.organization.name).toBe("Dual Owner Org")
    expect(result.memberships).toHaveLength(2)
    expect(provisionOrgMock).toHaveBeenCalledWith(
      {
        ...twoOwnersInput,
        staff_grant_id: "grant_123",
        provisioned_by: { actor_type: "user", actor_id: "user_staff" },
      },
      context
    )
    // Verify flush was called before outbox write
    expect((context.transactionManager as any).flush).toHaveBeenCalled()
    // Verify outbox insertion SQL executed
    expect(queryMock.mock.calls.some(([q]) => q.includes("insert into da_security_outbox"))).toBe(true)
  })
})
