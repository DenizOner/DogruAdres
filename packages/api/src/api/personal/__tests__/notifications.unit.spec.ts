import { GET, POST } from '../notifications/route'
import { access, csrf, enabled, sessionToken } from '../security'
import { IdentityAccessDenied, IdentitySessions } from '../../../modules/dogruadres-access/identity-session'
import { PersonalNotifications } from '../../../modules/dogruadres-access/personal-notifications'
import { GET as personalPageGET } from '../route'
import { trustedInlineScripts } from './trusted-inline-scripts'
import { createContext, runInContext } from 'node:vm'
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
  it('forwards explicit selected-company context on both receipt listing and read',async()=>{
    req.query={organization:'daorg_X',offset:'12'}
    await GET(req,res)
    expect(service.personalNotifications).toHaveBeenCalledWith('t'.repeat(43),12,'daorg_X')
    req.query={organization:'daorg_X'}
    await POST(req,res)
    expect(service.readPersonalNotification).toHaveBeenCalledWith(
      't'.repeat(43),'danot_11111111-1111-4111-8111-111111111111','daorg_X')
    expect(csrf).toHaveBeenCalled()
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
      expect((sql.match(/\?/g) || []).length).toBe(params.length)
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
      expect((sql.match(/\?/g) || []).length).toBe(params.length)
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

describe('notification context in shipped UI (VM scheduling, not browser/PG authority)',()=>{
  async function harness(){
    (enabled as jest.Mock).mockReturnValue(true)
    const res:any={setHeader:jest.fn(),type:jest.fn().mockReturnThis(),send:jest.fn()}
    await personalPageGET({} as any,res)
    const code=trustedInlineScripts(res.send.mock.calls[0][0] as string).join('\n')
    const start=code.indexOf('  function clearNotifications(){')
    const end=code.indexOf('  function closeNotifications()',start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const nodes=new Map<string,any>()
    const element=(tag='div')=>({
      tag,textContent:'',hidden:false,children:[] as any[],
      attributes:{} as Record<string,string>,disabled:false,
      setAttribute(name:string,value:string){this.attributes[name]=value},
      replaceChildren(){this.children=[];this.textContent=''},
      append(...items:any[]){this.children.push(...items)},
      focus(){},
    })
    const el=(id:string)=>{
      if(!nodes.has(id))nodes.set(id,element(id))
      return nodes.get(id)
    }
    const calls:Array<{path:string;options:any;resolve:(v:any)=>void}>=[]
    const context=createContext({
      el,document:{hidden:false,createElement:(tag:string)=>element(tag)},
      api:(path:string,options?:unknown)=>new Promise(resolve=>calls.push({path,options,resolve})),
      concealPrivateView:jest.fn(),status:jest.fn(),
    })
    runInContext(`let notificationRequest=0,notificationOffset=0,notificationNext=null;
      let currentOrg='',currentPersonId='daprs_test',organizationRequest=0,viewEpoch=0;
      `+code.slice(start,end),context)
    el('workspace').hidden=false
    return {calls,context,el,run:(source:string)=>runInContext(source,context)}
  }
  const empty={notifications:[],unread_count:0,next_offset:null}
  const notice=(title:string)=>({
    id:'danot_11111111-1111-4111-8111-111111111111',
    title,context:'Company private',description:'Internal message',
    created_at:'2026-11-17T00:00:00Z',read_at:null
  })
  it('keeps personal GET unselected and uses selected company for both GET and POST',async()=>{
    const h=await harness()
    const person=h.run('notifications(0)') as Promise<void>
    expect(h.calls[0].path).toBe('notifications?offset=0')
    h.calls[0].resolve(empty);await person
    h.run("currentOrg='daorg_X';organizationRequest++")
    const scoped=h.run('notifications(0)') as Promise<void>
    expect(h.calls[1].path).toBe('notifications?organization=daorg_X&offset=0')
    h.calls[1].resolve({...empty,notifications:[notice('X Store notice')],unread_count:1})
    await scoped
    expect(h.el('notification-list').children).toHaveLength(1)
    const button=h.el('notification-list').children[0].children[4]
    const mark=button.onclick() as Promise<void>
    expect(h.calls[2].path).toBe('notifications?organization=daorg_X')
    expect(h.calls[2].options).toMatchObject({method:'POST'})
    h.calls[2].resolve({success:true})
    await new Promise<void>(resolve=>setImmediate(resolve))
    expect(h.calls[3].path).toBe('notifications?organization=daorg_X&offset=0')
    h.calls[3].resolve(empty);await mark
    expect(h.el('notification-list').children).toHaveLength(0)
  })
  it('drops a stale X reply and prevents detached X read buttons from posting after Y selection',async()=>{
    const h=await harness()
    h.run("currentOrg='daorg_X';organizationRequest++")
    const x=h.run('notifications(0)') as Promise<void>
    h.run("clearNotifications();currentOrg='daorg_Y';organizationRequest++")
    const y=h.run('notifications(0)') as Promise<void>
    expect(h.calls.map(c=>c.path)).toEqual([
      'notifications?organization=daorg_X&offset=0',
      'notifications?organization=daorg_Y&offset=0',
    ])
    h.calls[1].resolve({...empty,notifications:[notice('Y only')],unread_count:1});await y
    h.calls[0].resolve({...empty,notifications:[notice('X private')],unread_count:1});await x
    expect(h.el('notification-list').children).toHaveLength(1)
    expect(h.el('notification-list').children[0].children[0].textContent).toBe('Y only')
    const detached=h.el('notification-list').children[0].children[4]
    h.run("clearNotifications();currentOrg='daorg_X';organizationRequest++")
    await detached.onclick()
    expect(h.calls).toHaveLength(2)
    expect(h.el('notification-list').children).toHaveLength(0)
  })
})
