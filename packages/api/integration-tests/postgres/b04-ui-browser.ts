/** B04-only real Chrome UI, reusing the installed native verification CDP lifecycle.
 * No endpoint calls substitute for UI actions. Only sanitized predicates leave Chrome.
 */
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findChromeBinary, getFreePort, until, killProcess } from "./native-verification-browser"

export async function verifyB04Ui(p: {
  origin: string; email: string; password: string; personId: string
  org1: { id: string; name: string }; org2: { id: string; name: string }
  revoke: () => Promise<void>; suspend: () => Promise<void>; report: any
}) {
  const profile = mkdtempSync(join(tmpdir(), "chrome-da-profile-b04-"))
  const port = await getFreePort()
  let chrome: ChildProcess | undefined, ws: WebSocket | undefined
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  let nextId = 1, phase = "startup"
  const responses: { phase: string; path: string; status: number }[] = []
  const requests = new Map<string, string>()
  const posts: string[] = []
  p.report.browser = { engine: "real Chrome --headless=new / CDP", observations: [], cleanup: false }
  const observation = (name: string) => p.report.browser.observations.push({ phase, check: name, passed: true })
  const alias = (url: string) => {
    const u = new URL(url)
    if (u.origin !== p.origin) return "external"
    // Never retain raw query strings, identifiers, credentials, headers or bodies.
    return u.pathname + (u.searchParams.get("id") === p.org1.id || u.searchParams.get("organization") === p.org1.id ? "?scope=Org1" :
      u.searchParams.get("id") === p.org2.id || u.searchParams.get("organization") === p.org2.id ? "?scope=Org2" : "")
  }
  try {
    const binary = findChromeBinary()
    assert.match(binary, /chrome|chromium/i, "B04 requires Chrome/Chromium")
    chrome = spawn(binary, ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
      "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" })
    await until(async () => {
      assert.equal(chrome!.exitCode, null, "Chrome exited")
      return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })).ok
    }, 15000, "B04 Chrome CDP")
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as any[]
    const page = tabs.find(t => t.type === "page")
    assert.ok(page?.webSocketDebuggerUrl)
    ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = () => reject(Error("CDP connection failed")) })
    ws.onmessage = event => {
      const m = JSON.parse(event.data.toString())
      if (m.id && pending.has(m.id)) {
        const rpc = pending.get(m.id)!; clearTimeout(rpc.timer); pending.delete(m.id)
        if (m.error) rpc.reject(Error("CDP command rejected")); else rpc.resolve(m.result)
      }
      if (m.method === "Network.requestWillBeSent") {
        requests.set(m.params.requestId, phase)
        if (m.params.request.method !== "GET") posts.push(alias(m.params.request.url))
      }
      if (m.method === "Network.responseReceived") responses.push({ phase: requests.get(m.params.requestId) ?? phase,
        path: alias(m.params.response.url), status: m.params.response.status })
    }
    const send = (method: string, params: object = {}): Promise<any> => new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => { pending.delete(id); reject(Error("CDP command timeout")) }, 15000)
      pending.set(id, { resolve, reject, timer }); ws!.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async (expression: string) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
      assert.ok(!r.exceptionDetails, "Chrome evaluation failed")
      return r.result?.value
    }
    const wait = async (expression: string, desc: string) => until(async () => (await evaluate(expression)) === true, 20000, desc)
    const visible = (id: string) => `!!document.getElementById(${JSON.stringify(id)})?.getClientRects().length`
    const click = async (selector: string) => {
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e) return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`)
      assert.ok(point, "Required visible UI control missing")
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 })
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 })
    }
    const input = async (selector: string, value: string) => { await click(selector); await send("Input.insertText", { text: value }) }
    const network = async (path: string, status: number) => until(async () => responses.some(r => r.phase === phase && r.path === path && r.status === status), 20000, "UI network status")
    const scoped = async (org: typeof p.org1, role: string) => {
      await wait(`(()=>{try{const d=JSON.parse(document.getElementById('detail').textContent);return d.id===${JSON.stringify(org.id)}&&d.role===${JSON.stringify(role)}&&location.search==='?organization='+${JSON.stringify(org.id)}&&document.getElementById('status').textContent==='Kuruluş erişimi doğrulandı'}catch{return false}})()`, "scoped role DOM and URL")
      await network(`/personal/organizations?scope=${org === p.org1 ? "Org1" : "Org2"}`, 200)
    }
    const memberConcealment = async () => {
      assert.equal(await evaluate(`${visible('invite-member')}||${visible('audit-timeline-section')}||!!document.querySelector('#memberships button,#memberships select')`), false, "Member inherited management controls")
      assert.equal(await evaluate(`['detail','memberships','audit-timeline-entries','invite-result'].some(id=>document.getElementById(id).textContent.includes(${JSON.stringify(p.org1.id)})||document.getElementById(id).textContent.includes(${JSON.stringify(p.org1.name)}))`), false, "Stale Org1 private data")
      await network("/personal/memberships?scope=Org2", 403)
    }
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable")
    phase = "login"
    await send("Page.navigate", { url: p.origin + "/personal" })
    await wait(visible("login"), "login UI")
    await input('#login input[name="email"]', p.email)
    await input('#login input[name="password"]', p.password)
    await click("#login button")
    await wait(`${visible('workspace')}&&document.getElementById('person').textContent===${JSON.stringify("Person: " + p.personId)}&&document.querySelectorAll('#organizations button').length===2`, "Person B workspace")
    await network("/personal/session", 200)
    observation("UI credential input and one submit; Person B identity; two authorized chooser entries")
    phase = "admin"
    // Chooser order is not a product contract: select the exact visible name.
    const select = async (org: typeof p.org1) => {
      const index = await evaluate(`Array.from(document.querySelectorAll('#organizations button')).findIndex(b=>b.textContent===${JSON.stringify(org.name + " — " + (org === p.org1 ? "admin" : "member"))})`)
      assert.ok(index >= 0, "Authorized chooser entry missing")
      await click(`#organizations button:nth-child(${index + 1})`)
    }
    await select(p.org1); await scoped(p.org1, "admin")
    await wait(`${visible('invite-member')}&&${visible('audit-timeline-section')}&&document.querySelectorAll('#memberships p').length===2&&!!document.querySelector('#memberships select')`, "Admin management panels")
    await network("/personal/memberships?scope=Org1", 200)
    observation("Org1 selected by visible chooser; Admin role, membership controls, invitation and audit panels")
    phase = "member"
    await select(p.org2); await scoped(p.org2, "member"); await memberConcealment()
    observation("Org2 selected by visible chooser; Member role; management concealed; no stale Org1 private panel data")
    phase = "reload-member"
    await send("Page.reload", { ignoreCache: true })
    await scoped(p.org2, "member"); await memberConcealment()
    observation("Actual Page.reload retained Org2 URL, Member role and concealed management DOM")
    // One native revoke; reselect through the shipped visible access-check form.
    phase = "revoked"
    await p.revoke()
    await input('#select-org input[name="organization"]', p.org1.id)
    await click("#select-org button")
    await network("/personal/organizations?scope=Org1", 403)
    await wait(`document.getElementById('detail').textContent===''&&document.getElementById('memberships').textContent===''&&!(${visible('invite-member')})&&!(${visible('audit-timeline-section')})&&location.search===''`, "revoked scope private DOM removal")
    observation("Revoked Org1 selection returned 403 and removed private detail/membership/management DOM")
    phase = "unaffected-member"
    await send("Page.reload", { ignoreCache: true })
    await wait(`document.querySelectorAll('#organizations button').length===1&&document.querySelector('#organizations button').textContent===${JSON.stringify(p.org2.name + " — member")}`, "chooser hides revoked Org1")
    await select(p.org2); await scoped(p.org2, "member"); await memberConcealment()
    observation("Reloaded chooser hides revoked Org1; Org2 Member access unchanged")
    phase = "suspended"
    await p.suspend()
    await send("Page.reload", { ignoreCache: true })
    await network("/personal/organizations?scope=Org2", 403)
    await wait(`${visible('workspace')}&&document.querySelectorAll('#organizations button').length===0&&document.getElementById('detail').textContent===''&&document.getElementById('memberships').textContent===''&&!(${visible('invite-member')})&&!(${visible('audit-timeline-section')})&&location.search===''`, "suspended private DOM removal and empty chooser")
    observation("Suspended Org2 reload returned 403; empty chooser and cleared private DOM")
    assert.deepEqual(posts, ["/personal/session"], "Exactly one browser mutation: credential login")
    p.report.http = responses
    p.report.browser.checksPassed = true
  } finally {
    p.report.browser.lastPhase = phase
    for (const rpc of pending.values()) { clearTimeout(rpc.timer); rpc.reject(Error("CDP closed")) }
    ws?.close()
    killProcess(chrome)
    if (chrome && chrome.exitCode === null) await new Promise<void>(resolve => { chrome!.once("exit", () => resolve()); setTimeout(resolve, 5000) })
    assert.ok(!chrome || chrome.exitCode !== null || chrome.signalCode !== null, "Task Chrome still running")
    // mkdtemp created this exact directory; never remove any user profile.
    rmSync(profile, { recursive: true, force: false })
    assert.equal(existsSync(profile), false)
    p.report.browser.cleanup = true
    p.report.http = responses
  }
}
