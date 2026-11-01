import { GET, POST } from "../platform/smtp/route"
import { access, csrf, enabled, sessionToken } from "../security"
import { SmtpConcurrentUpdateError } from "../../../modules/dogruadres-access/smtp-settings"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe("personal platform smtp route unit tests", () => {
  const mockService = {
    personalPlatformSmtpSettings: jest.fn(),
    personalUpdatePlatformSmtpSettings: jest.fn(),
    personalTestPlatformSmtpSettings: jest.fn(),
    personalSession: jest.fn(),
  }

  const createMockReq = (body: any = {}, query: any = {}) => {
    return {
      headers: {
        cookie: "da_session=tok_valid_test_session",
        origin: "https://app.dogruadres.com",
        "x-csrf-token": "1234567890123456789012345678901234567890123",
      },
      body,
      query,
      scope: {
        resolve: jest.fn().mockImplementation((key: string) => {
          if (key === "dogruadresAccess") return mockService
          return null
        }),
      },
    } as any
  }

  const createMockRes = () => {
    const res: any = {}
    res.setHeader = jest.fn().mockReturnValue(res)
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    return res
  }

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue("tok_valid_test_session")
    ;(access as jest.Mock).mockReturnValue(mockService)
    mockService.personalSession.mockResolvedValue({
      person_id: "daprs_01TEST",
      auth_identity_id: "authid_01TEST",
    })
  })

  describe("GET /personal/platform/smtp", () => {
    it("returns 503 when identity is disabled", async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      const req = createMockReq()
      const res = createMockRes()

      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith({ message: "Unavailable" })
    })

    it("returns 403 when caller lacks platform.smtp.manage staff grant or recent strong auth", async () => {
      mockService.personalPlatformSmtpSettings.mockResolvedValue(null)
      const req = createMockReq()
      const res = createMockRes()

      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: "Access denied or strong authentication required",
      })
    })

    it("returns 200 with non-secret settings when caller is authorized", async () => {
      mockService.personalPlatformSmtpSettings.mockResolvedValue({
        settings: {
          enabled: true,
          host: "smtp.gmail.com",
          port: 465,
          security: "ssl",
          username: "test@gmail.com",
          from_email: "test@gmail.com",
          from_name: "DogruAdres Test",
          has_password: true,
          version: 1,
        },
        can_manage: true,
      })
      const req = createMockReq()
      const res = createMockRes()

      await GET(req, res)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(res.json).toHaveBeenCalledWith({
        settings: {
          enabled: true,
          host: "smtp.gmail.com",
          port: 465,
          security: "ssl",
          username: "test@gmail.com",
          from_email: "test@gmail.com",
          from_name: "DogruAdres Test",
          has_password: true,
          version: 1,
        },
        can_manage: true,
      })
    })
  })

  describe("POST /personal/platform/smtp", () => {
    it("returns 403 when CSRF check fails", async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      const req = createMockReq({ action: "test" })
      const res = createMockRes()

      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" })
    })

    it("returns 400 when input validation fails (e.g. invalid host SSRF, invalid port)", async () => {
      const req = createMockReq({
        action: "save",
        enabled: true,
        host: "127.0.0.1", // Disallowed SSRF private loopback
        port: 465,
        security: "ssl",
        from_email: "invalid-email",
        expected_version: 0,
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid input" })
      )
    })

    it("returns 400 when host points to IPv6 ULA, Link-Local or IPv4-mapped private ranges (SSRF prevention)", async () => {
      for (const blockedHost of ["fc42::1", "fea0::1", "::ffff:192.168.1.1", "::ffff:c0a8:101"]) {
        const req = createMockReq({
          action: "save",
          enabled: true,
          host: blockedHost,
          port: 465,
          security: "ssl",
          from_email: "admin@dogruadres.com",
          expected_version: 0,
        })
        const res = createMockRes()

        await POST(req, res)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ message: "Invalid input" })
        )
      }
    })

    it("returns 409 when concurrent update conflict occurs", async () => {
      mockService.personalUpdatePlatformSmtpSettings.mockRejectedValue(
        new SmtpConcurrentUpdateError()
      )
      const req = createMockReq({
        action: "save",
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        from_email: "admin@dogruadres.com",
        expected_version: 1,
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({
        message: "Settings changed; refresh before retry",
      })
    })

    it("returns 200 on successful settings update", async () => {
      mockService.personalUpdatePlatformSmtpSettings.mockResolvedValue({
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        username: "apikey",
        from_email: "notifications@dogruadres.com",
        from_name: "DogruAdres Platform",
        has_password: true,
        version: 2,
      })
      const req = createMockReq({
        action: "save",
        enabled: true,
        host: "smtp.sendgrid.net",
        port: 465,
        security: "ssl",
        username: "apikey",
        password: "new-password",
        from_email: "notifications@dogruadres.com",
        from_name: "DogruAdres Platform",
        expected_version: 1,
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.json).toHaveBeenCalledWith({
        settings: {
          enabled: true,
          host: "smtp.sendgrid.net",
          port: 465,
          security: "ssl",
          username: "apikey",
          from_email: "notifications@dogruadres.com",
          from_name: "DogruAdres Platform",
          has_password: true,
          version: 2,
        },
      })
    })

    it("rejects tests without an explicit recipient and does not dispatch", async () => {
      const req = createMockReq({ action: "test" })
      const res = createMockRes()

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: "Target recipient email is required for test email dispatch",
      })
      expect(mockService.personalTestPlatformSmtpSettings).not.toHaveBeenCalled()
    })

    it("never reflects SMTP provider errors containing addresses or secrets", async () => {
      mockService.personalTestPlatformSmtpSettings.mockRejectedValue(
        new Error("535 failure from operator@example.test: password=test")
      )
      const req = createMockReq({
        action: "test",
        target_recipient: "recipient@example.test",
      })
      const res = createMockRes()

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      const payload = JSON.stringify(res.json.mock.calls)
      expect(payload).not.toContain("operator@example.test")
      expect(payload).not.toContain("password=test")
      expect(payload).toContain("SMTP test failed")
    })

    it("returns 200 and dispatches live test email on test action", async () => {
      mockService.personalTestPlatformSmtpSettings.mockResolvedValue({
        messageId: "<test-msg-123@smtp.gmail.com>",
        accepted: ["denizoner1985@gmail.com"],
      })
      const req = createMockReq({
        action: "test",
        target_recipient: "denizoner1985@gmail.com",
      })
      const res = createMockRes()

      await POST(req, res)
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        messageId: "<test-msg-123@smtp.gmail.com>",
        accepted: ["denizoner1985@gmail.com"],
      })
    })
  })
})

