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

  type ProofsConfig = {
    login?: Array<{ person_id: string }>
    secondary?: Array<{ person_id: string }>
  }

  type MappingConfig = {
    person_id: string
    deleted_at?: Date | null
  }

  type PersonConfig = {
    id: string
    disabled_at?: Date | null
    deleted_at?: Date | null
  }

  function setup(options: {
    staffGrant?: any[]
    proofs?: (actorType: string, actorId: string) => ProofsConfig
    mappings?: (actorType: string, actorId: string) => MappingConfig[]
    people?: (personId: string) => PersonConfig[]
  } = {}) {
    const staffRow = {
      id: "grant_123",
      person_id: "person_staff",
      actor_type: "user",
      actor_id: "user_staff",
    }

    const executedSql: Array<{ sql: string; params: unknown[] }> = []

    const queryMock = jest.fn(async (sql: string, params: unknown[] = []) => {
      executedSql.push({ sql, params })

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
      if (sql.includes("pg_advisory_xact_lock(hashtext('da-actor-link')")) {
        return []
      }
      if (sql.includes("from da_login_binding")) {
        const actorType = params[0] as string
        const actorId = params[1] as string
        const cfg = options.proofs ? options.proofs(actorType, actorId) : undefined
        return cfg?.login || []
      }
      if (sql.includes("from da_verified_actor_binding")) {
        const actorType = params[0] as string
        const actorId = params[1] as string
        const cfg = options.proofs ? options.proofs(actorType, actorId) : undefined
        return cfg?.secondary || []
      }
      if (sql.includes("from da_actor_mapping")) {
        const actorType = params[0] as string
        const actorId = params[1] as string
        if (options.mappings) {
          return options.mappings(actorType, actorId).map(m => ({
            person_id: m.person_id,
            deleted_at: m.deleted_at ?? null,
          }))
        }
        // Default mapping matches actorId
        return [{ person_id: `person_${actorId}`, deleted_at: null }]
      }
      if (sql.includes("from da_person")) {
        const personId = params[0] as string
        if (options.people) {
          return options.people(personId).map(p => ({
            id: p.id,
            disabled_at: p.disabled_at ?? null,
            deleted_at: p.deleted_at ?? null,
          }))
        }
        return [{ id: personId, disabled_at: null, deleted_at: null }]
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

    return { service, context, queryMock, provisionOrgMock, executedSql }
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
      proofs: () => ({ login: [], secondary: [] }),
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when binding is revoked (revoked_at IS NOT NULL)", async () => {
    // SQL query filters out revoked bindings (where b.revoked_at is null) -> returns []
    const { service, context, provisionOrgMock } = setup({
      proofs: () => ({ login: [], secondary: [] }),
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("Finding 1: accepts multiple legitimate active verification proofs belonging to the SAME canonical Person", async () => {
    // Actor has BOTH login binding AND verified actor binding, both pointing to the same canonical Person
    const { service, context, provisionOrgMock } = setup({
      proofs: (_type, _id) => ({
        login: [{ person_id: "person_same" }],
        secondary: [{ person_id: "person_same" }],
      }),
      mappings: () => [{ person_id: "person_same", deleted_at: null }],
      people: () => [{ id: "person_same", disabled_at: null, deleted_at: null }],
    })

    const result = await service.provisionPersonalOrganization(token, defaultInput, context)
    expect(result.organization.name).toBe("Platform Org")
    expect(provisionOrgMock).toHaveBeenCalled()
  })

  it("Finding 2: detects conflicting active proofs before joining against ActorMapping", async () => {
    // Actor has login binding pointing to Person A, but secondary binding pointing to Person B.
    // ActorMapping only points to Person A.
    // If an INNER JOIN were used, Person B would be dropped and Person A would pass.
    // With direct proof evaluation, the conflict is detected and fail-closed rejected!
    const { service, context, provisionOrgMock } = setup({
      proofs: (_type, _id) => ({
        login: [{ person_id: "person_A" }],
        secondary: [{ person_id: "person_B" }],
      }),
      mappings: () => [{ person_id: "person_A", deleted_at: null }],
      people: () => [{ id: "person_A", disabled_at: null, deleted_at: null }],
    })

    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when active proof points to Person A, but actor mapping points to Person B", async () => {
    const { service, context, provisionOrgMock } = setup({
      proofs: () => ({ login: [{ person_id: "person_A" }] }),
      mappings: () => [{ person_id: "person_B", deleted_at: null }],
      people: () => [{ id: "person_A", disabled_at: null, deleted_at: null }],
    })

    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when actor mapping is deleted", async () => {
    const { service, context, provisionOrgMock } = setup({
      proofs: () => ({ login: [{ person_id: "person_A" }] }),
      mappings: () => [{ person_id: "person_A", deleted_at: new Date() }],
    })

    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies when canonical Person is disabled or deleted", async () => {
    const { service, context, provisionOrgMock } = setup({
      proofs: () => ({ login: [{ person_id: "person_disabled" }] }),
      mappings: () => [{ person_id: "person_disabled", deleted_at: null }],
      people: () => [{ id: "person_disabled", disabled_at: new Date(), deleted_at: null }],
    })
    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid initial Owner")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("denies duplicate initial owners resolving to the same canonical Person", async () => {
    const { service, context, provisionOrgMock } = setup({
      proofs: () => ({ login: [{ person_id: "person_common" }] }),
      mappings: () => [{ person_id: "person_common", deleted_at: null }],
      people: () => [{ id: "person_common", disabled_at: null, deleted_at: null }],
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
      proofs: () => ({ login: [{ person_id: "p1" }] }),
    })

    await expect(service.provisionPersonalOrganization(token, defaultInput, context)).rejects.toThrow(
      new MedusaError(MedusaError.Types.FORBIDDEN, "Platform staff grant and strong authentication required")
    )
    expect(provisionOrgMock).not.toHaveBeenCalled()
  })

  it("Finding 3: acquires advisory lock on da-actor-link in sorted order before proof reading", async () => {
    const { service, context, executedSql } = setup({
      proofs: (_type, id) => ({ login: [{ person_id: `person_${id}` }] }),
      mappings: (_type, id) => [{ person_id: `person_${id}`, deleted_at: null }],
      people: (id) => [{ id, disabled_at: null, deleted_at: null }],
    })

    const twoOwnersInput = {
      name: "Dual Owner Org",
      initial_owners: [
        { actor_type: "user", actor_id: "usr_z_2" },
        { actor_type: "user", actor_id: "usr_a_1" },
      ],
    }

    await service.provisionPersonalOrganization(token, twoOwnersInput, context)

    const lockCalls = executedSql.filter(e => e.sql.includes("da-actor-link"))
    expect(lockCalls).toHaveLength(2)
    // Must be in sorted order: user:usr_a_1 before user:usr_z_2
    expect(lockCalls[0].params[0]).toBe("user:usr_a_1")
    expect(lockCalls[1].params[0]).toBe("user:usr_z_2")
  })

  it("successfully provisions when two distinct initial Owners are properly verified", async () => {
    const { service, context, queryMock, provisionOrgMock } = setup({
      proofs: (_type, id) => ({ login: [{ person_id: `person_${id}` }] }),
      mappings: (_type, id) => [{ person_id: `person_${id}`, deleted_at: null }],
      people: (id) => [{ id, disabled_at: null, deleted_at: null }],
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
