import { IdentitySessions, IdentityAccessDenied } from "../identity-session"
import { authorizedLegalSellerIds, authorizedProductEditScope, verifiedStoreProductEditGrant } from "../legal-store-ownership"

describe("B22 legal Organization ownership candidate gate (SQL-mock, NOT PostgreSQL acceptance)", () => {
  afterEach(() => jest.restoreAllMocks())
  const token = "x".repeat(43), org = "daorg_A"
  const allowed = { person_id: "person_A", organizations: [{ id: org, role: "owner" }] }
  const setup = (scope: unknown, rows: any[] = []) => {
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(scope as any)
    const execute = jest.fn().mockResolvedValue(rows)
    return { execute, run:() => authorizedLegalSellerIds({ execute },token,org) }
  }
  it("only returns explicitly recorded current ownership, never SellerMember or an implicit default",async()=>{
    const { execute,run }=setup(allowed,[{seller_id:"sel_1"},{seller_id:"sel_2"}])
    await expect(run()).resolves.toEqual({person_id:"person_A",organization_id:org,seller_ids:["sel_1","sel_2"]})
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("e.action='organization.store_association_approved'"),[org])
    expect(execute.mock.calls[0][0]).toContain("da_audit_outbox")
    expect(execute.mock.calls[0][0]).toContain("e.organization_id=o.organization_id")
    expect(execute.mock.calls[0][0]).toContain("e.target_id=o.seller_id")
  })
  it.each([null,{person_id:"person_B",organizations:[]},{person_id:"person_A",organizations:[{id:org,role:"member"}]}])(
    "denies untrusted, foreign or non-manager Organization membership before ownership read",async scope=>{
      const { execute,run }=setup(scope,[{seller_id:"sel_foreign"}])
      await expect(run()).resolves.toBeNull()
      expect(execute).not.toHaveBeenCalled()
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
  it("never substitutes active Organization membership for the product permission",async()=>{
    jest.spyOn(IdentitySessions.prototype,"organizations").mockResolvedValue(
      {person_id:person,organizations:[{id:org,role:"owner"}]} as any)
    const execute=jest.fn().mockResolvedValueOnce([{seller_id:seller}]).mockResolvedValueOnce([])
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
