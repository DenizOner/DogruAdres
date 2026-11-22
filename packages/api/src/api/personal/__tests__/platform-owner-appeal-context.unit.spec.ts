import { GET } from "../route"
import { enabled } from "../security"
import { trustedInlineScripts } from "./trusted-inline-scripts"

jest.mock("../security", () => ({ enabled: jest.fn(() => true) }))

type Deferred = {
  promise: Promise<any>
  resolve: (value: any) => void
  reject: (reason: Error) => void
}

function deferred(): Deferred {
  let resolve!: (value: any) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<any>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

// Test synthetic data only. This checks the real, rendered Owner UI functions,
// not HTTP authorization, natural passage of 10/20 days, or a PG16 browser run.
function closingState(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: "daorg_alpha",
    seller_id: "sel_alpha",
    reason: "synthetic private Alpha reason",
    state: "notification_unverified",
    version: 1,
    deadline_started: true,
    deadline_started_at: "2026-11-10T10:00:00.000Z",
    first_appeal_until: "2026-11-20T10:00:00.000Z",
    final_review_until: "2026-12-10T10:00:00.000Z",
    first_appeal_open: true,
    final_review_open: false,
    final_review_requested: false,
    review_decision: null,
    mandatory_email_verified: false,
    permanent_finalization_enabled: false,
    ...overrides,
  }
}

