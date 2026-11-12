import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImageRemotePatterns } from './next.config'

test('#175 production has no arbitrary or demo image host', () => {
  const patterns = createImageRemotePatterns({ NODE_ENV: 'production' })
  assert.deepEqual(patterns, [])
})
test('#175 production never implicitly trusts API URL as a remote media host', () => {
  assert.deepEqual(createImageRemotePatterns({
    NODE_ENV: 'production', MEDUSA_BACKEND_URL: 'https://api.dogruadres.example.org',
  }), [])
})
test('#175 explicit authorized Medusa HTTPS media origin is /static scoped', () => {
  assert.deepEqual(createImageRemotePatterns({
    NODE_ENV: 'production', DOGRUADRES_STOREFRONT_MEDIA_BASE_URL: 'https://api.dogruadres.example.org',
  }), [{
    protocol: 'https', hostname: 'api.dogruadres.example.org',
    port: '', pathname: '/static/**', search: '',
  }])
  assert.deepEqual(createImageRemotePatterns({
    NODE_ENV: 'production',
    MEDUSA_BACKEND_URL: 'https://api.dogruadres.example.org',
    DOGRUADRES_STOREFRONT_MEDIA_BASE_URL: 'https://media.dogruadres.example.org/static/',
  }), [{
    protocol: 'https', hostname: 'media.dogruadres.example.org',
    port: '', pathname: '/static/**', search: '',
  }])
})
test('#175 rejects loopback, private, wildcard, credentials and path escalation in production', () => {
  for (const url of [
    'http://localhost:9000', 'http://127.0.0.1:9000/static',
    'https://127.0.0.1/static', 'https://169.254.169.254/static',
    'https://192.168.1.4/static', 'https://*.example.org/static',
    'https://internal.local/static', 'https://user:password@media.example.org/static',
    'https://media.example.org:8443/static', 'https://media.example.org/admin',
    'https://media.example.org/static?q=1',
  ]) {
    assert.throws(() => createImageRemotePatterns({
      NODE_ENV: 'production', MEDUSA_BACKEND_URL: url,
    }), /REFUSED/, url)
  }
})
test('#175 demo CDN and loopback are development-only', () => {
  const patterns = createImageRemotePatterns({
    NODE_ENV: 'development', MEDUSA_BACKEND_URL: 'http://localhost:9000',
  })
  assert.equal(patterns.length, 4)
  assert.deepEqual(patterns[0], {
    protocol: 'http', hostname: 'localhost', port: '9000',
    pathname: '/static/**', search: '',
  })
  for (const host of ['cdn.jsdelivr.net', 'api.dicebear.com', 'picsum.photos']) {
    assert.equal(patterns.some((p) => 'hostname' in p && p.hostname === host), true)
  }
  assert.deepEqual(createImageRemotePatterns({ NODE_ENV: 'production' }), [])
})
