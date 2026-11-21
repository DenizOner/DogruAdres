import type { Context } from "@medusajs/framework/types"
import AccessService from "../service"
import { deriveInvitationToken, hashInvitationToken } from "../security"

describe("M0 B12 safe invitation resend", () => {
  const originalSecret = process.env.DOGRUADRES_INVITATION_SECRET
  const input = {
    organization_id: "daorg_test",
    actor_person_id: "daprs_owner",
    actor_type: "user",
    actor_id: "user_owner",
    email: "recipient@example.test",
    role: "member" as const,
  }

  beforeAll(() => { process.env.DOGRUADRES_INVITATION_SECRET = "unit-test-" + "x".repeat(48) })
  afterAll(() => {
    if (originalSecret === undefined) delete process.env.DOGRUADRES_INVITATION_SECRET
    else process.env.DOGRUADRES_INVITATION_SECRET = originalSecret
  })

  function setup(protectedOwner = true) {
    const service = Object.create(AccessService.prototype) as AccessService
    // The real service checks a live, transaction-bound protected Owner SQL
    // proof BEFORE the advisory lock, existing invite lookup and any mutation.
    // Only the exact protected-Owner query may receive a synthetic match.
    const tx = { execute: jest.fn(async (sql:string) =>
      sql.includes("m.protected_owner=true")
        ? protectedOwner ? [{id:"damem_synthetic_owner"}] : []
        : []) }
    const context = { transactionManager: tx } as unknown as Context
    jest.spyOn(service as any, "getActiveMembership").mockResolvedValue({
      role:"owner",status:"active",protected_owner:protectedOwner,
      person_id:"daprs_owner",organization_id:"daorg_test",
    })
    jest.spyOn(service as any, "getOrganization").mockResolvedValue({id:"daorg_test"})
    jest.spyOn(service as any, "listPeople").mockResolvedValue([{id:"daprs_owner"}])
    const create = jest.spyOn(service as any, "createInvitations").mockResolvedValue([])
    const update = jest.spyOn(service as any, "updateInvitations").mockResolvedValue([])
    const audit = jest.spyOn(service as any, "persistAuditEventsWithOutbox_").mockResolvedValue([])
    return {service,tx,context,create,update,audit}
  }

  afterEach(() => jest.restoreAllMocks())

  it("refuses retired Admin through the direct invitation service without even reading targets",async()=>{
    const {service,context,tx,create,update,audit}=setup()
    const find=jest.spyOn(service as any,"getActiveMembership")
    await expect(service.createOrganizationInvitation({...input,role:"admin"},context))
      .rejects.toThrow("Organization Admin invitations are not permitted")
    expect(find).not.toHaveBeenCalled()
    expect(tx.execute).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("refuses an old pending Admin invitation without activating membership or changing the invitation",async()=>{
    const {service,context,tx,create,update,audit}=setup()
    const token=deriveInvitationToken("dainv_legacy")
    const legacy={
      id:"dainv_legacy",organization_id:"daorg_test",role:"admin",
      recipient_email:"recipient@example.test",status:"pending",
      token_hash:hashInvitationToken(token),expires_at:new Date(Date.now()+60000)
    }
    const list=jest.spyOn(service as any,"listInvitations").mockResolvedValue([legacy])
    const lock=jest.spyOn(service as any,"lockInvitation_").mockResolvedValue(undefined)
    const memberships=jest.spyOn(service as any,"createMemberships").mockResolvedValue([])
    await expect(service.acceptOrganizationInvitation({
      token,email:"recipient@example.test",email_verified:true,
      actor:{actor_type:"user",actor_id:"user_recipient"} as any
    },context)).rejects.toThrow("Legacy Organization Admin invitations cannot be accepted")
    expect(list).toHaveBeenCalledTimes(2)
    expect(lock).toHaveBeenCalledWith("dainv_legacy",context)
    expect(tx.execute).not.toHaveBeenCalled()
    expect(memberships).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("reuses a valid pending token without revoking, creating or auditing again", async () => {
    const {service,tx,context,create,update,audit}=setup()
    const existing = {
      id:"dainv_prior",role:"member",status:"pending",
      expires_at:new Date(Date.now()+60_000),
      token_hash:hashInvitationToken(deriveInvitationToken("dainv_prior")),
    }
    jest.spyOn(service as any,"listInvitations").mockResolvedValue([existing])
    const result = await service.createOrganizationInvitation(input,context)
    expect(result).toEqual(existing)
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining("m.protected_owner=true"),
      ["daprs_owner","daorg_test"]
    )
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [JSON.stringify(["daorg_test","recipient@example.test"])]
    )
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("fails closed on duplicate pending links without mutations", async () => {
    const {service,context,create,update,audit}=setup()
    const make = (id:string) => ({
      id,role:"member",status:"pending",expires_at:new Date(Date.now()+60_000),
      token_hash:hashInvitationToken(deriveInvitationToken(id)),
    })
    jest.spyOn(service as any,"listInvitations").mockResolvedValue([make("dainv_one"),make("dainv_two")])
    await expect(service.createOrganizationInvitation(input,context))
      .rejects.toThrow("Multiple active invitations require authorized review")
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("never resends a token that no longer matches the stored hash", async () => {
    const {service,context,create,update,audit}=setup()
    jest.spyOn(service as any,"listInvitations").mockResolvedValue([{
      id:"dainv_old",role:"member",status:"pending",
      expires_at:new Date(Date.now()+60_000),
      token_hash:"nonmatching-hash",
    }])
    await expect(service.createOrganizationInvitation(input,context))
      .rejects.toThrow("Existing invitation cannot be safely resent")
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("rejects ungranted Admin creation/revocation before private read or mutation",async()=>{
    const {service,tx,context,create,update,audit}=setup()
    jest.spyOn(service as any,"getActiveMembership").mockResolvedValue({
      role:"admin",status:"active",protected_owner:false,
      person_id:"daprs_owner",organization_id:"daorg_test",
    })
    const list=jest.spyOn(service as any,"listInvitations").mockResolvedValue([])
    const getInvite=jest.spyOn(service as any,"getInvitationInOrganization").mockResolvedValue(null)
    await expect(service.createOrganizationInvitation(input,context))
      .rejects.toThrow("Organization action permission is required")
    await expect(service.revokeOrganizationInvitation({
      organization_id:"daorg_test",invitation_id:"dainv_test",
      actor_person_id:"daprs_owner",actor_type:"user",actor_id:"user_owner",
    },context)).rejects.toThrow("Organization action permission is required")
    expect(tx.execute).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
    expect(getInvite).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("rejects a role-only, unprotected Owner before reading or writing invitations", async()=>{
    const {service,tx,context,create,update,audit}=setup(false)
    const list=jest.spyOn(service as any,"listInvitations").mockResolvedValue([])
    await expect(service.createOrganizationInvitation(input,context))
      .rejects.toThrow("Organization action permission is required")
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining("m.protected_owner=true"),
      ["daprs_owner","daorg_test"]
    )
    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(list).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
