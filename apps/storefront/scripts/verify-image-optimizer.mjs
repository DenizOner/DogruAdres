// #175: Actual production Next image optimizer, not images.unoptimized=true.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const medusaRequire = createRequire(new URL('../../../packages/api/package.json', import.meta.url))
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
const fixtureHost = 'media-image175-ci.example.org'
const fixtureUrl = 'https://' + fixtureHost + '/static/fixture.jpg'
let mediaServer
let medusaRoot
try {
  // Real HTTPS/TLS test on a disposable CI loopback. This is NOT the real
  // Medusa File provider or an approved production FILE_BACKEND_URL.
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  assert.equal(process.env.GITHUB_HEAD_REF, 'fix/storefront-image-allowlist-175')
  assert.equal(process.env.DOGRUADRES_STOREFRONT_MEDIA_BASE_URL, 'https://' + fixtureHost + '/static')
  assert.ok(process.env.IMAGE175_TLS_KEY && process.env.IMAGE175_TLS_CERT)
  const fixtureBytes = readFileSync('public/images/product/placeholder.jpg')
  // Reuse the installed, version-pinned Medusa LocalFileService, not a mock
  // that manufactures file keys or URLs. The disposable public directory
  // represents its native file-local upload store without API/DB/PII.
  const { LocalFileService } = medusaRequire('@medusajs/medusa/file-local')
  assert.equal(typeof LocalFileService, 'function')
  medusaRoot = mkdtempSync(join(tmpdir(), 'dogruadres-image175-native-file-'))
  const publicDir = join(medusaRoot, 'public')
  const privateDir = join(medusaRoot, 'private')
  mkdirSync(publicDir, { recursive: true })
  mkdirSync(privateDir, { recursive: true })
  const provider = new LocalFileService({}, {
    upload_dir: publicDir,
    private_upload_dir: privateDir,
    backend_url: 'https://' + fixtureHost + '/static',
  })
  const nativeUpload = await provider.upload({
    filename: 'image175-native.jpg',
    mimeType: 'image/jpeg',
    content: fixtureBytes.toString('base64'),
    access: 'public',
  })
  assert.equal(typeof nativeUpload.key, 'string')
  assert.match(nativeUpload.key, /^[a-zA-Z0-9_.-]+$/, 'Native Medusa file key must be a safe basename')
  assert.equal(new URL(nativeUpload.url).origin, 'https://' + fixtureHost)
  assert.equal(new URL(nativeUpload.url).pathname, '/static/' + nativeUpload.key)
  assert.deepEqual(readFileSync(join(publicDir, nativeUpload.key)), fixtureBytes)
  let mediaHits = 0
  let nativeHits = 0
  mediaServer = createHttpsServer({
    key: readFileSync(process.env.IMAGE175_TLS_KEY),
    cert: readFileSync(process.env.IMAGE175_TLS_CERT),
  }, (request, response) => {
    if (request.method !== 'GET' || request.headers.host !== fixtureHost) {
      response.writeHead(404)
      response.end()
      return
    }
    if (request.url === '/static/' + nativeUpload.key) {
      nativeHits += 1
      const actualBytes = readFileSync(join(publicDir, nativeUpload.key))
      response.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'Content-Length': actualBytes.length,
      })
      response.end(actualBytes)
      return
    }
    if (request.url !== '/static/fixture.jpg') {
      response.writeHead(404)
      response.end()
      return
    }
    mediaHits += 1
    response.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store',
      'Content-Length': fixtureBytes.length,
    })
    response.end(fixtureBytes)
  })
  await new Promise((resolve, reject) => {
    mediaServer.once('error', reject)
    mediaServer.listen(443, '127.0.0.1', resolve)
  })
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
  // Positive authorization: Next's real optimizer must fetch only the
  // exact-host, exact-path CI HTTPS fixture with certificate validation.
  const allowedRemote = await get(image(fixtureUrl))
  assert.equal(allowedRemote.status, 200, 'Approved HTTPS /static fixture must render')
  assert.match(allowedRemote.headers.get('content-type') || '', /^image\/(jpeg|webp|avif)$/)
  assert.ok((await allowedRemote.arrayBuffer()).byteLength > 100)
  assert.equal(mediaHits, 1, 'Next must fetch the authorized HTTPS fixture exactly once')
  // Actual installed Medusa provider -> its generated file key and URL ->
  // the same disposable HTTPS origin -> real Next image optimizer.
  const nativeImage = await get(image(nativeUpload.url))
  assert.equal(nativeImage.status, 200, 'Native Medusa public file URL must optimize over TLS')
  assert.match(nativeImage.headers.get('content-type') || '', /^image\/(jpeg|webp|avif)$/)
  assert.ok((await nativeImage.arrayBuffer()).byteLength > 100)
  assert.equal(nativeHits, 1, 'Next must fetch the native Medusa uploaded bytes once')
  const outside = await get(image('https://' + fixtureHost + '/private.jpg'))
  assert.equal(outside.status, 400, 'Same host outside /static must be denied')
  assert.equal(mediaHits, 1, 'The forbidden URL must never reach upstream')

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

  // Headless Chrome can occasionally stall during startup on shared CI hosts.
  // Keep the real DOM assertion mandatory; only a proven watchdog timeout
  // gets one isolated retry, never a failed HTTP/image assertion.
  let browser = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const profile = mkdtempSync(join(tmpdir(), 'dogruadres-image175-chrome-'))
    try {
      browser = await new Promise((resolve, reject) => {
        const chrome = spawn('google-chrome', [
          '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
          '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
          '--user-data-dir=' + profile,
          '--virtual-time-budget=7000', '--dump-dom', base + '/images/image-175-ci-only',
        ], { stdio: ['ignore', 'pipe', 'pipe'] })
        let dom = ''
        let errors = ''
        let timedOut = false
        chrome.stdout.on('data', (chunk) => { dom += String(chunk) })
        chrome.stderr.on('data', (chunk) => { errors += String(chunk).slice(0, 3000) })
        const timeout = setTimeout(() => { timedOut = true; chrome.kill('SIGKILL') }, 35000)
        chrome.once('error', reject)
        chrome.once('close', (code) => {
          clearTimeout(timeout)
          if (timedOut) {
            const failure = Error('Real Chrome startup watchdog timed out: ' + errors.slice(-1500))
            failure.code = 'CHROME_TIMEOUT'
            return reject(failure)
          }
          if (code !== 0) return reject(Error('Real Chrome exit ' + code + ': ' + errors.slice(-1500)))
          resolve(dom)
        })
      })
      break
    } catch (error) {
      if (error.code !== 'CHROME_TIMEOUT' || attempt !== 0) throw error
      console.warn('Chrome startup watchdog: retrying once with a fresh isolated profile')
    } finally {
      rmSync(profile, { recursive: true, force: true })
    }
  }
  const imageTag = browser.match(/<img\b[^>]*data-testid="image175-remote"[^>]*>/i)?.[0] || ''
  assert.ok(imageTag, 'real Chrome did not render the SafeImage product fixture')
  assert.equal(new URL(imageTag.match(/\bsrc="([^"]+)"/i)?.[1] || '', base).pathname, '/images/placeholder.svg', 'Chrome did not hydrate the safe image fallback')
  assert.match(browser, /data-testid="image175-media-result"[^>]*>loaded<\/p>/, 'Real Chrome did not render allowed HTTPS media')
  console.log('PASS #175 real Chrome: forbidden image safely replaced, HTTPS media fixture loaded')

  console.log('PASS #175 real Next production HTTP: six forbidden 400, approved CI HTTPS media 200, native Medusa LocalFileService upload URL 200, off-path 400, JPEG 200, static SVG 200, optimized SVG 400')
} finally {
  if (mediaServer?.listening) await new Promise((resolve) => mediaServer.close(resolve))
  if (medusaRoot) rmSync(medusaRoot, { recursive: true, force: true })
  server.kill('SIGTERM')
  const timer = setTimeout(() => server.kill('SIGKILL'), 3000)
  timer.unref()
}
