import type { Context } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import AccessService from "../service"
import { IdentitySessions } from "../identity-session"

describe("B05 active membership listing service boundary (mock-only)", () => {
  const service = Object.create(AccessService.prototype) as AccessService
  const context = { transactionManager: { execute: jest.fn() } } as unknown as Context
  afterEach(() => jest.restoreAllMocks())

  it.each(["owner", "admin"])("authorizes %s and queries only active rows in the exact Organization with the approved projection", async role => {
    const authorize = jest.spyOn(IdentitySessions.prototype, "organizations").mockResolvedValue({ person_id: "p", organizations: [{ id: "daorg_test", role }] } as any)
    const list = jest.spyOn(service, "listMemberships").mockResolvedValue([])
    await expect(service.personalMemberships("synthetic", "daorg_test", context)).resolves.toEqual([])
    expect(authorize).toHaveBeenCalledWith("synthetic", "daorg_test")
    expect(list).toHaveBeenCalledWith({ organization_id: "daorg_test", status: "active" },
      { select: ["id", "person_id", "role", "status", "protected_owner"] }, context)
  })

  it.each([null, { person_id: "p", organizations: [{ id: "daorg_test", role: "member" }] }])("does not query any list after a denied identity/scope/role decision", async decision => {
    jest.spyOn(IdentitySessions.prototype, "organizations").mockResolvedValue(decision as any)
    const list = jest.spyOn(service, "listMemberships").mockResolvedValue([])
    await expect(service.personalMemberships("synthetic", "daorg_test", context)).rejects.toThrow("Access denied")
    expect(list).not.toHaveBeenCalled()
  })
})

