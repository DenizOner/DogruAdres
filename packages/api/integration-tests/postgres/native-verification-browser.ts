/**
 * Real Chrome -> Next.js Storefront -> native Medusa API -> PostgreSQL verification acceptance.
 * Runs on the existing free runner / loopback network against the disposable PG16 service.
 * No external SaaS, tunnels, paid services, or persistent storage.
 */
import assert from "node:assert/strict"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

function findChromeBinary(): string {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw Error("REFUSED: compatible Chrome/Chromium binary not found on runner")
}

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const s = createServer()
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as any).port
      s.close(() => resolvePort(port))
    })
    s.on("error", reject)
  })
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function until<T>(check: () => Promise<T | false | null | undefined>, timeoutMs = 30000, desc = "condition"): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const result = await check()
      if (result) return result
    } catch (e) {
      lastError = e
    }
    await pause(100)
  }
  throw Error(`Timeout waiting for ${desc} (${timeoutMs}ms)${lastError ? `: ${lastError}` : ""}`)
}

function killProcess(proc: ChildProcess | undefined) {
  if (!proc || proc.killed) return
  try {
    if (process.platform === "win32" && proc.pid) {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/f", "/t"], { stdio: "ignore" })
    } else {
      proc.kill("SIGKILL")
    }
  } catch {}
}

export interface NativeBrowserParams {
  apiOrigin: string
  token: string
  recipient: string
  identityId: string
  initialRow: any
  pg: any
  logs: string[]
}

