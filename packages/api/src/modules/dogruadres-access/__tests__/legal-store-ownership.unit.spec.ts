import { IdentitySessions, IdentityAccessDenied } from "../identity-session"
import { authorizedLegalSellerIds, authorizedProductEditScope, verifiedStoreProductEditGrant, platformApprovedSellerIds } from "../legal-store-ownership"
import { organizationActionAllowed, ownerRoleAllows, DEFAULT_OWNER_ACTIONS } from "../role-action-policy"
import { authorizedBuyerOrganization } from "../buyer-permission"

describe("B22 legal Organization ownership candidate gate (SQL-mock, NOT PostgreSQL acceptance)", () => {
  afterEach(() => jest.restoreAllMocks())
  const token = "x".repeat(43), org = "daorg_A"
  const allowed = { person_id: "daprs_A", organizations: [{ id: org, role: "owner" }] }
  const setup = (scope: unknown, rows: any[] = [], protectedOwner = true) => {
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(scope as any)
    const execute = jest.fn(async(sql:string)=>sql.includes("m.protected_owner=true")
      ? (protectedOwner?[{id:"damem_owner"}]:[]) : rows)
    return { execute, run:() => authorizedLegalSellerIds({ execute },token,org) }
  }
  it("only returns explicitly recorded current ownership, never SellerMember or an implicit default",async()=>{
    const { execute,run }=setup(allowed,[{seller_id:"sel_1"},{seller_id:"sel_2"}])
    await expect(run()).resolves.toEqual({person_id:"daprs_A",organization_id:org,seller_ids:["sel_1","sel_2"]})
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("e.action='organization.store_association_approved'"),[org])
    const ownershipSql=execute.mock.calls[1][0]
    expect(execute.mock.calls[0][0]).toContain("m.protected_owner=true")
    expect(ownershipSql).toContain("da_audit_outbox")
    expect(ownershipSql).toContain("e.organization_id=o.organization_id")
    expect(ownershipSql).toContain("e.target_id=o.seller_id")
    expect(ownershipSql).toContain("current_owner.status='active'")
    expect(ownershipSql).toContain("current_owner.deleted_at is null")
  })
  it.each([null,{person_id:"person_B",organizations:[]},{person_id:"person_A",organizations:[{id:org,role:"member"}]}])(
    "denies untrusted, foreign or non-manager Organization membership before ownership read",async scope=>{
      const { execute,run }=setup(scope,[{seller_id:"sel_foreign"}])
      await expect(run()).resolves.toBeNull()
      expect(execute).not.toHaveBeenCalled()
    })
  it("refuses unprotected role-only Owner before reading private legal Store ids",async()=>{
    const {execute,run}=setup(allowed,[{seller_id:"sel_private"}],false)
    await expect(run()).resolves.toBeNull()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toContain("m.protected_owner=true")
  })
  it("an Organization with no verified ownership has zero Stores rather than inferred native rights",async()=>{
    await expect(setup(allowed,[]).run()).resolves.toMatchObject({seller_ids:[]})
  })
  it.each([
    { label: "duplicate", rows: [{seller_id:"sel_a"},{seller_id:"sel_a"}] },
    { label: "malformed", rows: [{seller_id:"other"}] },
    { label: "unbounded", rows: Array.from({length:51},(_,i)=>({seller_id:"sel_"+i})) }
  ])("denies $label ownership data",async ({rows})=>{
    await expect(setup(allowed,rows).run()).rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("rejects malformed Organization IDs before touching any DB",async()=>{
    const execute=jest.fn()
    await expect(authorizedLegalSellerIds({execute},token,"invalid")).rejects.toBeInstanceOf(IdentityAccessDenied)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("B22 bounded historical Store ownership proof (SQL mock, NOT PG16)",()=>{
  const org="daorg_A"
  it("reads only listed Sellers, not 51 unrelated verified Organization Stores",async()=>{
    const all=Array.from({length:51},(_,i)=>({seller_id:"sel_unrelated_"+i}))
    const execute=jest.fn(async(sql:string,params:unknown[])=>{
      if(sql.includes("o.seller_id in (?)")&&params.length===2)
        return [{seller_id:"sel_target"}]
      return all
    })
    await expect(platformApprovedSellerIds({execute},org,["sel_target"]))
      .resolves.toEqual(["sel_target"])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toContain("da_audit_outbox")
    expect(execute.mock.calls[0][0]).toContain("o.revoked_at is null")
    expect(execute.mock.calls[0][1]).toEqual([org,"sel_target"])
    await expect(platformApprovedSellerIds({execute},org))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
  })
  it("keeps a revoked/missing candidate absent, never falls back to all Stores",async()=>{
    const execute=jest.fn().mockResolvedValue([])
    await expect(platformApprovedSellerIds({execute},org,["sel_revoked"]))
      .resolves.toEqual([])
    expect(execute.mock.calls[0][1]).toEqual([org,"sel_revoked"])
    expect(execute.mock.calls[0][0]).toContain("o.seller_id in (?)")
  })
  it("skips database access when a history page has no created Seller candidates",async()=>{
    const execute=jest.fn()
    await expect(platformApprovedSellerIds({execute},org,[])).resolves.toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })
  it.each([
    ["malformed",["bad"]],
    ["duplicate",["sel_a","sel_a"]],
    ["more than a single 30-application page",Array.from({length:31},(_,i)=>"sel_"+i)]
  ])("rejects unsafe %s candidate IDs before a native or SQL read",async(_,ids)=>{
    const execute=jest.fn()
    await expect(platformApprovedSellerIds({execute},org,ids))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("B22 distinct products.edit grant (SQL mock only)",()=>{
  afterEach(()=>jest.restoreAllMocks())
  const person="daprs_A",org="daorg_A",seller="sel_A",token="x".repeat(43)
  it("requires current membership, recorded Store and independently issued product action",async()=>{
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(
      {person_id:person,organizations:[{id:org,role:"member"}]} as any)
    const execute=jest.fn()
      .mockResolvedValueOnce([{seller_id:seller}])
      .mockResolvedValueOnce([{id:"daspg_A"}])
    await expect(authorizedProductEditScope({execute},token,org,seller))
      .resolves.toEqual({person_id:person,organization_id:org,seller_id:seller})
    expect(execute.mock.calls[1][0]).toContain("da_audit_outbox")
    expect(execute.mock.calls[1][0]).toContain("e.new_values->>'permission'=g.permission")
    expect(execute.mock.calls[1][1]).toEqual([person,org,seller])
  })
  it("permits active protected Owner without extra product permission",async()=>{
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(
      {person_id:person,organizations:[{id:org,role:"owner"}]} as any)
    const execute=jest.fn().mockResolvedValueOnce([{seller_id:seller}])
      .mockResolvedValueOnce([{id:"damem_owner"}])
    await expect(authorizedProductEditScope({execute},token,org,seller))
      .resolves.toEqual({person_id:person,organization_id:org,seller_id:seller})
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1][0]).toContain("m.protected_owner=true")
  })
  it("denies an unprotected Owner role without explicit permission",async()=>{
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(
      {person_id:person,organizations:[{id:org,role:"owner"}]} as any)
    const execute=jest.fn().mockResolvedValueOnce([{seller_id:seller}])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await expect(authorizedProductEditScope({execute},token,org,seller)).resolves.toBeNull()
  })
  it("denies an unapproved or foreign Store without even reading action grants",async()=>{
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(
      {person_id:person,organizations:[{id:org,role:"admin"}]} as any)
    const execute=jest.fn().mockResolvedValueOnce([])
    await expect(authorizedProductEditScope({execute},token,org,seller)).resolves.toBeNull()
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it("denies an inactive Person membership before any Store or grant read",async()=>{
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(null as any)
    const execute=jest.fn()
    await expect(authorizedProductEditScope({execute},token,org,seller)).resolves.toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })
  it("does not accept duplicate, malformed or missing permission rows",async()=>{
    for(const rows of [[],[{id:"bad"}],[{id:"daspg_a"},{id:"daspg_b"}]]){
      const execute=jest.fn().mockResolvedValue(rows)
      if(rows.length===0)await expect(verifiedStoreProductEditGrant({execute},person,org,seller)).resolves.toBe(false)
      else await expect(verifiedStoreProductEditGrant({execute},person,org,seller)).rejects.toBeInstanceOf(IdentityAccessDenied)
    }
  })
})

describe("B22 shared Owner action policy (pure decision, NOT live policy administration)",()=>{
  it("grants the currently approved Owner defaults only with fresh protected membership proof",()=>{
    expect(DEFAULT_OWNER_ACTIONS).toEqual(["buyer.purchase","products.edit","invitation.manage","membership.manage","membership.list","audit.timeline.read","organization.read","price.group.manage","store.follow","store.application.draft.manage"])
    expect(Object.isFrozen(DEFAULT_OWNER_ACTIONS)).toBe(true)
    for(const action of DEFAULT_OWNER_ACTIONS){
      expect(ownerRoleAllows(action)).toBe(true)
      expect(organizationActionAllowed("owner",action,true,false)).toBe(true)
      expect(organizationActionAllowed("owner",action,false,true)).toBe(false)
      expect(organizationActionAllowed("member",action,false,false)).toBe(false)
      expect(organizationActionAllowed("admin",action,false,false)).toBe(false)
      expect(organizationActionAllowed("member",action,false,true)).toBe(!["invitation.manage","membership.manage","membership.list","audit.timeline.read","price.group.manage","store.follow"].includes(action))
    }
    expect(organizationActionAllowed("admin","store.application.draft.manage",false,true)).toBe(false)
    expect(organizationActionAllowed("member","store.application.draft.manage",false,true)).toBe(true)
    expect(organizationActionAllowed("member","store.application.draft.manage",false,false)).toBe(false)
    expect(organizationActionAllowed("platform_staff","products.edit",true,true)).toBe(false)
  })
  it("immutable protected Owner policy cannot be narrowed by a request or personal grant",()=>{
    for(const action of DEFAULT_OWNER_ACTIONS){
      expect(organizationActionAllowed("owner",action,true,false)).toBe(true)
      expect(organizationActionAllowed("owner",action,true,true)).toBe(true)
      expect(organizationActionAllowed("owner",action,false,true)).toBe(false)
    }
    for(const action of ["invitation.manage","membership.manage","membership.list","audit.timeline.read"] as const){
      expect(organizationActionAllowed("admin",action,false,true)).toBe(false)
      expect(organizationActionAllowed("member",action,false,true)).toBe(false)
    }
  })
  it("Buyer scope checks current Owner proof under the same default as products.edit",async()=>{
    const person="daprs_A",org="daorg_A",token="x".repeat(43)
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(
      {person_id:person,organizations:[{id:org,role:"owner"}]} as any)
    const execute=jest.fn().mockResolvedValueOnce([{id:"damem_owner"}])
    await expect(authorizedBuyerOrganization({execute},token,org))
      .resolves.toEqual({person_id:person,organization_id:org})
    expect(execute.mock.calls[0][0]).toContain("protected_owner=true")
    expect(execute).toHaveBeenCalledTimes(1)
    jest.restoreAllMocks()
  })
})

describe("B22 fixed protected Owner policy under legacy deployment settings",()=>{
  const previous=process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
  afterEach(()=>{
    if(previous===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
    else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=previous
  })
  it("keeps every Owner action, even with an empty, narrowed or malformed legacy setting",()=>{
    for(const setting of [undefined,"","admin","products.edit","buyer.purchase,buyer.purchase"," buyer.purchase","buyer.purchase,platform.smtp.manage"]){
      if(setting===undefined)delete process.env.DOGRUADRES_OWNER_ROLE_ACTIONS
      else process.env.DOGRUADRES_OWNER_ROLE_ACTIONS=setting
      for(const action of DEFAULT_OWNER_ACTIONS){
        expect(ownerRoleAllows(action)).toBe(true)
        expect(organizationActionAllowed("owner",action,true,false)).toBe(true)
        expect(organizationActionAllowed("owner",action,false,true)).toBe(false)
      }
      expect(organizationActionAllowed("member","price.group.manage",false,true)).toBe(false)
      expect(organizationActionAllowed("admin","membership.manage",false,true)).toBe(false)
    }
  })
})