describe("M0 B06 personal membership role change service boundary", () => {
  const token = "da_test_session_token_12345678901234567890123"
  const orgId = "daorg_01M0TESTORGANIZATION123456"
  const memberId = "daomem_01M0TESTMEMBERSHIP12345"

  const service = Object.create(AccessService.prototype) as AccessService
  const context = {
    transactionManager: {
      execute: jest.fn(async () => []),
      flush: jest.fn(async () => undefined),
    },
  } as unknown as Context

  const actorIdentity = {
    person_id: "daprs_owner",
    actor_type: "user",
    actor_id: "user_owner",
    auth_identity_id: "auth_owner",
  } as any

  const orgDecisionOwner = {
    person_id: "daprs_owner",
    organizations: [{ id: orgId, name: "Test Org", role: "owner" as any, membership_id: "daomem_owner" }],
  }

  const orgDecisionAdmin = {
    person_id: "daprs_owner",
    organizations: [{ id: orgId, name: "Test Org", role: "admin" as any, membership_id: "daomem_admin" }],
  }

  const orgDecisionMember = {
    person_id: "daprs_owner",
    organizations: [{ id: orgId, name: "Test Org", role: "member" as any, membership_id: "daomem_member" }],
  }

  const targetMember = {
    id: memberId,
    organization_id: orgId,
    person_id: "daprs_target",
    role: "member",
    status: "active",
    protected_owner: false,
  }

  const targetAdmin = {
    id: memberId,
    organization_id: orgId,
    person_id: "daprs_target",
    role: "admin",
    status: "active",
    protected_owner: false,
  }

  const targetOwner = {
    id: "daomem_owner_target",
    organization_id: orgId,
    person_id: "daprs_owner_2",
    role: "owner",
    status: "active",
    protected_owner: true,
  }

  let currentSpy: jest.SpyInstance
  let organizationsSpy: jest.SpyInstance
  let getMembershipSpy: jest.SpyInstance
  let changeMembershipSpy: jest.SpyInstance

  beforeEach(() => {
    currentSpy = jest.spyOn(IdentitySessions.prototype, "current").mockResolvedValue(actorIdentity)
    organizationsSpy = jest.spyOn(IdentitySessions.prototype, "organizations").mockResolvedValue(orgDecisionOwner)
    getMembershipSpy = jest.spyOn(service as any, "getMembershipInOrganization").mockResolvedValue(targetMember)
    changeMembershipSpy = jest.spyOn(service as any, "changeMembership").mockResolvedValue({
      id: memberId,
      role: "admin",
      status: "active",
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("allows Owner to change an active ordinary Member to Admin", async () => {
    const result = await service.personalChangeMembershipRole(token, orgId, memberId, "admin", context)
    expect(currentSpy).toHaveBeenCalledWith(token, true)
    expect(organizationsSpy).toHaveBeenCalledWith(token, orgId)
    expect(getMembershipSpy).toHaveBeenCalledWith(memberId, orgId, context)
    expect(changeMembershipSpy).toHaveBeenCalledWith({
      organization_id: orgId,
      membership_id: memberId,
      actor_person_id: "daprs_owner",
      actor_type: "user",
      actor_id: "user_owner",
      role: "admin",
    }, context)
    expect(result).toEqual({ id: memberId, role: "admin", status: "active" })
  })

  it("allows Admin to change an active ordinary Admin back to Member", async () => {
    organizationsSpy.mockResolvedValue(orgDecisionAdmin)
    getMembershipSpy.mockResolvedValue(targetAdmin)
    changeMembershipSpy.mockResolvedValue({ id: memberId, role: "member", status: "active" })

    const result = await service.personalChangeMembershipRole(token, orgId, memberId, "member", context)
    expect(changeMembershipSpy).toHaveBeenCalledWith({
      organization_id: orgId,
      membership_id: memberId,
      actor_person_id: "daprs_owner",
      actor_type: "user",
      actor_id: "user_owner",
      role: "member",
    }, context)
    expect(result).toEqual({ id: memberId, role: "member", status: "active" })
  })

  it("denies ordinary Member from changing membership roles (403 Forbidden)", async () => {
    organizationsSpy.mockResolvedValue(orgDecisionMember)
    await expect(service.personalChangeMembershipRole(token, orgId, memberId, "admin", context))
      .rejects.toThrow(new MedusaError(MedusaError.Types.FORBIDDEN, "Access denied"))
    expect(changeMembershipSpy).not.toHaveBeenCalled()
  })

  it("denies request when session is expired or lacks recent strong auth (403 Forbidden)", async () => {
    currentSpy.mockResolvedValue(null)
    await expect(service.personalChangeMembershipRole(token, orgId, memberId, "admin", context))
      .rejects.toThrow(new MedusaError(MedusaError.Types.FORBIDDEN, "Access denied"))
    expect(changeMembershipSpy).not.toHaveBeenCalled()
  })

  it("denies request when target membership does not exist in the Organization (404 Not Found)", async () => {
    getMembershipSpy.mockResolvedValue(null)
    await expect(service.personalChangeMembershipRole(token, orgId, memberId, "admin", context))
      .rejects.toThrow(new MedusaError(MedusaError.Types.NOT_FOUND, "Membership not found in the selected Organization"))
    expect(changeMembershipSpy).not.toHaveBeenCalled()
  })

  it("prevents changing protected Owner status through ordinary role controls (403 Forbidden)", async () => {
    getMembershipSpy.mockResolvedValue(targetOwner)
    await expect(service.personalChangeMembershipRole(token, orgId, "daomem_owner_target", "admin", context))
      .rejects.toThrow(new MedusaError(MedusaError.Types.FORBIDDEN, "Protected Owner cannot be changed through ordinary role controls"))
    expect(changeMembershipSpy).not.toHaveBeenCalled()
  })

  it("rejects invalid role values with INVALID_DATA", async () => {
    await expect(service.personalChangeMembershipRole(token, orgId, memberId, "owner" as any, context))
      .rejects.toThrow(new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid role"))
    await expect(service.personalChangeMembershipRole(token, orgId, memberId, "invalid" as any, context))
      .rejects.toThrow(new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid role"))
    expect(changeMembershipSpy).not.toHaveBeenCalled()
  })
})

describe("M0 B07 protected Owner session gateway (mock-only)", () => {
  const token = "da_test_session_token_12345678901234567890123"
  const orgId = "daorg_01M0TESTORGANIZATION123456"
  const membershipId = "daomem_01M0TESTMEMBERSHIP12345"
  const service = Object.create(AccessService.prototype) as AccessService
  const context = { transactionManager: { execute: jest.fn(async () => []) } } as unknown as Context
  const identity = { person_id: "daprs_owner", actor_type: "user", actor_id: "user_owner" } as any
  const ownerDecision = { organizations: [{ id: orgId, role: "owner" }] } as any
  const activeMember = { id: membershipId, person_id: "daprs_member", role: "member", status: "active", protected_owner: false } as any
  const protectedOwner = { ...activeMember, role: "owner", protected_owner: true }

  let current: jest.SpyInstance
  let orgs: jest.SpyInstance
  let target: jest.SpyInstance
  let change: jest.SpyInstance

  beforeEach(() => {
    current = jest.spyOn(IdentitySessions.prototype, "current").mockResolvedValue(identity)
    orgs = jest.spyOn(IdentitySessions.prototype, "organizations").mockResolvedValue(ownerDecision)
    target = jest.spyOn(service as any, "getMembershipInOrganization").mockResolvedValue(activeMember)
    change = jest.spyOn(service as any, "changeMembership").mockResolvedValue({
      id: membershipId, role: "owner", status: "active", protected_owner: true,
    })
  })
  afterEach(() => jest.restoreAllMocks())

  it("routes promotion of an existing active member through the existing transactional owner policy", async () => {
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "owner", context))
      .resolves.toEqual({ id: membershipId, role: "owner", status: "active", protected_owner: true })
    expect(current).toHaveBeenCalledWith(token, true)
    expect(orgs).toHaveBeenCalledWith(token, orgId)
    expect(target).toHaveBeenCalledWith(membershipId, orgId, context)
    expect(change).toHaveBeenCalledWith({
      organization_id: orgId, membership_id: membershipId, actor_person_id: "daprs_owner",
      actor_type: "user", actor_id: "user_owner", role: "owner",
    }, context)
  })

  it("routes protected Owner demotion through existing last-owner invariant rather than bypassing it", async () => {
    target.mockResolvedValue(protectedOwner)
    change.mockResolvedValue({ id: membershipId, role: "admin", status: "active", protected_owner: false })
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "admin", context))
      .resolves.toMatchObject({ role: "admin", protected_owner: false })
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), context)
  })

  it.each(["admin", "member"])("denies %s actors before touching the target", async role => {
    orgs.mockResolvedValue({ organizations: [{ id: orgId, role }] })
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "owner", context))
      .rejects.toThrow("Access denied")
    expect(target).not.toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
  })

  it("denies stale strong sessions and foreign targets without writing", async () => {
    current.mockResolvedValue(null)
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "owner", context))
      .rejects.toThrow("Access denied")
    expect(change).not.toHaveBeenCalled()
    current.mockResolvedValue(identity)
    target.mockResolvedValue(null)
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "owner", context))
      .rejects.toThrow("Membership not found")
    expect(change).not.toHaveBeenCalled()
  })

  it("denies revoked, duplicate promotion, non-owner demotion and arbitrary role", async () => {
    for (const entry of [{ ...activeMember, status: "revoked" }, protectedOwner]) {
      target.mockResolvedValue(entry)
      await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "owner", context))
        .rejects.toThrow("Owner operation denied")
    }
    target.mockResolvedValue(activeMember)
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "admin", context))
      .rejects.toThrow("Owner operation denied")
    await expect(service.personalManageProtectedOwner(token, orgId, membershipId, "member" as any, context))
      .rejects.toThrow("Invalid Owner operation")
    expect(change).not.toHaveBeenCalled()
  })
})
