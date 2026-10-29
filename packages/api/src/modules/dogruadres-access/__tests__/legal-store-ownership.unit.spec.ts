import { IdentitySessions, IdentityAccessDenied } from "../identity-session"
import { authorizedLegalSellerIds } from "../legal-store-ownership"

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
    expect(execute.mock.calls).toEqual([[expect.stringContaining("revoked_at is null"),[org]]])
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