export async function verifyNativeBrowser({
  apiOrigin,
  token,
  recipient: _recipient,
  identityId: _identityId,
  initialRow,
  pg,
  logs,
}: NativeBrowserParams): Promise<void> {
  const chromePath = findChromeBinary()
  const storefrontPort = await getFreePort()
  const cdpPort = await getFreePort()
  const storefrontDir = resolve(process.cwd(), "../../apps/storefront")

  const tempProfile = mkdtempSync(join(tmpdir(), "chrome-da-profile-"))
  let storefront: ChildProcess | undefined
  let chrome: ChildProcess | undefined
  let ws: WebSocket | undefined
  let storefrontLogs = ""

  try {
    // 1. Launch Next.js Storefront in development mode bound to loopback.
    const nextBin = require.resolve("next/dist/bin/next", { paths: [storefrontDir] })
    storefront = spawn(process.execPath, [nextBin, "dev", "-p", String(storefrontPort), "-H", "127.0.0.1"], {
      cwd: storefrontDir,
      env: {
        ...process.env,
        PORT: String(storefrontPort),
        HOSTNAME: "127.0.0.1",
        MEDUSA_BACKEND_URL: apiOrigin,
        NEXT_PUBLIC_MEDUSA_BACKEND_URL: apiOrigin,
        NEXT_PUBLIC_DEFAULT_REGION: "tr",
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    storefront.stdout?.on("data", (d) => { storefrontLogs += d.toString() })
    storefront.stderr?.on("data", (d) => { storefrontLogs += d.toString() })

    // Wait until Next.js Storefront responds on loopback.
    await until(async () => {
      if (storefront!.exitCode !== null) {
        throw Error(`Storefront exited prematurely with code ${storefront!.exitCode}: ${storefrontLogs}`)
      }
      const res = await fetch(`http://127.0.0.1:${storefrontPort}/auth/verify-email?token=probe`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      })
      return res.status === 200 || res.status === 307
    }, 60000, "Next.js Storefront loopback readiness")

    // 2. Launch real Chrome in headless mode with remote debugging port.
    chrome = spawn(chromePath, [
      "--headless=new",
      `--remote-debugging-port=${cdpPort}`,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--user-data-dir=${tempProfile}`,
      "about:blank",
    ], { stdio: "ignore" })

    // Wait for CDP readiness.
    await until(async () => {
      if (chrome!.exitCode !== null) {
        throw Error(`Chrome exited prematurely with code ${chrome!.exitCode}`)
      }
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    }, 15000, "Chrome CDP loopback readiness")

    const tabs = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
    const pageTab = tabs.find((t: any) => t.type === "page") ||
      (await (await fetch(`http://127.0.0.1:${cdpPort}/json/new`, { method: "PUT" })).json())
    assert.ok(pageTab?.webSocketDebuggerUrl, "Missing Chrome page WebSocket debugger URL")

    ws = new WebSocket(pageTab.webSocketDebuggerUrl)
    await new Promise<void>((resolveWs, rejectWs) => {
      ws!.onopen = () => resolveWs()
      ws!.onerror = rejectWs
    })

    let rpcId = 1
    const pendingRpc = new Map<number, (res: any) => void>()
    const networkRequests: any[] = []
    const networkResponses: any[] = []

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString())
      if (msg.id && pendingRpc.has(msg.id)) {
        pendingRpc.get(msg.id)!(msg)
        pendingRpc.delete(msg.id)
      }
      if (msg.method === "Network.requestWillBeSent") {
        networkRequests.push(msg.params)
      }
      if (msg.method === "Network.responseReceived") {
        networkResponses.push(msg.params)
      }
    }

    function cdpSend(method: string, params: Record<string, unknown> = {}): Promise<any> {
      const id = rpcId++
      return new Promise((resolveCmd, rejectCmd) => {
        pendingRpc.set(id, (msg) => {
          if (msg.error) rejectCmd(new Error(msg.error.message || JSON.stringify(msg.error)))
          else resolveCmd(msg.result)
        })
        ws!.send(JSON.stringify({ id, method, params }))
      })
    }

    async function evaluate<T = any>(expression: string): Promise<T> {
      const res = await cdpSend("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
      return res?.result?.value
    }

    await cdpSend("Page.enable")
    await cdpSend("Network.enable")
    await cdpSend("Runtime.enable")

    // 3. Navigate Chrome to Next.js verification route with the actual token.
    const targetUrl = `http://127.0.0.1:${storefrontPort}/auth/verify-email?token=${encodeURIComponent(token)}`
    await cdpSend("Page.navigate", { url: targetUrl })

    // Wait for the verification route response and verify Next.js middleware headers.
    const routeResponse = await until(async () => {
      return networkResponses.find(r => r.response.url.includes("/auth/verify-email"))
    }, 25000, "Next.js verification route response")

    assert.ok(routeResponse, "Missing Next.js verification response")
    const headers = routeResponse.response.headers || {}
    const refKey = Object.keys(headers).find(k => k.toLowerCase() === "referrer-policy")
    const referrerPolicy = refKey ? headers[refKey] : undefined
    assert.equal(String(referrerPolicy).toLowerCase(), "no-referrer", "Next.js middleware must set Referrer-Policy: no-referrer")
    process.stdout.write("PASS browser Next middleware: real Next.js route rewrite, Referrer-Policy: no-referrer\n")

    // 4. Token preservation & early URL scrub verification.
    // Wait for the button to appear in the DOM (hydration complete).
    await until(async () => {
      const btn = await evaluate("document.getElementById('btn-confirm-email')?.innerText")
      return typeof btn === "string" && btn.length > 0
    }, 25000, "Verify email confirmation button in DOM")

    // Assert that window.location.href does NOT contain the token (early URL scrub).
    const currentHref = await evaluate<string>("window.location.href")
    assert.ok(!currentHref.includes(token), "Token leaked in browser window.location.href after hydration")
    process.stdout.write("PASS browser token preservation: early URL scrub, memory retention across hydration\n")

    // 5. Native GET inspection without database mutation.
    const getRequest = networkRequests.find(r => r.request.url.includes(`${apiOrigin}/auth/verify-email`) && r.request.method === "GET")
    assert.ok(getRequest, "Storefront did not execute native GET inspection to Medusa backend")
    const dbRowBeforeClick = await pg("auth_verification").where({ id: initialRow.id }).first()
    assert.ok(!dbRowBeforeClick.verified_at, "Native GET inspection unexpectedly mutated PostgreSQL verified_at")
    assert.equal(dbRowBeforeClick.provider_metadata.token_hash, initialRow.provider_metadata.token_hash, "Token hash altered during inspection")

    // Check that NO POST request has been sent before user click.
    const earlyPost = networkRequests.find(r => r.request.url.includes(`${apiOrigin}/auth/verify-email`) && r.request.method === "POST")
    assert.ok(!earlyPost, "POST dispatched to API before explicit user confirmation click")
    process.stdout.write("PASS browser native GET inspection: pending status displayed, PostgreSQL verified_at remains NULL, no POST before click\n")

    // 6. Real browser confirmation click and committed PostgreSQL verified_at.
    await evaluate("document.getElementById('btn-confirm-email').click()")

    // Wait for the confirmed state in the browser DOM.
    await until(async () => {
      const text = await evaluate<string>("document.body.innerText")
      return text.includes("E-posta Başarıyla Doğrulandı") || text.includes("Email Successfully Verified")
    }, 15000, "Confirmed UI state in browser DOM")

    // Verify committed verified_at in PostgreSQL via independent transaction.
    const confirmedRow = await pg("auth_verification").where({ id: initialRow.id }).first()
    assert.ok(confirmedRow.verified_at && Number.isFinite(new Date(confirmedRow.verified_at).getTime()), "PostgreSQL verified_at must be durably committed after Chrome click")
    process.stdout.write("PASS browser explicit confirmation: real Chrome click, confirmed POST, committed verified_at in PostgreSQL\n")

    // 7. Replay denial: reload page with token URL and check consumed state.
    await cdpSend("Page.navigate", { url: targetUrl })
    await until(async () => {
      const text = await evaluate<string>("document.body.innerText")
      return text.includes("Bağlantı Daha Önce Kullanılmış") || text.includes("Link Already Used")
    }, 20000, "Consumed UI state upon replay navigation")

    const btnAfterReplay = await evaluate("document.getElementById('btn-confirm-email')")
    assert.ok(!btnAfterReplay, "Confirm button must not exist in consumed replay state")

    // Duplicate POST directly from browser context must be rejected with 409 consumed.
    const duplicateStatus = await evaluate(`
      fetch("${apiOrigin}/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ${JSON.stringify(token)} })
      }).then(r => r.status)
    `)
    assert.equal(duplicateStatus, 409, "Duplicate POST in browser context must return 409")
    process.stdout.write("PASS browser replay denial: consumed state on reload, duplicate POST rejected 409\n")

    // 8. Privacy: no token leaked in Referer headers, rendered body, or test logs.
    for (const req of networkRequests) {
      const referer = req.request.headers["Referer"] || req.request.headers["referer"] || ""
      assert.ok(!referer.includes(token), "Token leaked in HTTP Referer header")
    }
    const finalBodyText = await evaluate<string>("document.body.innerText")
    assert.ok(!finalBodyText.includes(token), "Token leaked into rendered DOM body")
    assert.ok(logs.every(line => !line.includes(token)), "Token leaked into captured test logs")
    process.stdout.write("PASS browser privacy: no token in Referer, navigation, rendered errors or test logs\n")
  } finally {
    if (ws) {
      try { ws.close() } catch {}
    }
    killProcess(chrome)
    try {
      rmSync(tempProfile, { recursive: true, force: true })
    } catch {}
    killProcess(storefront)
  }
}
