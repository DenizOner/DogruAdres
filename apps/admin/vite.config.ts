import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

// createRequire (not a static import): the plugin's ESM build can't dynamic-require
// medusa-config.ts, so it silently falls back to base "/" and 404s panel assets.
const require = createRequire(import.meta.url)
const { mercurDashboardPlugin } = require('@mercurjs/dashboard-sdk/vite')

// A Mercur Feedback button attempts to POST message and location to an
// external host. Keep a native browser connect-src policy in BOTH Vite serve
// and build. Development panels require the explicitly configured API origin;
// shipped same-origin panels do not need any cross-origin exception.
const dashboardConnectPolicy = (command: 'serve' | 'build', backendUrl?: string) => {
  const sources = ["'self'"]
  if (command === 'serve') {
    const backend = new URL(backendUrl || 'http://localhost:9000')
    if (!['http:', 'https:'].includes(backend.protocol) ||
        backend.username || backend.password || backend.search ||
        backend.hash || backend.pathname !== '/') {
      throw new Error('Dashboard development backend must be an HTTP(S) origin')
    }
    sources.push(backend.origin)
  }
  return {
    name: 'dogruadres-dashboard-network-policy',
    transformIndexHtml() {
      // Vite performs the HTML escaping; never string-match a hostname to
      // decide whether potentially untrusted content may be transmitted.
      return [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy',
          content: 'connect-src ' + sources.join(' ') },
        injectTo: 'head-prepend' as const,
      }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Baked into the panel at build time. For a backend-served production build
  // (e.g. Medusa Cloud) set it to the deployed backend origin so API calls are
  // same-origin; it defaults to http://localhost:9000 for development.
  const backendUrl = env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL

  return {
    base: '/dashboard/',
    plugins: [
      react(),
      dashboardConnectPolicy(command, backendUrl),
      mercurDashboardPlugin({
        medusaConfigPath: '../../packages/api/medusa-config.ts',
        ...(backendUrl ? { backendUrl } : {}),
      }),
    ],
  }
})
