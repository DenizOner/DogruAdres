import { GET } from "../route"
import { enabled } from "../security"
import { trustedInlineScripts } from "./trusted-inline-scripts"

jest.mock("../security", () => ({ enabled: jest.fn(() => true) }))

type Deferred = {
  promise: Promise<any>
  resolve: (value: any) => void
  reject: (error: Error) => void
}

function deferred(): Deferred {
  let resolve!: (value: any) => void
  let reject!: (error: Error) => void
  const promise = new Promise<any>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

const verifiedReadiness = (verifiedCount: number) => ({
  email_statuses: [],
  protected_owner_count: 0,
  verified_email_identity_count: verifiedCount,
  deadline_started: false,
  permanent_finalization_enabled: false,
  native_order_history_observed: false,
  terminal_preflight: {
    appeal_window_elapsed: false,
    appeal_review_pending: false,
    appeal_accepted: false,
    notification_exception_review_required: false,
    financial_legal_clearance_verified: false,
    permanent_finalization_enabled: false,
  },
})

describe("Staff platform-closing mail status: stale replies do not cross Store selection", () => {
  async function mountRealInlineLogic() {
    const response: any = {
      setHeader: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    await GET({} as any, response)
    const html = response.send.mock.calls[0][0] as string
    const code = trustedInlineScripts(html).join("\n")
    const start = code.indexOf("  let platformClosingPage=0,platformClosingRead=0,platformClosingMailRead=0;")
    const end = code.indexOf("  async function refreshPlatformClosings(){", start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    // Execute the real rendered browser function, not a copied algorithm.
    const status = { textContent: "" }
    const panel = { hidden: false }
    const choice = { value: "sel_alpha", replaceChildren: jest.fn() }
    const form = { reset: jest.fn(), elements: { namedItem: jest.fn(() => choice) } }
    const nodes: Record<string, any> = {
      "platform-closing-mail-status": status,
      "platform-closing-status": { textContent: "" },
      "platform-closing-panel": panel,
      "platform-closing-form": form,
    }
    const requests: Array<{ path: string; deferred: Deferred }> = []
    const api = jest.fn((path: string) => {
      const task = deferred()
      requests.push({ path, deferred: task })
      return task.promise
    })
    const controller = new Function("el", "api", "document", "viewEpoch",
      code.slice(start, end) + "\nreturn { refreshPlatformClosingMail, clearPlatformClosings }"
    )((id: string) => nodes[id], api, { hidden: false }, 1) as {
      refreshPlatformClosingMail: (chosen: any) => Promise<void>
      clearPlatformClosings: () => void
    }
    return { ...controller, status, choice, panel, requests, api }
  }

  it("ignores a previous Store's failed request after the next Store's status succeeds", async () => {
    const ui = await mountRealInlineLogic()
    const oldRead = ui.refreshPlatformClosingMail({ seller_id: "sel_alpha", organization_id: "daorg_alpha" })
    ui.choice.value = "sel_beta"
    const newRead = ui.refreshPlatformClosingMail({ seller_id: "sel_beta", organization_id: "daorg_beta" })
    expect(ui.requests).toHaveLength(2)
    expect(ui.requests[0].path).toContain("seller_id=sel_alpha")
    expect(ui.requests[1].path).toContain("seller_id=sel_beta")
    ui.requests[1].deferred.resolve(verifiedReadiness(2))
    await newRead
    const latest = ui.status.textContent
    expect(latest).toContain("doğrulanmış e-posta kimliği 2")
    expect(latest).toContain("mali ve hukuki yükümlülüklerin temizlendiği doğrulanmadı")
    ui.requests[0].deferred.reject(Object.assign(new Error("stale denied"), { httpStatus: 403 }))
    await oldRead
    expect(ui.status.textContent).toEqual(latest)
    expect(ui.status.textContent).not.toContain("Bu mağaza için henüz kapatma kaydı yok")
  })

  it("ignores an older successful request for the same selected Store", async () => {
    const ui = await mountRealInlineLogic()
    const seller = { seller_id: "sel_alpha", organization_id: "daorg_alpha" }
    const oldRead = ui.refreshPlatformClosingMail(seller)
    const latestRead = ui.refreshPlatformClosingMail(seller)
    ui.requests[1].deferred.resolve(verifiedReadiness(3))
    await latestRead
    const current = ui.status.textContent
    expect(current).toContain("doğrulanmış e-posta kimliği 3")
    ui.requests[0].deferred.resolve(verifiedReadiness(1))
    await oldRead
    expect(ui.status.textContent).toBe(current)
  })

  it("discards a late network error after Staff closing view was cleared", async () => {
    const ui = await mountRealInlineLogic()
    const read = ui.refreshPlatformClosingMail({ seller_id: "sel_alpha", organization_id: "daorg_alpha" })
    ui.clearPlatformClosings()
    expect(ui.panel.hidden).toBe(true)
    expect(ui.status.textContent).toBe("")
    ui.requests[0].deferred.reject(new Error("old network failure"))
    await read
    expect(ui.status.textContent).toBe("")
  })

  it("still reports a current failed readiness request without claiming delivery", async () => {
    const ui = await mountRealInlineLogic()
    const read = ui.refreshPlatformClosingMail({ seller_id: "sel_alpha", organization_id: "daorg_alpha" })
    ui.requests[0].deferred.reject(new Error("current network failure"))
    await read
    expect(ui.status.textContent).toBe("E-posta durumları doğrulanamadı; sonuç iddia edilmiyor.")
  })
})
