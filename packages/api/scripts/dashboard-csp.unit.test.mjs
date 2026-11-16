import test from 'node:test'
import assert from 'node:assert/strict'
import { hasSafeDashboardCsp } from './dashboard-csp.mjs'

const tag = '<meta http-equiv="Content-Security-Policy" content="connect-src &#39;self&#39;">'
const page = (head) => `<!doctype html><html lang="en"><head>${head}<meta charset="UTF-8"><script src="/dashboard/assets/app.js"></script></head><body></body></html>`

test('Vite head-prepend exact self-only policy is accepted', () => {
  assert.equal(hasSafeDashboardCsp(page(`\n  ${tag}\n  `)), true)
  assert.equal(hasSafeDashboardCsp(page(tag.replace('>', ' />'))), true)
})

test('rejects missing, commented and non-head policy lookalikes', () => {
  for (const html of [page(''), page(`<!-- ${tag} -->`),
    `<html><head><meta charset="utf-8"></head><body>${tag}</body></html>`,
    `<html><head></head><body><!-- ${tag} --></body></html>`]) {
    assert.equal(hasSafeDashboardCsp(html), false)
  }
})

test('rejects policy after an already executed or loaded resource', () => {
  for (const prefix of ['<script src="https://outside.example/early.js"></script>',
    '<link rel="preload" href="https://outside.example/resource" as="fetch">',
    '<meta charset="UTF-8">']) {
    assert.equal(hasSafeDashboardCsp(page(prefix + tag)), false)
  }
  assert.equal(hasSafeDashboardCsp(`<script src="https://outside.example/early.js"></script>${page(tag)}`), false)
})

test('rejects permissive or malformed CSP policies', () => {
  const variants = [
    'connect-src &#39;self&#39; https://telemetry.mercurjs.com',
    'connect-src &#39;self&#39; *',
    'default-src &#39;self&#39;',
    'connect-src https://outside.example',
    'connect-src &#39;self&#39;; img-src *',
  ]
  for (const value of variants) {
    const malformed = tag.replace('connect-src &#39;self&#39;', value)
    assert.equal(hasSafeDashboardCsp(page(malformed)), false, value)
  }
  assert.equal(hasSafeDashboardCsp(page(tag.replace('http-equiv=', 'data-http-equiv='))), false)
  assert.equal(hasSafeDashboardCsp(page(tag.replace('content=', 'data-content='))), false)
})
