import { access, csrf, enabled, sessionToken } from "../security"
import { GET, POST } from "../memberships/route"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createContext, runInContext } from "node:vm"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("personal memberships route", () => {
  const token = "da_test_session_token_12345678901234567890123"
  const orgId = "daorg_01M0TESTORGANIZATION123456"
  const memberId = "daomem_01M0TESTMEMBERSHIP12345"

  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)

    mockService = {
      personalMemberships: jest.fn().mockResolvedValue([
        { id: "daomem_owner", person_id: "daprs_owner", role: "owner", status: "active", protected_owner: true },
        { id: memberId, person_id: "daprs_member", role: "member", status: "active", protected_owner: false },
      ]),
      personalRevokeMembership: jest.fn().mockResolvedValue({ id: memberId, status: "revoked" }),
      personalChangeMembershipRole: jest.fn().mockResolvedValue({ id: memberId, role: "admin", status: "active" }),
      personalSession: jest.fn().mockResolvedValue({ person_id: "daprs_owner" }),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)

    req = {
      headers: {
        host: "127.0.0.1:19102",
        cookie: `da_session=${token}`,
        "x-csrf-token": "valid-csrf-token",
      },
      query: {},
      body: {},
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "dogruadresAccess") return mockService
          throw new Error(`Unexpected resolve: ${key}`)
        }),
      },
    }

    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
  })

  describe("GET /personal/memberships", () => {
    it("returns membership list for authorized Owner/Admin with valid organization query", async () => {
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(mockService.personalMemberships).toHaveBeenCalledWith(token, orgId)
      expect(res.json).toHaveBeenCalledWith({
        memberships: [
          { id: "daomem_owner", person_id: "daprs_owner", role: "owner", status: "active", protected_owner: true },
          { id: memberId, person_id: "daprs_member", role: "member", status: "active", protected_owner: false },
        ],
      })
    })

    it("does not serialize implicit ORM relations or unrelated fields", async () => {
      req.query = { organization: orgId }
      mockService.personalMemberships.mockResolvedValueOnce([{ id: memberId, person_id: 'p', role: 'member', status: 'active', protected_owner: false, person: { id: 'p', email: 'private@example.invalid' }, secret: 'must-not-serialize' }])
      await GET(req, res)
      expect(res.json).toHaveBeenCalledWith({ memberships: [{ id: memberId, person_id: 'p', role: 'member', status: 'active', protected_owner: false }] })
    })

    it("rejects invalid or malformed organization ID", async () => {
      req.query = { organization: "invalid_org" }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
    })

    it("rejects extraneous query parameters", async () => {
      req.query = { organization: orgId, extra: "param" }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
    })

    it("returns 503 when service is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({ message: "Unavailable" })
    })
  })

  describe("POST /personal/memberships", () => {
    it("changes active member role to admin when role='admin' is supplied", async () => {
      req.body = { organization_id: orgId, membership_id: memberId, role: "admin" }
      await POST(req, res)
      expect(mockService.personalChangeMembershipRole).toHaveBeenCalledWith(token, orgId, memberId, "admin")
      expect(res.json).toHaveBeenCalledWith({
        membership: { id: memberId, role: "admin", status: "active" },
      })
    })

    it("changes active admin role to member when role='member' is supplied", async () => {
      mockService.personalChangeMembershipRole.mockResolvedValueOnce({ id: memberId, role: "member", status: "active" })
      req.body = { organization_id: orgId, membership_id: memberId, role: "member" }
      await POST(req, res)
      expect(mockService.personalChangeMembershipRole).toHaveBeenCalledWith(token, orgId, memberId, "member")
      expect(res.json).toHaveBeenCalledWith({
        membership: { id: memberId, role: "member", status: "active" },
      })
    })

    it("accepts optional action='role' in payload", async () => {
      req.body = { action: "role", organization_id: orgId, membership_id: memberId, role: "admin" }
      await POST(req, res)
      expect(mockService.personalChangeMembershipRole).toHaveBeenCalledWith(token, orgId, memberId, "admin")
      expect(res.json).toHaveBeenCalledWith({
        membership: { id: memberId, role: "admin", status: "active" },
      })
    })

    it("preserves backward-compatible revoke when role is omitted", async () => {
      req.body = { organization_id: orgId, membership_id: memberId }
      await POST(req, res)
      expect(mockService.personalRevokeMembership).toHaveBeenCalledWith(token, orgId, memberId)
      expect(res.json).toHaveBeenCalledWith({
        membership: { id: memberId, status: "revoked" },
      })
    })

    it("preserves backward-compatible revoke when action='revoke' is explicit", async () => {
      req.body = { action: "revoke", organization_id: orgId, membership_id: memberId }
      await POST(req, res)
      expect(mockService.personalRevokeMembership).toHaveBeenCalledWith(token, orgId, memberId)
      expect(res.json).toHaveBeenCalledWith({
        membership: { id: memberId, status: "revoked" },
      })
    })

    it("rejects unauthorized role value 'owner'", async () => {
      req.body = { organization_id: orgId, membership_id: memberId, role: "owner" }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
      expect(mockService.personalChangeMembershipRole).not.toHaveBeenCalled()
    })

    it("rejects arbitrary invalid role string", async () => {
      req.body = { organization_id: orgId, membership_id: memberId, role: "superadmin" }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
    })

    it("rejects injected identity fields due to strict schema", async () => {
      req.body = {
        organization_id: orgId,
        membership_id: memberId,
        role: "admin",
        actor_person_id: "daprs_injected",
      }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
      expect(mockService.personalChangeMembershipRole).not.toHaveBeenCalled()
    })

    it("rejects malformed organization_id format", async () => {
      req.body = { organization_id: "not_daorg_prefix", membership_id: memberId, role: "admin" }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid input" })
    })

    it("rejects request with missing or invalid CSRF token", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { organization_id: orgId, membership_id: memberId, role: "admin" }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
      expect(mockService.personalChangeMembershipRole).not.toHaveBeenCalled()
    })
  })

  describe("UI role-control rendering (DOM harness)", () => {
    function createUiHarness() {
      const source = readFileSync(join(__dirname, "../route.ts"), "utf8")
      const begin = source.indexOf("let currentOrg=''")
      const end = source.indexOf("  async function load()", begin)
      const nodes = new Map<string, any>()
      const el = (id: string) => {
        if (!nodes.has(id)) {
          nodes.set(id, {
            textContent: "",
            hidden: id === "memberships-refresh",
            disabled: id === "memberships-refresh",
            children: [] as any[],
            replaceChildren() { this.textContent = ""; this.children = [] },
            append(...xs: any[]) { this.children.push(...xs) },
          })
        }
        return nodes.get(id)
      }
      const pending: Array<{ path: string; options?: any; resolve: (x: any) => void; reject: (e: Error) => void }> = []
      const state = { status: "", url: "/personal", pending, el }
      const doc = {
        createElement: (tag: string) => {
          const element: any = { tag, textContent: "", children: [] as any[], disabled: false }
          if (tag === "select") {
            element.value = ""
            element.append = (...opts: any[]) => {
              element.children.push(...opts)
              const selected = opts.find((o: any) => o.selected)
              if (selected) element.value = selected.value
              else if (opts.length > 0 && !element.value) element.value = opts[0].value
            }
          }
          if (tag === "option") {
            element.value = ""
            element.selected = false
          }
          return element
        },
      }
      const context = createContext({
        el,
        status: (s: string) => { state.status = s },
        history: { replaceState: (_: unknown, __: unknown, url: string) => { state.url = url } },
        document: doc,
        api: (path: string, options?: any) => new Promise((resolve, reject) => pending.push({ path, options, resolve, reject })),
      })
      runInContext(source.slice(begin, end), context)
      return {
        state,
        el,
        context,
        select: (id: string) => runInContext(`selectOrg(${JSON.stringify(id)})`, context),
      }
    }

    const settle = () => new Promise<void>(resolve => setImmediate(resolve))

    const ordinary = { id: "mem_ordinary", person_id: "p_ordinary", role: "member", status: "active", protected_owner: false }
    async function selection(h: ReturnType<typeof createUiHarness>, id = orgId, role = "admin") {
      const done = h.select(id)
      h.state.pending.filter(p => p.path === `organizations?id=${id}`).at(-1)!.resolve({ organizations: [{ id, name: "Test Org", role }] })
      await settle()
      return { done, read: h.state.pending.filter(p => p.path === `memberships?organization=${id}`).at(-1)! }
    }

    it("announces pending, populated and genuinely empty results separately", async () => {
      const h = createUiHarness()
      const { done, read } = await selection(h)
      expect(h.el("memberships-status").textContent).toBe("Üyelikler yükleniyor…")
      expect(h.el("memberships").ariaBusy).toBe("true")
      expect(h.el("memberships-refresh").disabled).toBe(true)
      read.resolve({ memberships: [ordinary] }); await done
      expect(h.el("memberships-status").textContent).toBe("Üyelik listesi güncellendi.")
      expect(h.el("memberships").children.some((x: any) => x.textContent.includes("p_ordinary"))).toBe(true)
      expect(h.el("memberships").ariaBusy).toBe("false")
      const empty = await selection(h)
      expect(h.el("memberships").children).toHaveLength(0)
      empty.read.resolve({ memberships: [] }); await empty.done
      expect(h.el("memberships-status").textContent).toBe("Gösterilecek üyelik bulunmuyor.")
      expect(h.el("memberships-refresh").disabled).toBe(false)
    })

    it.each([401, 403, 404, 503, undefined])("shows safe denial/error after HTTP %s or network failure without stale rows", async httpStatus => {
      const h = createUiHarness(), first = await selection(h)
      first.read.resolve({ memberships: [ordinary] }); await first.done
      const next = await selection(h, orgId, httpStatus === 403 ? "member" : "admin")
      expect(h.el("memberships").children).toHaveLength(0)
      next.read.reject(Object.assign(new Error("private upstream diagnostic"), { httpStatus })); await next.done
      expect(h.el("memberships-status").textContent).toBe([401, 403, 404].includes(httpStatus as number)
        ? "Üyelik listesini görüntüleme izniniz yok." : "Üyelik listesi yüklenemedi. Yeniden deneyin.")
      expect(h.el("memberships").children).toHaveLength(0)
      expect(h.el("memberships").ariaBusy).toBe("false")
      expect(h.el("memberships-refresh").hidden).toBe(httpStatus === 403)
    })

    it("refreshes using the current Organization with fresh scope authorization before listing", async () => {
      const h = createUiHarness(), first = await selection(h)
      first.read.resolve({ memberships: [ordinary] }); await first.done
      const done = h.el("memberships-refresh").onclick()
      expect(h.el("memberships").children).toHaveLength(0)
      expect(h.el("memberships-status").textContent).toBe("Üyelikler yükleniyor…")
      expect(h.el("memberships").ariaBusy).toBe("true")
      expect(h.state.pending.at(-1)!.path).toBe(`organizations?id=${orgId}`)
      h.state.pending.at(-1)!.resolve({ organizations: [{ id: orgId, role: "admin" }] }); await settle()
      expect(h.state.pending.at(-1)!.path).toBe(`memberships?organization=${orgId}`)
      h.state.pending.at(-1)!.resolve({ memberships: [] }); await done
      expect(h.el("memberships-status").textContent).toBe("Gösterilecek üyelik bulunmuyor.")
      expect(h.state.pending.every(p => !p.options?.method || p.options.method === "GET")).toBe(true)
    })

    it.each(["success", "error"])("ignores a late same-Organization refresh %s", async result => {
      const h = createUiHarness(), old = await selection(h), latest = await selection(h)
      latest.read.resolve({ memberships: [] }); await latest.done
      if (result === "success") old.read.resolve({ memberships: [ordinary] })
      else old.read.reject(Object.assign(new Error("old denied"), { httpStatus: 403 }))
      await old.done
      expect(h.el("memberships").children).toHaveLength(0)
      expect(h.el("memberships-status").textContent).toBe("Gösterilecek üyelik bulunmuyor.")
      expect(h.el("memberships-refresh").disabled).toBe(false)
    })

    it("clears the old list while refresh scope revalidation is denied and ignores old pending data", async () => {
      const h = createUiHarness(), old = await selection(h)
      const denied = h.el("memberships-refresh").onclick()
      h.state.pending.at(-1)!.reject(Object.assign(new Error("private foreign diagnostic"), { httpStatus: 403 })); await denied
      old.read.resolve({ memberships: [ordinary] }); await old.done
      expect(h.el("memberships").children).toHaveLength(0)
      expect(h.el("memberships-status").textContent).toBe("Üyelik listesini görüntüleme izniniz yok.")
      expect(h.el("memberships").ariaBusy).toBe("false")
      expect(h.el("memberships-refresh").hidden).toBe(true)
      expect(h.state.url).toBe("/personal")
    })

    it("does not let a late foreign-scope error replace a newer list state", async () => {
      const h = createUiHarness(), old = await selection(h), latest = await selection(h, "daorg_other")
      latest.read.resolve({ memberships: [] }); await latest.done
      old.read.reject(Object.assign(new Error("private old error"), { httpStatus: 403 })); await old.done
      expect(h.state.url).toBe("/personal?organization=daorg_other")
      expect(h.el("memberships-status").textContent).toBe("Gösterilecek üyelik bulunmuyor.")
      expect(h.el("memberships").children).toHaveLength(0)
    })

    it("treats malformed successful data as an error rather than empty or partial information", async () => {
      const h = createUiHarness(), s = await selection(h)
      s.read.resolve({ memberships: [ordinary, null] }); await s.done
      expect(h.el("memberships").children).toHaveLength(0)
      expect(h.el("memberships-status").textContent).toBe("Üyelik listesi yüklenemedi. Yeniden deneyin.")
      const invalid = await selection(h)
      invalid.read.resolve({}); await invalid.done
      expect(h.el("memberships-status").textContent).toBe("Üyelik listesi yüklenemedi. Yeniden deneyin.")
    })

    it("preserves HTTP status from the shipped api helper for safe UI classification", async () => {
      const source = readFileSync(join(__dirname, "../route.ts"), "utf8")
      const apiSource = source.slice(source.indexOf("  async function api("), source.indexOf("  let recoveryCodes=[]"))
      for (const httpStatus of [401, 403, 404, 503]) {
        const context = createContext({ viewEpoch: 0, csrf: "synthetic", fetch: async () => ({ ok: false, status: httpStatus, json: async () => ({ message: "private diagnostic" }) }) })
        runInContext(apiSource, context)
        await expect(runInContext("api('memberships?organization=daorg_test')", context)).rejects.toHaveProperty("httpStatus", httpStatus)
      }
      expect(source).toContain('id="memberships-status" role="status" aria-live="polite" aria-atomic="true"')
      expect(source).toContain('id="memberships" aria-describedby="memberships-status" aria-busy="false"')
    })

    it("renders role controls for an active ordinary member but not a protected Owner from the active-only list", async () => {
      const h = createUiHarness()
      const selPromise = h.select(orgId)

      // Resolve organization detail
      h.state.pending[0].resolve({ organizations: [{ id: orgId, name: "Test Org", role: "owner" }] })
      await settle()

      // Resolve memberships
      const members = [
        { id: "mem_owner", person_id: "p_owner", role: "owner", status: "active", protected_owner: true },
        { id: "mem_ordinary", person_id: "p_ordinary", role: "member", status: "active", protected_owner: false },
      ]
      h.state.pending.find(p => p.path === `memberships?organization=${orgId}`)!.resolve({ memberships: members })
      await selPromise
      await settle()

      const membershipChildren = h.el("memberships").children

      // Find the select elements
      const selects = membershipChildren.filter((c: any) => c.tag === "select")
      expect(selects).toHaveLength(1)
      expect(selects[0].value).toBe("member")

      // Find the save buttons
      const saveButtons = membershipChildren.filter((c: any) => c.tag === "button" && c.textContent.includes("Rolü kaydet"))
      expect(saveButtons).toHaveLength(1)
      expect(saveButtons[0].textContent).toBe("Rolü kaydet mem_ordinary")

      // Test clicking the save button to change to admin
      selects[0].value = "admin"
      saveButtons[0].onclick()

      // Verify the POST request sent
      const postReq = h.state.pending.find(p => p.path === "memberships" && p.options?.method === "POST")
      expect(postReq).toBeDefined()
      const body = JSON.parse(postReq!.options.body)
      expect(body).toEqual({
        organization_id: orgId,
        membership_id: "mem_ordinary",
        role: "admin",
      })

      // Resolve the POST
      postReq!.resolve({ membership: { id: "mem_ordinary", role: "admin", status: "active" } })
      await settle()

      // In the onclick handler, selectOrg(org) is called: resolve its organization detail
      const orgRefresh = h.state.pending.find(p => p.path === `organizations?id=${orgId}` && p !== h.state.pending[0])
      expect(orgRefresh).toBeDefined()
      orgRefresh!.resolve({ organizations: [{ id: orgId, name: "Test Org", role: "owner" }] })
      await settle()

      // Resolve the memberships re-fetch inside selectOrg
      const memRefresh = h.state.pending.find(p => p.path === `memberships?organization=${orgId}` && p !== h.state.pending[1])
      expect(memRefresh).toBeDefined()
      memRefresh!.resolve({ memberships: [{ id: "mem_ordinary", person_id: "p_ordinary", role: "admin", status: "active", protected_owner: false }] })
      await settle()

      expect(h.state.status).toBe("Rol güncellendi")
    })
  })
})
