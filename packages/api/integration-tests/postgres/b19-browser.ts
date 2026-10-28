import assert from 'node:assert/strict'
import { writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import { createServer as createNetServer } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function until<T>(
  check: () => Promise<T | false | null | undefined>,
  timeoutMs = 30000,
  desc = 'condition',
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try { const v = await check(); if (v) return v } catch (e) { lastErr = e }
    await pause(150)
  }
  throw Error(`Timeout: ${desc} (${timeoutMs}ms)${lastErr ? ': ' + lastErr : ''}`)
}

export function otp(seed: string): string {
  let bits = ''
  for (const c of seed.toUpperCase().replace(/=+$/, '')) {
    const n = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c)
    assert.ok(n >= 0, 'B18_INVALID_OTP_SEED')
    bits += n.toString(2).padStart(5, '0')
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(b => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = createHmac('sha1', key).update(counter).digest()
  const i = h[h.length - 1] & 15
  return ((h.readUInt32BE(i) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer()
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => resolve(p)) })
    s.on('error', reject)
  })
}

function findChrome(): string {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN
  for (const c of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  ]) { if (existsSync(c)) return c }
  throw Error('B18_CHROME_NOT_FOUND')
}

export class B19Chrome {
  private root = mkdtempSync(join(process.env.B19_DIR || tmpdir(), 'chrome-b19-'))
  private chrome?: ChildProcess
  private ws?: WebSocket
  private id = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  readonly http: Array<{ method: string; path: string; status: number; trustedTls: boolean; phase: string }> = []
  phase = 'init'
  onEvent?: (message: any) => void
  private methodMap = new Map<string, string>()

  constructor(readonly origin: string, readonly label: string) {}

  async start(): Promise<void> {
    const port = await getFreePort()
    const bin = findChrome()
    const profileDir = join(this.root, 'profile')
    mkdirSync(profileDir, { recursive: true })
    assert.equal(new URL(this.origin).protocol, 'https:', 'B19_HTTPS_REQUIRED')
    writeFileSync(join(this.root, 'ownership.json'), JSON.stringify({label:this.label,root:this.root}));
    this.chrome = spawn(bin, [
      '--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
      '--disable-gpu', '--disable-dev-shm-usage', `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true, env: { ...process.env, HOME: this.root } })

    writeFileSync(join(this.root, 'pid.json'), JSON.stringify({pid:this.chrome.pid,root:this.root,port}));
    await until(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })).ok } catch { return false }
    }, 15000, `${this.label} CDP ready`)

    const tabs: any = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = tabs.find((t: any) => t.type === 'page')
    assert.ok(page?.webSocketDebuggerUrl, `${this.label} CDP page missing`)

    this.ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve()
      this.ws!.onerror = () => reject(Error(`${this.label} CDP WS failed`))
    })
    this.ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data.toString())
        if (m.method) this.onEvent?.(m)
        if (m.id) {
          const p = this.pending.get(m.id)
          if (p) { clearTimeout(p.timer); this.pending.delete(m.id); m.error ? p.reject(Error(`${this.label}_CDP_ERR`)) : p.resolve(m.result) }
        }
        if (m.method === 'Network.requestWillBeSent') this.methodMap.set(m.params.requestId, m.params.request.method)
        if (m.method === 'Network.responseReceived') {
          try {
            const r = m.params.response, u = new URL(r.url)
            if (u.origin === this.origin) this.http.push({
              method: this.methodMap.get(m.params.requestId) ?? '?',
              path: u.pathname, status: r.status,
              trustedTls: r.securityState === 'secure' && !!r.securityDetails,
              phase: this.phase,
            })
          } catch {}
        }
      } catch {}
    }
    for (const m of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Security.enable']) await this.send(m)
    this.phase = 'nav'
    const nav = await this.send('Page.navigate', { url: this.origin + '/personal' })
    assert.ok(!nav.errorText, `${this.label} nav failed: ${nav.errorText}`)
    await this.wait("!document.getElementById('login').hidden", 15000)
    assert.ok(this.http.some(r => r.path === '/personal' && r.status === 200 && r.trustedTls), `${this.label} B19_TRUSTED_HTTPS_REQUIRED`)
  }

  send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`${this.label} CDP_TIMEOUT: ${method}`)) }, 25000)
      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expr: string): Promise<any> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    assert.ok(!r.exceptionDetails, `${this.label} eval: ${r.exceptionDetails?.text}`)
    return r.result?.value
  }

  async wait(expr: string, ms = 25000): Promise<void> {
    await until(async () => (await this.eval(expr)) === true, ms, expr)
  }

  async click(sel: string): Promise<void> {
    const p = await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView();const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`)
    assert.ok(p, `${this.label} missing: ${sel}`)
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 })
  }

  async input(sel: string, value: string): Promise<void> {
    await this.click(sel); await this.send('Input.insertText', { text: value })
  }

  async cookie(): Promise<string | undefined> {
    const r = await this.send('Network.getCookies', { urls: [this.origin] })
    return r.cookies.find((c: any) => c.name === 'da_session')?.value
  }

  async screenshot(path: string): Promise<void> {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(r.data, 'base64'), { mode: 0o600 })
  }

  async close(): Promise<void> {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('closing')) }
    this.pending.clear()
    try { this.ws?.close() } catch {}
    if (this.chrome) {
      this.chrome.kill()
      await until(async () => this.chrome!.exitCode !== null || this.chrome!.signalCode !== null, 8000, `${this.label} exit`).catch(() => {})
    }
    try { rmSync(this.root, { recursive: true, force: true }) } catch {}
  }
}
