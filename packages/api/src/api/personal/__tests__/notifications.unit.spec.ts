import { GET, POST } from '../notifications/route'
import { access, csrf, enabled, sessionToken } from '../security'
import { IdentityAccessDenied, IdentitySessions } from '../../../modules/dogruadres-access/identity-session'
import { PersonalNotifications } from '../../../modules/dogruadres-access/personal-notifications'
jest.mock('../security',()=>({access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()}))

describe('personal notification transport boundaries (not E2E)',()=>{
  let service:any,req:any,res:any
  beforeEach(()=>{
    service={personalSession:jest.fn(async()=>({person_id:'server-person'})),personalNotifications:jest.fn(async()=>({notifications:[],unread_count:0,next_offset:null})),readPersonalNotification:jest.fn(async()=>({success:true}))}
    req={query:{},body:{id:'danot_11111111-1111-4111-8111-111111111111'}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
    ;(enabled as jest.Mock).mockReturnValue(true);(sessionToken as jest.Mock).mockReturnValue('t'.repeat(43));(access as jest.Mock).mockReturnValue(service);(csrf as jest.Mock).mockResolvedValue(true)
  })
  it('never accepts a browser-supplied recipient or arbitrary notification payload',async()=>{
    req.body.person_id='other-person';await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400);expect(service.readPersonalNotification).not.toHaveBeenCalled()
    req.query={person_id:'other-person'};await GET(req,res);expect(service.personalNotifications).not.toHaveBeenCalled()
  })
  it('requires current session and CSRF before any receipt write',async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false);await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403);expect(service.readPersonalNotification).not.toHaveBeenCalled()
    service.personalSession.mockResolvedValue(null);await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(401);expect(service.readPersonalNotification).not.toHaveBeenCalled()
  })
  it('uses only the server credential for listing and forbids caching',async()=>{
    await GET(req,res)
    expect(service.personalNotifications).toHaveBeenCalledWith('t'.repeat(43),0,undefined)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
  })
  it('returns indistinguishable denial for foreign or nonexistent receipts',async()=>{
    service.readPersonalNotification.mockRejectedValue(new IdentityAccessDenied());await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403);expect(res.json).toHaveBeenCalledWith({message:'Access denied'})
  })
  it('fails closed on persistence failure without reporting a completed read',async()=>{
    service.readPersonalNotification.mockRejectedValue(new Error('private SQL details'));await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({message:'Service unavailable'})
  })
})

describe("notification bell workspace isolation (SQL contract; real PG/browser NOT TESTED)", () => {
  const token = "synthetic-person-session"
  const person = "daprs_synthetic_a"
  const organization = "daorg_synthetic_x"

  beforeEach(() => {
    jest.spyOn(IdentitySessions.prototype, "current").mockResolvedValue({
      person_id: person,
      actor_type: "user",
      actor_id: "usr_synthetic_a",
    } as any)
    jest.spyOn(IdentitySessions.prototype, "organizations").mockResolvedValue({
      organizations: [{ id: organization, role: "owner" }],
    } as any)
  })
  afterEach(() => jest.restoreAllMocks())

  const companyGuards = (sql: string) =>
    (sql.match(/\(\?<>'' and (?:a|c)\.organization_id=\?\)/g) || []).length

  it.each([undefined, organization])(
    "keeps list and unread count behind exactly the same personal/X company boundary: %s",
    async selected => {
      const execute = jest.fn().mockResolvedValue([
        { items: [], unread_count: "0", total: "0" },
      ])
      const notifications = new PersonalNotifications({ execute } as any)
      const result = await notifications.list(token, 0, selected)
      expect(result).toEqual({ notifications: [], unread_count: 0, next_offset: null })
      expect(execute).toHaveBeenCalledTimes(1)
      const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
      // Executed SQL must have one bound parameter per placeholder; a mock
      // alone cannot prove PostgreSQL execution, but must not hide bind drift.
      expect((sql.match(/\\?/g) || []).length).toBe(params.length)
      // No Organization = the personal bell. Company groups must be absent
      // instead of merging every company where the Person is also an Owner.
      expect(companyGuards(sql)).toBe(4)
      expect(sql).not.toContain("(?='' or")
      expect(sql).toContain("select (select count(*) from authorized where read_at is null)")
      expect(sql).toContain("from authorized")
      expect(params).toEqual([
        person, selected ?? "", selected ?? "", selected ?? "", selected ?? "",
        person, selected ?? "", selected ?? "", person, selected ?? "",
        selected ?? "", 0,
      ])
      // Revocation after membership exit is a personal notice in ALL
      // workspaces, with no former Organization name disclosed.
      expect(sql).toMatch(/source'='membership_exit'\s+and a\.previous_values->>'person_id'/)
      expect(sql).toContain("then null else o.name end as organization_name")
    },
  )

  it.each([undefined, organization])(
    "uses the same company filters for single-receipt read mutation: %s",
    async selected => {
      const execute = jest.fn().mockResolvedValue([
        { id: "danot_synthetic_read", read_at: new Date("2026-11-01T00:00:00Z") },
      ])
      const notifications = new PersonalNotifications({ execute } as any)
      await expect(
        notifications.read(token, "danot_synthetic_read", selected),
      ).resolves.toEqual({ success: true })
      expect(execute).toHaveBeenCalledTimes(1)
      const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
      expect((sql.match(/\\?/g) || []).length).toBe(params.length)
      expect(companyGuards(sql)).toBe(2)
      expect(sql).not.toContain("(?='' or")
      expect(sql).toMatch(/source'='membership_exit'\s+and a\.previous_values->>'person_id'/)
      expect(params).toEqual([
        "danot_synthetic_read", person,
        selected ?? "", selected ?? "", selected ?? "", selected ?? "",
      ])
    },
  )

  it("does not even query receipt data for an unrecognized Organization selector", async () => {
    jest.spyOn(IdentitySessions.prototype, "organizations").mockResolvedValue({
      organizations: [],
    } as any)
    const execute = jest.fn()
    const notifications = new PersonalNotifications({ execute } as any)
    await expect(notifications.list(token, 0, organization))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
    await expect(notifications.read(token, "danot_foreign", organization))
      .rejects.toBeInstanceOf(IdentityAccessDenied)
    expect(execute).not.toHaveBeenCalled()
  })

  it("keeps the personal bell available without requiring Organization selection", async () => {
    const orgSpy = jest.spyOn(IdentitySessions.prototype, "organizations")
    const execute = jest.fn().mockResolvedValue([
      { items: [], unread_count: 0, total: 0 },
    ])
    await new PersonalNotifications({ execute } as any).list(token)
    expect(orgSpy).not.toHaveBeenCalled()
  })
})