describe("B22-06 protected Owner appeal: 10+20-day context and stale privacy", () => {
  async function mountOwnerInlineUI() {
    const response: any = {
      setHeader: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }
    ;(enabled as jest.Mock).mockReturnValue(true)
    await GET({} as any, response)
    const html = response.send.mock.calls[0][0] as string
    const inline = trustedInlineScripts(html).join("\n")
    const start = inline.indexOf("  let platformOwnerRead=0,platformOwnerPending=false,platformOwnerUncertain=false;")
    const end = inline.indexOf("  window.addEventListener('pagehide'", start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const choice = { value: "sel_alpha" }
    const firstButton = { disabled: true }
    const secondButton = { disabled: true }
    const firstForm: any = {
      reset: jest.fn(),
      querySelector: jest.fn(() => firstButton),
      elements: { namedItem: jest.fn(() => ({ value: "synthetic reason" })) },
    }
    const secondForm: any = {
      hidden: true,
      reset: jest.fn(),
      querySelector: jest.fn(() => secondButton),
      elements: { namedItem: jest.fn(() => ({ value: "synthetic reason" })) },
    }
    const nodes: Record<string, any> = {
      "store-owner-pause-form": {
        elements: { namedItem: jest.fn(() => choice) },
      },
      "store-owner-pause-panel": { hidden: false },
      "store-platform-appeal-panel": { hidden: true },
      "store-platform-appeal-status": { textContent: "" },
      "store-platform-appeal-reason": { textContent: "" },
      "store-platform-review-decision": { textContent: "", hidden: true },
      "store-platform-appeal-form": firstForm,
      "store-platform-final-review-form": secondForm,
      "store-platform-appeal-refresh": { onclick: null },
    }
    const requests: Array<{ path: string; task: Deferred }> = []
    const api = jest.fn((path: string) => {
      const task = deferred()
      requests.push({ path, task })
      return task.promise
    })

    // Mount only the exact Owner functions extracted from the trusted
    // first-party HTML. Controlled scope variables model a real Org change;
    // they are not permission grants or production test hooks.
    const controller = new Function("el", "api", "document", "URLSearchParams",
      "let viewEpoch=1,organizationRequest=1,currentOrg='daorg_alpha',selectedStoreOwner=true;\n" +
      inline.slice(start, end) +
      "\nreturn {refreshPlatformClosingOwner,clearPlatformClosingOwner," +
      "setScope:(org,request)=>{currentOrg=org;organizationRequest=request;}}"
    )(
      (id: string) => nodes[id],
      api,
      { hidden: false },
      URLSearchParams
    ) as {
      refreshPlatformClosingOwner: (org: string, request: number) => Promise<void>
      clearPlatformClosingOwner: () => void
      setScope: (org: string, request: number) => void
    }
    return { ...controller, choice, nodes, firstButton, secondButton, secondForm, requests, api }
  }

  it("shows only the first 10-day action, then only the remaining 20-day action from the server state", async () => {
    const ui = await mountOwnerInlineUI()
    const first = ui.refreshPlatformClosingOwner("daorg_alpha", 1)
    expect(ui.requests).toHaveLength(1)
    expect(ui.requests[0].path).toContain("organization_id=daorg_alpha")
    ui.requests[0].task.resolve(closingState())
    await first

    expect(ui.nodes["store-platform-appeal-panel"].hidden).toBe(false)
    expect(ui.nodes["store-platform-appeal-reason"].textContent)
      .toContain("synthetic private Alpha reason")
    expect(ui.firstButton.disabled).toBe(false)
    expect(ui.secondForm.hidden).toBe(true)
    expect(ui.secondButton.disabled).toBe(true)

    ui.clearPlatformClosingOwner()
    ui.choice.value = "sel_beta"
    const second = ui.refreshPlatformClosingOwner("daorg_alpha", 1)
    ui.requests[1].task.resolve(closingState({
      seller_id: "sel_beta",
      reason: "synthetic private Beta reason",
      first_appeal_open: false,
      final_review_open: true,
    }))
    await second

    expect(ui.firstButton.disabled).toBe(true)
    expect(ui.secondForm.hidden).toBe(false)
    expect(ui.secondButton.disabled).toBe(false)
    expect(ui.nodes["store-platform-appeal-status"].textContent)
      .toContain("Kalan 20 günlük üst inceleme")
    expect(ui.nodes["store-platform-appeal-reason"].textContent)
      .not.toContain("synthetic private Alpha reason")
  })

  it("never renders a previous Organization's late private closing reason over the current Owner selection", async () => {
    const ui = await mountOwnerInlineUI()
    const alpha = ui.refreshPlatformClosingOwner("daorg_alpha", 1)
    ui.clearPlatformClosingOwner()
    ui.setScope("daorg_beta", 2)
    ui.choice.value = "sel_beta"
    const beta = ui.refreshPlatformClosingOwner("daorg_beta", 2)
    expect(ui.requests).toHaveLength(2)
    expect(ui.requests[1].path).toContain("organization_id=daorg_beta")
    ui.requests[1].task.resolve(closingState({
      organization_id: "daorg_beta",
      seller_id: "sel_beta",
      reason: "synthetic private Beta reason",
      first_appeal_open: false,
      final_review_open: true,
    }))
    await beta
    ui.requests[0].task.resolve(closingState())
    await alpha

    expect(ui.nodes["store-platform-appeal-reason"].textContent)
      .toContain("synthetic private Beta reason")
    expect(ui.nodes["store-platform-appeal-reason"].textContent)
      .not.toContain("synthetic private Alpha reason")
    expect(ui.secondButton.disabled).toBe(false)
    expect(ui.firstButton.disabled).toBe(true)
  })

  it("does not clear the new Owner state when the previous Organization's 403 arrives late", async () => {
    const ui = await mountOwnerInlineUI()
    const alpha = ui.refreshPlatformClosingOwner("daorg_alpha", 1)
    ui.clearPlatformClosingOwner()
    ui.setScope("daorg_beta", 2)
    ui.choice.value = "sel_beta"
    const beta = ui.refreshPlatformClosingOwner("daorg_beta", 2)
    ui.requests[1].task.resolve(closingState({
      organization_id: "daorg_beta",
      seller_id: "sel_beta",
      reason: "synthetic private Beta reason",
      first_appeal_open: false,
      final_review_open: true,
    }))
    await beta
    ui.requests[0].task.reject(Object.assign(new Error("synthetic denied"), { httpStatus: 403 }))
    await alpha

    expect(ui.nodes["store-platform-appeal-panel"].hidden).toBe(false)
    expect(ui.nodes["store-platform-appeal-reason"].textContent)
      .toContain("synthetic private Beta reason")
    expect(ui.nodes["store-platform-appeal-status"].textContent)
      .not.toContain("Kapatma kararı güvenle doğrulanamadı")
    expect(ui.secondForm.hidden).toBe(false)
  })

  it("fails closed on an invalid terminal-finalization grant even if server claims an open review window", async () => {
    const ui = await mountOwnerInlineUI()
    const read = ui.refreshPlatformClosingOwner("daorg_alpha", 1)
    ui.requests[0].task.resolve(closingState({
      permanent_finalization_enabled: true,
      reason: "synthetic private MUST NOT RENDER",
      final_review_open: true,
    }))
    await read

    expect(ui.nodes["store-platform-appeal-reason"].textContent).toBe("")
    expect(ui.nodes["store-platform-appeal-panel"].hidden).toBe(false)
    expect(ui.nodes["store-platform-appeal-status"].textContent)
      .toBe("Kapatma kararı güvenle doğrulanamadı; itiraz gönderilemez.")
    expect(ui.firstButton.disabled).toBe(true)
    expect(ui.secondButton.disabled).toBe(true)
  })
})