// Component-state regression checks use the installed TypeScript/Jest stack and
// inert UI primitives. They neither start a browser/backend nor send SMTP mail.
describe("Admin SMTP fail-closed loading", () => {
  const { readFileSync } = require("node:fs")
  const { resolve } = require("node:path")
  const { runInNewContext } = require("node:vm")
  const ts = require("typescript")
  const source = readFileSync(resolve(process.cwd(), "../../apps/admin/src/routes/settings/smtp/page.tsx"), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const settings = {
    enabled: true, host: "smtp.example.invalid", port: 465, security: "ssl",
    username: null, from_email: "sender@example.invalid", from_name: null,
    has_password: false, version: 0,
  }

  function mount(response: any, networkFailure = false) {
    const states: any[] = []
    let cursor = 0
    let effect: () => void
    let cleanup: any
    const react = {
      createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children }),
      useState: (initial: any) => {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (value: any) => { states[index] = value }]
      },
      useEffect: (callback: any) => { effect = callback },
    }
    const ui = new Proxy({}, { get: (_, key) => key === "toast" ? { error: jest.fn(), success: jest.fn() } : String(key) })
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith("/session")) return { ok: true, json: async () => ({ csrf_token: "synthetic-csrf" }) }
      if (networkFailure) throw new Error("private-error-must-not-be-shown")
      return response
    })
    const module = { exports: {} as any }
    runInNewContext(compiled, { module, exports: module.exports, fetch: fetchMock,
      require: (id: string) => {
        if (id === "react") return react
        if (id === "@medusajs/ui") return ui
        throw Error("Unexpected component dependency")
      },
    })
    const render = () => { cursor = 0; return module.exports.default() }
    const initial = render()
    const start = () => { cleanup = effect!() }
    const stop = () => cleanup?.()
    return { render, initial, start, stop, fetchMock }
  }
  function nodes(tree: any): any[] {
    if (!tree || typeof tree !== "object") return []
    return [tree, ...tree.children.flat(Infinity).flatMap(nodes)]
  }
  const response = (status: number, data: any) => ({ status, ok: status === 200, json: async () => data })
  const settle = () => new Promise(resolve => setImmediate(resolve))

  it("reveals populated bootstrap version-zero settings only after an authorized 200", async () => {
    const page = mount(response(200, { can_manage: true, settings }))
    expect(nodes(page.initial).some(n => n.type === "form")).toBe(false)
    page.start()
    expect(nodes(page.render()).some(n => n.type === "form")).toBe(false)
    await settle()
    const result = nodes(page.render())
    expect(result.some(n => n.type === "form")).toBe(true)
    expect(result.find(n => n.props.id === "smtp-host").props.value).toBe(settings.host)
    expect(result.find(n => n.props.id === "smtp-port").props.value).toBe(465)
    expect(result.find(n => n.props.id === "smtp-pass").props.type).toBe("password")
    expect(result.find(n => n.props.id === "smtp-pass").props.value).toBe("")
  })

  it("populates persisted settings and ignores a cancelled load", async () => {
    let finish: any
    const pending = new Promise(resolve => { finish = resolve })
    const res = { status: 200, json: () => pending }
    const page = mount(res)
    page.start()
    await settle()
    page.stop()
    finish({ can_manage: true, settings })
    await settle()
    expect(nodes(page.render()).some(n => n.type === "form")).toBe(false)

    const persisted = mount(response(200, { can_manage: true, settings: {
      ...settings, enabled: false, port: 587, security: "tls", version: 7,
      username: "smtp-user", from_name: "Example", has_password: true,
      updated_at: "2026-11-01T12:00:00.000Z",
    } }))
    persisted.start()
    await settle()
    const all = nodes(persisted.render())
    expect(all.some(n => n.type === "form")).toBe(true)
    expect(all.find(n => n.props.id === "smtp-port").props.value).toBe(587)
    expect(all.find(n => n.props.id === "smtp-user").props.value).toBe("smtp-user")
    expect(all.find(n => n.props.id === "smtp-pass").props.value).toBe("")
  })

  const invalidSettings = [null, {}, ...["enabled", "host", "port", "security", "username", "from_email", "from_name", "has_password", "version"].map(key => ({ ...settings, [key]: undefined })),
    { ...settings, port: 0 }, { ...settings, version: -1 }, { ...settings, security: "none" },
    { ...settings, updated_at: "invalid" }]
  const failureCases: Array<[string, any, boolean]> = [
    ...[401, 403, 500, 503, 201].map(status => [String(status), response(status, { can_manage: true, settings }), false] as [string, any, boolean]),
    ["network", null, true],
    ["malformed JSON", { status: 200, json: async () => { throw Error("private-json") } }, false],
    ...[undefined, false, null, "true", 1].map(can_manage => [`authorization ${JSON.stringify(can_manage)}`, response(200, { can_manage, settings }), false] as [string, any, boolean]),
    ...invalidSettings.map((s, i) => [`invalid settings ${i}`, response(200, { can_manage: true, settings: s }), false] as [string, any, boolean]),
  ]
  it.each(failureCases)("keeps controls hidden for %s with safe distinct errors", async (_, res, network) => {
    const page = mount(res, network as boolean)
    page.start()
    await settle()
    const result = page.render()
    const all = nodes(result)
    expect(all.some(n => n.type === "form" || n.props.id === "test-recipient" || n.props.id === "smtp-pass")).toBe(false)
    expect(all.some(n => n.type === "Alert")).toBe(true)
    const text = JSON.stringify(result)
    expect(text).not.toContain("private-")
    expect(text.includes("Personal Frontdoor")).toBe([401, 403].includes((res as any)?.status))
  })

  it("clears populated and typed values when loading restarts, then fails", async () => {
    const res = response(200, { can_manage: true, settings })
    const page = mount(res)
    page.start()
    await settle()
    const all = nodes(page.render())
    all.find(n => n.props.id === "smtp-pass").props.onChange({ target: { value: "synthetic-password" } })
    all.find(n => n.props.id === "test-recipient").props.onChange({ target: { value: "recipient@example.invalid" } })
    res.status = 503
    page.stop()
    page.start()
    expect(nodes(page.render()).some(n => n.type === "form")).toBe(false)
    await settle()
    expect(JSON.stringify(page.render())).not.toContain("synthetic-password")
    res.status = 200
    page.stop()
    page.start()
    await settle()
    const reloaded = nodes(page.render())
    expect(reloaded.find(n => n.props.id === "smtp-pass").props.value).toBe("")
    expect(reloaded.find(n => n.props.id === "test-recipient").props.value).toBe("")
  })
})
