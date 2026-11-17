import { GET } from "../route"
import { enabled } from "../security"

// Reuse the exact existing Jest security mock shape; no real auth is replaced in
// the browser/PG16 acceptance path.
jest.mock("../security", () => ({
  access: jest.fn(), csrf: jest.fn(), enabled: jest.fn(), sessionToken: jest.fn(),
}))

const response = () => {
  const res: any = {}
  for (const method of ["setHeader","status","type","send"])
    res[method] = jest.fn().mockReturnValue(res)
  return res
}

describe("B20 personal workspace first-entry navigation", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
  })

  it("shows two real existing same-page destinations only inside hidden-until-login workspace", async () => {
    const res = response()
    await GET({} as any, res)
    const html = String(res.send.mock.calls[0]?.[0] ?? "")
    const workspace = html.indexOf('<section id="workspace" hidden>')
    const nav = html.indexOf('<nav id="personal-entry"')
    expect(workspace).toBeGreaterThan(-1)
    expect(nav).toBeGreaterThan(workspace)
    expect(html).toContain('href="#organizations-title"')
    expect(html).toContain('href="#organization-draft-title"')
    expect(html).toContain('id="organizations-title" tabindex="-1"')
    expect(html).toContain('id="organization-draft-title" tabindex="-1"')
    expect(html).toContain("el('personal-entry').onclick=event=>")
    expect(html).toContain("hash!=='#organizations-title'&&hash!=='#organization-draft-title'")
    expect(html).toContain('heading.focus({preventScroll:true})')
    expect(html).toContain('İş İlanları Panosu — henüz kullanıma açık değil.')
    expect(html).not.toMatch(/href=["'][^"']*job-board/)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store")
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy","no-referrer")
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options","nosniff")
    expect(html).not.toContain('id="personal-entry" hidden="false"')
  })

  it("does not render personal navigation when the existing workspace feature is disabled",async()=>{
    ;(enabled as jest.Mock).mockReturnValue(false)
    const res=response()
    await GET({} as any,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.send).toHaveBeenCalledWith("Kişisel çalışma alanı etkin değil")
    expect(res.type).not.toHaveBeenCalled()
  })
})
