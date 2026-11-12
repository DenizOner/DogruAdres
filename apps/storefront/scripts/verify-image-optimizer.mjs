// #175: Actual production Next image optimizer, not images.unoptimized=true.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
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
const server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stdout.on('data', (data) => { output += String(data).slice(0, 2048) })
server.stderr.on('data', (data) => { output += String(data).slice(0, 2048) })
const base = 'http://127.0.0.1:' + port
const image = (src) => base + '/_next/image?' + new URLSearchParams({ url: src, w: '256', q: '75' })
const get = (url) => fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'manual' })
try {
  let ready = false
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw Error('next start exited: ' + output.slice(-3500))
    try {
      const response = await get(image('https://untrusted.example.test/photo.jpg'))
      assert.equal(response.status, 400)
      ready = true
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  assert.equal(ready, true, 'Next production HTTP not listening: ' + output.slice(-3500))
  for (const src of [
    'https://untrusted.example.test/photo.jpg',
    'https://api.mercurjs.com/private.jpg',
    'http://127.0.0.1:9000/static/secret.jpg',
    'http://localhost:9000/static/secret.jpg',
    'https://169.254.169.254/metadata.jpg',
    'https://api.dicebear.com/9.x/initials/svg?seed=person',
  ]) {
    const result = await get(image(src))
    assert.equal(result.status, 400, 'Unexpectedly accepted: ' + src)
  }
  const local = await get(image('/images/product/placeholder.jpg'))
  assert.equal(local.status, 200, 'Allowed local JPEG must render')
  assert.match(local.headers.get('content-type') || '', /^image\/(jpeg|webp|avif)$/)
  assert.ok((await local.arrayBuffer()).byteLength > 100)
  const directSvg = await get(base + '/images/placeholder.svg')
  assert.equal(directSvg.status, 200, 'Bundled placeholder SVG remains available')
  assert.match(directSvg.headers.get('content-type') || '', /image\/svg\+xml/)
  const svgOptimizer = await get(image('/images/placeholder.svg'))
  assert.equal(svgOptimizer.status, 400, 'SVG optimizer must reject SVG when disabled')
  // Actual headless Chrome must hydrate the user-facing SafeImage wrapper.
  // An optimizer 400 is not enough if the product page still shows a broken image.
  const fixtureResponse = await get(base + '/images/image-175-ci-only')
  assert.equal(fixtureResponse.status, 200, 'CI-only image test page must bypass Medusa locale middleware')
  assert.match(await fixtureResponse.text(), /image175-remote/, 'CI image fixture not rendered')

  const browser = await new Promise((resolve, reject) => {
    const chrome = spawn('google-chrome', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-networking', '--no-first-run',
      '--virtual-time-budget=7000', '--dump-dom', base + '/images/image-175-ci-only',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let dom = ''
    let errors = ''
    chrome.stdout.on('data', (chunk) => { dom += String(chunk) })
    chrome.stderr.on('data', (chunk) => { errors += String(chunk).slice(0, 3000) })
    const timeout = setTimeout(() => chrome.kill('SIGKILL'), 35000)
    chrome.once('error', reject)
    chrome.once('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) return reject(Error('Real Chrome exit ' + code + ': ' + errors.slice(-1500)))
      resolve(dom)
    })
  })
  const imageTag = browser.match(/<img\b[^>]*data-testid="image175-remote"[^>]*>/i)?.[0] || ''
  assert.ok(imageTag, 'real Chrome did not render the SafeImage product fixture')
  assert.match(imageTag, /src="\/images\/placeholder\.svg"/, 'Chrome did not hydrate the safe image fallback')
  console.log('PASS #175 real Chrome: forbidden product image replaced with safe local SVG after HTTP 400')

  console.log('PASS #175 real Next production HTTP: six remote 400 denials, JPEG 200, static SVG 200, optimized SVG 400')
} finally {
  server.kill('SIGTERM')
  const timer = setTimeout(() => server.kill('SIGKILL'), 3000)
  timer.unref()
}
