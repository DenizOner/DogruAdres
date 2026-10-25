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

  function setup() {
    const service = Object.create(AccessService.prototype) as AccessService
    const tx = { execute: jest.fn(async () => []) }
    const context = { transactionManager: tx } as unknown as Context
    jest.spyOn(service as any, "getActiveMembership").mockResolvedValue({role:"owner"})
    jest.spyOn(service as any, "getOrganization").mockResolvedValue({id:"daorg_test"})
    jest.spyOn(service as any, "listPeople").mockResolvedValue([{id:"daprs_owner"}])
    const create = jest.spyOn(service as any, "createInvitations").mockResolvedValue([])
    const update = jest.spyOn(service as any, "updateInvitations").mockResolvedValue([])
    const audit = jest.spyOn(service as any, "persistAuditEventsWithOutbox_").mockResolvedValue([])
    return {service,tx,context,create,update,audit}
  }

  afterEach(() => jest.restoreAllMocks())

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
      expect.stringContaining("pg_advisory_xact_lock"),
      [JSON.stringify(["daorg_test","recipient@example.test"])]
    )
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("fails closed on duplicate pending links without mutations", async () => {
    const {service,context,create}=setup()
    const make = (id:string) => ({
      id,role:"member",status:"pending",expires_at:new Date(Date.now()+60_000),
      token_hash:hashInvitationToken(deriveInvitationToken(id)),
    })
    jest.spyOn(service as any,"listInvitations").mockResolvedValue([make("dainv_one"),make("dainv_two")])
    await expect(service.createOrganizationInvitation(input,context))
      .rejects.toThrow("Multiple active invitations require authorized review")
    expect(create).not.toHaveBeenCalled()
  })

  it("never resends a token that no longer matches the stored hash", async () => {
    const {service,context,create}=setup()
    jest.spyOn(service as any,"listInvitations").mockResolvedValue([{
      id:"dainv_old",role:"member",status:"pending",
      expires_at:new Date(Date.now()+60_000),
      token_hash:"nonmatching-hash",
    }])
    await expect(service.createOrganizationInvitation(input,context))
      .rejects.toThrow("Existing invitation cannot be safely resent")
    expect(create).not.toHaveBeenCalled()
  })
})
