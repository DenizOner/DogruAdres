import { GET } from "../route"
import { runInNewContext, createContext, runInContext } from "node:vm"
import { readFileSync } from "node:fs"
import path from "node:path"
jest.mock("../security", () => ({ enabled: () => true }))
async function page() {
  const res: any = { setHeader: jest.fn(), type: jest.fn().mockReturnThis(), send: jest.fn() }
  await GET({} as any, res)
  return { res, html: res.send.mock.calls[0][0] as string }
}
describe("bearer URL privacy (executed page scripts, not backend/browser acceptance)", () => {
  it("sets the personal HTML policy and scrubs once before any fetch without losing the invitation", async () => {
    const { res, html } = await page()
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer")
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    expect(scripts).toHaveLength(2)
    const token = "synthetic-invitation/?secret"
    const url = new URL("https://app.example.invalid/personal?organization=synthetic&invitation_token="+encodeURIComponent(token)+"#section")
    const history = { replaceState: jest.fn((_state, _title, next) => { url.href = new URL(next, url).href }) }
    const context = createContext({ URL, location: url, history })
    runInContext(scripts[0], context)
    expect(url.searchParams.has("invitation_token")).toBe(false)
    expect(url.searchParams.get("organization")).toBe("synthetic")
    expect(url.hash).toBe("#section")
    expect(runInContext("invitationToken", context)).toBe(token)
    expect(history.replaceState).toHaveBeenCalledTimes(1)
    expect(html.indexOf(scripts[0])).toBeLessThan(html.indexOf("async function api"))
    // URL reads may not be reintroduced after login/MFA/load/selectOrg changes.
    expect(scripts[1]).not.toMatch(/get\('invitation_token'\)/)
    expect(scripts[1]).toContain("const inviteToken=invitationToken")
    const accept = scripts[1].match(/el\('accept-invitation-btn'\)\.onclick=(async\(\)=>\{[\s\S]*?\n  \});/)![1]
    const nodes = new Map<string, any>()
    const el = (id: string) => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id) }
    const api = jest.fn().mockResolvedValue({})
    const status = jest.fn(), load = jest.fn()
    Object.assign(context, { api, el, status, load })
    const click = runInContext("("+accept+")", context)
    // Legitimate in-page password/MFA transitions and unrelated URL edits do not reread/drop the secret.
    url.search = "?organization=other"
    await click()
    expect(api).toHaveBeenCalledWith("invitations", { method: "POST", body: JSON.stringify({ action: "accept", token }) })
    expect(runInContext("invitationToken", context)).toBeNull()
    await click()
    expect(api).toHaveBeenCalledTimes(1)
    expect(JSON.stringify([status.mock.calls, [...nodes.values()]])).not.toContain(token)
  })
  it.each(["mismatch", "replay"])("keeps %s denials generic and never navigates with the secret", async () => {
    const { html } = await page()
    const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][1][1]
    const accept = code.match(/el\('accept-invitation-btn'\)\.onclick=(async\(\)=>\{[\s\S]*?\n  \});/)![1]
    const nodes: Record<string, any> = {}
    const token = "synthetic-private-invitation"
    const status = jest.fn()
    const api = jest.fn().mockRejectedValue(new Error(token+" recipient@example.invalid"))
    const click = runInNewContext("("+accept+")", { invitationToken: token, el: (id: string) => nodes[id] ||= {}, status, api, load: jest.fn() })
    await click()
    expect(nodes['invitation-card'].hidden).toBe(true)
    expect(JSON.stringify([nodes, status.mock.calls])).not.toMatch(/synthetic-private|recipient@example/)
  })
  it("renders a configured Storefront URL only as data inside the nonce script", async () => {
    const previous = process.env.DOGRUADRES_STOREFRONT_URL
    const configured = "https://x'+console.log(123)+'z"
    process.env.DOGRUADRES_STOREFRONT_URL = configured
    try {
      const { html } = await page()
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
      expect(scripts).toHaveLength(2)
      const declaration = scripts[1][1].split("\n").find(line => line.includes("const APP_URLS="))
      expect(declaration).toBeTruthy()
      const logger = jest.fn()
      const rendered = runInNewContext((declaration || "")+"\nAPP_URLS.storefront", { console: { log: logger } })
      expect(rendered).toBe(configured)
      expect(logger).not.toHaveBeenCalled()
    } finally {
      if (previous === undefined) delete process.env.DOGRUADRES_STOREFRONT_URL
      else process.env.DOGRUADRES_STOREFRONT_URL = previous
    }
  })
  it("storefront captures the token in component memory and scrubs before inspection, with fixed response policies", () => {
    const root=path.resolve(__dirname,"../../../../../..")
    const source=readFileSync(path.join(root,"apps/storefront/src/app/[locale]/auth/verify-email/page.tsx"),"utf8")
    const middleware=readFileSync(path.join(root,"apps/storefront/src/middleware.ts"),"utf8")
    expect(source).toContain('const [token] = useState(() => searchParams.get("token") || "")')
    expect(source.indexOf('url.searchParams.delete("token")')).toBeLessThan(source.indexOf('async function checkTokenStatus'))
    expect(source.match(/referrerPolicy: "no-referrer"/g)).toHaveLength(2)
    expect(middleware.match(/response.headers.set\('Referrer-Policy', 'no-referrer'\)/g)).toHaveLength(2)
  })
})
