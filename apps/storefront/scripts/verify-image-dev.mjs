// #175: real Next 15 development server + Chrome must fall back before a
// forbidden remote image can crash React render; no external media host is read.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const reserve = createServer()
await new Promise((resolve, reject) => {
  reserve.once('error', reject)
  reserve.listen(0, '127.0.0.1', resolve)
})
const port = reserve.address().port
await new Promise((resolve) => reserve.close(resolve))
const base = 'http://127.0.0.1:' + port
const image = (src) => base + '/_next/image?' +
  new URLSearchParams({ url: src, w: '256', q: '75' })
const source = 'https://untrusted.example.test/no-image.png'
const server = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stdout.on('data', (chunk) => { output += String(chunk).slice(-2048) })
server.stderr.on('data', (chunk) => { output += String(chunk).slice(-2048) })
try {
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  assert.equal(process.env.GITHUB_HEAD_REF, 'fix/storefront-image-allowlist-175')
  let ready = false
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw Error('next dev exited: ' + output.slice(-2000))
    try {
      const r = await fetch(base + '/images/image-175-ci-only', { signal: AbortSignal.timeout(5000) })
      if (r.status === 200 && (await r.text()).includes('image175-remote')) {
        ready = true
        break
      }
    } catch { /* development route is still compiling */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.ok(ready, 'Next dev fixture was not ready: ' + output.slice(-2000))
  const denied = await fetch(image(source), { signal: AbortSignal.timeout(10000) })
  assert.equal(denied.status, 400, 'Development optimizer must reject the untrusted URL')

  const profile = mkdtempSync(join(tmpdir(), 'dogruadres-image175-dev-chrome-'))
  try {
    const dom = await new Promise((resolve, reject) => {
      const chrome = spawn('google-chrome', [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
        '--user-data-dir=' + profile, '--virtual-time-budget=8000', '--dump-dom',
        base + '/images/image-175-ci-only',
      ], { stdio: ['ignore', 'pipe', 'pipe'] })
      let html = ''
      let errors = ''
      let timedOut = false
      chrome.stdout.on('data', (chunk) => { html += String(chunk) })
      chrome.stderr.on('data', (chunk) => { errors += String(chunk).slice(-3000) })
      const timeout = setTimeout(() => { timedOut = true; chrome.kill('SIGKILL') }, 45000)
      chrome.once('error', (error) => { clearTimeout(timeout); reject(error) })
      chrome.once('close', (code) => {
        clearTimeout(timeout)
        if (timedOut || code !== 0) return reject(Error('Chrome dev failure: ' + errors.slice(-2000)))
        resolve(html)
      })
    })
    const tag = dom.match(/<img\b[^>]*data-testid="image175-remote"[^>]*>/i)?.[0] || ''
    assert.ok(tag, 'SafeImage missing from real development Chrome DOM')
    const src = tag.match(/\bsrc="([^"]+)"/i)?.[1] || ''
    assert.equal(new URL(src, base).pathname, '/images/placeholder.svg',
      'Development Chrome must hydrate forbidden remote image to safe local fallback')
    assert.doesNotMatch(dom, /<h2>Application error|Internal Server Error/,
      'Development render must not crash')
    console.log('PASS #175 real Next dev / Chrome: unknown HTTPS optimizer 400 and safe local image fallback')
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
} finally {
  server.kill('SIGTERM')
  const timeout = setTimeout(() => server.kill('SIGKILL'), 3000)
  timeout.unref()
}
