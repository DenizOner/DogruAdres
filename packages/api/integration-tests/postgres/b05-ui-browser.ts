/** B05 adaptation of B04's Chrome/CDP lifecycle. No new browser dependency.
 * Real backend responses and browser-local simulations are reported separately.
 */
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findChromeBinary, getFreePort, until, killProcess } from "./native-verification-browser"

export async function verifyB05Ui(p: {
  origin: string; email: string; password: string; personId: string; actor: "Admin" | "Owner"
  org1: { id: string; name: string }; org2: { id: string; name: string }; report: any
  readback: (rows: any[]) => Promise<void>; revoke: () => Promise<void>
  captureSession?: (cookie: string) => void
}) {
  const profile = mkdtempSync(join(tmpdir(), "chrome-da-profile-b05-")), port = await getFreePort()
  let chrome: ChildProcess | undefined, ws: WebSocket | undefined, nextId = 1, phase = "login", holdNext = false
  let held: any, eventError = false
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const requests = new Map<string, { phase: string; method: string }>(), finished = new Set<string>()
  const responses: any[] = [], writes: string[] = []
  const evidence: any = { actor: p.actor, engine: "real Chrome --headless=new / CDP", observations: [], http: [], cleanup: false }
  p.report.browsers.push(evidence)
  const note = (check: string, simulated = false) => evidence.observations.push({ phase, check, outcome: "PASS", evidence: simulated ? "SIMULATED UI ONLY" : "REAL UI / NATIVE HTTP / SQL" })
  try {
    const binary = findChromeBinary(); assert.match(binary, /chrome|chromium/i)
    chrome = spawn(binary, ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
      "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" })
    await until(async () => {
      assert.equal(chrome!.exitCode, null, "Chrome exited")
      return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })).ok
    }, 15000, "B05 CDP readiness")
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as any[]
    ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = () => reject(Error("CDP unavailable")) })
    const send = (method: string, params: object = {}): Promise<any> => new Promise((resolve, reject) => {
      const id = nextId++, timer = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout")) }, 15000)
      pending.set(id, { resolve, reject, timer }); ws!.send(JSON.stringify({ id, method, params }))
    })
    ws.onmessage = event => {
      const m = JSON.parse(event.data.toString())
      if (m.id && pending.has(m.id)) {
        const rpc = pending.get(m.id)!; clearTimeout(rpc.timer); pending.delete(m.id)
        if (m.error) rpc.reject(Error("CDP command rejected")); else rpc.resolve(m.result)
      }
      if (m.method === "Network.requestWillBeSent") {
        requests.set(m.params.requestId, { phase, method: m.params.request.method })
        if (m.params.request.method !== "GET") writes.push(new URL(m.params.request.url).pathname)
      }
      if (m.method === "Network.responseReceived") {
        const u = new URL(m.params.response.url), req = requests.get(m.params.requestId)
        if (u.origin === p.origin && u.pathname === "/personal/memberships") {
          responses.push({ ...req, id: m.params.requestId, scope: u.searchParams.get("organization") === p.org1.id ? "Org1" : "Org2", response: m.params.response })
        }
      }
      if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") finished.add(m.params.requestId)
      if (m.method === "Fetch.requestPaused") {
        if (holdNext) { held = m.params; holdNext = false }
        else void send("Fetch.continueRequest", { requestId: m.params.requestId }).catch(() => { eventError = true })
      }
    }
    const evaluate = async (expression: string) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
      assert.ok(!r.exceptionDetails, "Browser evaluation failed"); return r.result?.value
    }
    const wait = (expression: string, desc: string) => until(async () => (await evaluate(expression)) === true, 20000, desc)
    const visible = (id: string) => `!!document.getElementById(${JSON.stringify(id)})?.getClientRects().length`
    const click = async (selector: string) => {
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`)
      assert.ok(point, "Visible UI control missing")
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 })
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 })
    }
    const input = async (selector: string, value: string) => { await click(selector); await send("Input.insertText", { text: value }) }
    const select = async (org: typeof p.org1) => {
      const role = p.actor === "Owner" ? "owner" : org === p.org1 ? "admin" : "member"
      const index = await evaluate(`Array.from(document.querySelectorAll('#organizations button')).findIndex(b=>b.textContent===${JSON.stringify(org.name + " — " + role)})`)
      assert.ok(index >= 0, "Chooser entry missing"); await click(`#organizations button:nth-child(${index + 1})`)
    }
    const status = (text: string) => `document.getElementById('memberships-status').textContent===${JSON.stringify(text)}`
    const ready = (n: number) => wait(`${status('Üyelik listesi güncellendi.')}&&document.querySelectorAll('#memberships p').length===${n}&&document.getElementById('memberships').ariaBusy==='false'`, "B05 visible list")
    const arm = () => { assert.ok(!held && !holdNext, "Interception already armed"); holdNext = true }
    const paused = async () => { await until(async () => !!held, 20000, "B05 membership request pause"); return held }
    const release = async () => { const req = await paused(); held = undefined; await send("Fetch.continueRequest", { requestId: req.requestId }) }
    const loading = async () => {
      await paused()
      assert.equal(await evaluate(`${status('Üyelikler yükleniyor…')}&&document.getElementById('memberships').ariaBusy==='true'&&document.querySelectorAll('#memberships p').length===0&&document.getElementById('memberships-status').getAttribute('role')==='status'&&document.getElementById('memberships-status').getAttribute('aria-live')==='polite'`), true, "Accessible loading and stale-list removal")
    }
    const realList = async (n: number) => {
      await ready(n)
      assert.equal(await evaluate(`(()=>{const d=JSON.parse(document.getElementById('detail').textContent);return d.id===${JSON.stringify(p.org1.id)}&&d.role===${JSON.stringify(p.actor.toLowerCase())}})()`), true, "Exact selected role/scope DOM")
      const r = await until(async () => responses.find(r => r.phase === phase && r.response.status === 200 && finished.has(r.id)), 20000, "Genuine membership HTTP200")
      const raw = await send("Network.getResponseBody", { requestId: r.id })
      const data = JSON.parse(raw.base64Encoded ? Buffer.from(raw.body, "base64").toString() : raw.body)
      assert.deepEqual(Object.keys(data), ["memberships"], "Response envelope")
      assert.equal(data.memberships.length, n)
      for (const row of data.memberships) assert.deepEqual(Object.keys(row).sort(), ["id", "person_id", "protected_owner", "role", "status"].sort(), "Exact redacted DTO")
      const h = r.response.headers, cache = Object.keys(h).find(k => k.toLowerCase() === "cache-control")
      assert.equal(String(h[cache!]).toLowerCase(), "no-store", "Membership response caching")
      assert.equal(r.method, "GET")
      assert.equal(r.scope, "Org1")
      await p.readback(data.memberships)
      evidence.http.push({ phase, evidence: "REAL BACKEND", method: "GET", scope: r.scope, status: 200, rows: n, dtoKeys: ["id", "person_id", "role", "status", "protected_owner"], noStore: true, sqlMatched: true })
    }
    const denied = async () => {
      await wait(`${status('Üyelik listesini görüntüleme izniniz yok.')}&&document.querySelectorAll('#memberships p,#memberships button,#memberships select').length===0&&!(${visible('memberships-refresh')})&&!(${visible('invite-member')})&&!(${visible('audit-timeline-section')})`, "Member denied and concealed")
      await until(async () => responses.some(r => r.phase === phase && r.scope === "Org2" && r.response.status === 403), 20000, "Member genuine HTTP403")
      assert.equal(await evaluate(`(()=>{const d=JSON.parse(document.getElementById('detail').textContent);return d.id===${JSON.stringify(p.org2.id)}&&d.role==='member'})()`), true, "Member scope DOM")
      assert.equal(await evaluate(`document.getElementById('memberships').textContent.includes(${JSON.stringify(p.personId)})`), false)
      evidence.http.push({ phase, evidence: "REAL BACKEND", method: "GET", scope: "Org2", status: 403 })
    }
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable")
    assert.equal((await send("Network.getCookies", { urls: [p.origin] })).cookies.length, 0, "Fresh isolated Chrome profile")
    await send("Fetch.enable", { patterns: [{ urlPattern: p.origin + "/personal/memberships*", requestStage: "Request" }] })
    await send("Page.navigate", { url: p.origin + "/personal" }); await wait(visible("login"), "B05 login UI")
    await input('#login input[name="email"]', p.email); await input('#login input[name="password"]', p.password); await click("#login button")
    await wait(`${visible('workspace')}&&document.getElementById('person').textContent===${JSON.stringify('Person: ' + p.personId)}&&document.querySelectorAll('#organizations button').length===2`, "Exact isolated actor identity")
    phase = "initial-list"; arm(); await select(p.org1); await loading(); await release(); await realList(2)
    note("Visible chooser, accessible loading (browser-held genuine request), two active SQL-matched rows and exact DTO/no-store")
    phase = "refresh"; arm(); await click("#memberships-refresh"); await loading(); await release(); await realList(2)
    note("Visible refresh reauthorizes Org1, clears stale rows, returns genuine HTTP200/SQL list")
    if (p.actor === "Admin") {
      phase = "member-denied"; await select(p.org2); await denied()
      note("Org2 Member meaningful denial, no membership/Admin controls or stale Org1 rows")
      phase = "member-reload"; await send("Page.reload", { ignoreCache: true }); await denied()
      assert.equal(await evaluate(`location.search==='?organization='+${JSON.stringify(p.org2.id)}`), true)
      note("Actual Member page reload retains correct Org2 scope and safe denial")
      const cookie = (await send("Network.getCookies", { urls: [p.origin] })).cookies.find((c: any) => c.name === "da_session")
      assert.ok(cookie?.value, "Browser session absent"); p.captureSession?.("da_session=" + cookie.value)
    } else {
      phase = "owner-after-revoke"; await p.revoke(); arm(); await click("#memberships-refresh"); await loading(); await release(); await realList(1)
      note("Native single revoke; Owner genuine HTTP200 list contains only active Owner; revoked row retained in SQL")
      // Browser-local controlled results never go to Foundation or count as DB evidence.
      for (const kind of ["empty", "server-error", "network-error"] as const) {
        phase = "sim-" + kind; arm(); await click("#memberships-refresh"); await loading()
        const req = await paused(); held = undefined
        if (kind === "network-error") await send("Fetch.failRequest", { requestId: req.requestId, errorReason: "Failed" })
        else await send("Fetch.fulfillRequest", { requestId: req.requestId, responseCode: kind === "empty" ? 200 : 503,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(kind === "empty" ? { memberships: [] } : { message: "synthetic upstream error" })).toString("base64") })
        await wait(`${status(kind === 'empty' ? 'Gösterilecek üyelik bulunmuyor.' : 'Üyelik listesi yüklenemedi. Yeniden deneyin.')}&&document.querySelectorAll('#memberships p,#memberships button,#memberships select').length===0&&document.getElementById('memberships').ariaBusy==='false'`, "Simulated state")
        note("Browser-local " + kind + "; no stale rows; distinct accessible status", true)
      }
      phase = "sim-pagehide-late"; arm(); await click("#memberships-refresh"); await loading()
      const req = await paused(); held = undefined
      // Simulated lifecycle event in the actual shipped page, followed by a late response.
      await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
      await send("Fetch.fulfillRequest", { requestId: req.requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify({ memberships: [{ id: "simulated-only", person_id: "simulated-private-marker", role: "member", status: "active", protected_owner: false }] })).toString("base64") })
      await until(async () => finished.has(req.networkId), 20000, "Late simulated response completion")
      assert.equal(await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.getElementById('workspace').hidden&&document.getElementById('memberships').textContent===''&&document.getElementById('memberships-status').textContent===''&&document.getElementById('memberships').ariaBusy==='false'&&document.getElementById('memberships-refresh').hidden))))"), true)
      note("Simulated pagehide plus late response cannot restore private rows/status/controls", true)
    }
    assert.deepEqual(writes, ["/personal/session"], "Only one login mutation per isolated profile")
    assert.equal(eventError, false, "CDP event failure")
    evidence.passed = true
  } finally {
    evidence.lastPhase = phase
    for (const rpc of pending.values()) { clearTimeout(rpc.timer); rpc.reject(Error("CDP closed")) }
    ws?.close(); killProcess(chrome)
    if (chrome && chrome.exitCode === null) await new Promise<void>(resolve => { chrome!.once("exit", () => resolve()); setTimeout(resolve, 5000) })
    assert.ok(!chrome || chrome.exitCode !== null || chrome.signalCode !== null, "Task Chrome remains running")
    rmSync(profile, { recursive: true, force: false }); assert.equal(existsSync(profile), false)
    evidence.cleanup = true
  }
}
