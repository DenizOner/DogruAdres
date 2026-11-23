import { GET } from "../route"
import { enabled } from "../security"

jest.mock("../security", () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

const response = () => {
  const res: any = {}
  for (const method of ["setHeader", "status", "type", "send"]) {
    res[method] = jest.fn().mockReturnValue(res)
  }
  return res
}

describe("Platform admin launcher frontdoor UI contract", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
  })

  it("renders platform launcher panel inside workspace, initially hidden", async () => {
    const res = response()
    await GET({} as any, res)
    const html = String(res.send.mock.calls[0]?.[0] ?? "")

    const workspaceIdx = html.indexOf('<section id="workspace" hidden>')
    const panelIdx = html.indexOf('<section id="platform-launcher-panel" hidden')
    expect(workspaceIdx).toBeGreaterThan(-1)
    expect(panelIdx).toBeGreaterThan(workspaceIdx)

    expect(html).toContain('<h2 id="platform-launcher-title">Platform çalışma alanı başlatıcısı</h2>')
    expect(html).toContain('<p id="platform-launcher-status" role="status" aria-live="polite"></p>')
    expect(html).toContain('<ol id="platform-launcher-list"></ol>')
    expect(html).toContain('<button id="platform-launcher-reset" type="button">Standart düzeni geri yükle</button>')
    expect(html).toContain("#platform-launcher-panel{grid-column:1/-1;")
  })

  it("wires platform launcher script handlers, target mappings, and lifecycle calls", async () => {
    const res = response()
    await GET({} as any, res)
    const html = String(res.send.mock.calls[0]?.[0] ?? "")

    expect(html).toContain("platformLauncherTargets={")
    expect(html).toContain("'organization-review':{label:'İşletme başvuruları incelemesi',target:'organization-review-panel'}")
    expect(html).toContain("'store-approvals':{label:'Platform mağaza onayları',target:'store-approval-panel'}")
    expect(html).toContain("'store-renames':{label:'Mağaza ad/bağlantı değişiklikleri',target:'store-rename-review-panel'}")
    expect(html).toContain("'store-closings':{label:'Platform mağaza kapatma süreci',target:'platform-closing-panel'}")
    expect(html).toContain("'store-closing-reviews':{label:'Bağımsız mağaza kapatma incelemesi',target:'platform-closing-review-panel'}")
    expect(html).toContain("'platform-mfa':{label:'Platform için MFA politikası',target:'mfa-platform'}")
    expect(html).toContain("'platform-smtp':{label:'Platform SMTP ve bildirim ayarları',target:'smtp-platform'}")
    expect(html).toContain("'store-policy':{label:'Şirket mağaza başvuru hakkı yönetimi',target:'platform-store-policy-panel'}")

    for (const targetId of [
      "organization-review-panel",
      "store-approval-panel",
      "store-rename-review-panel",
      "platform-closing-panel",
      "platform-closing-review-panel",
      "mfa-platform",
      "smtp-platform",
      "platform-store-policy-panel",
    ]) {
      expect(html).toContain(`id="${targetId}"`)
    }

    expect(html).toContain("function clearPlatformLauncher()")
    expect(html).toContain("function validPlatformLauncherResponse(data)")
    expect(html).toContain("async function loadPlatformLauncher()")
    expect(html).toContain("async function savePlatformLauncher(apps,collapsed,notice)")
    expect(html).toContain("function renderPlatformLauncher()")

    expect(html).toContain("void loadPlatformLauncher()")
    expect(html).toContain("clearPlatformLauncher()")
  })

  it("does not render page when disabled", async () => {
    ;(enabled as jest.Mock).mockReturnValue(false)
    const res = response()
    await GET({} as any, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })
})
