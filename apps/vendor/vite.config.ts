import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

// createRequire (not a static import): the plugin's ESM build can't dynamic-require
// medusa-config.ts, so it silently falls back to base "/" and 404s panel assets.
const require = createRequire(import.meta.url)
const { mercurDashboardPlugin } = require('@mercurjs/dashboard-sdk/vite')

// The upstream Mercur Feedback control sends text/path to an external host.
// Restrict browser network requests in the production panel without changing
// Mercur's source or blocking the configured first-party backend.
const dashboardConnectPolicy = (backendUrl?: string) => {
  const allowed = ["'self'"]
  if (backendUrl) {
    const backend = new URL(backendUrl)
    if (!['http:', 'https:'].includes(backend.protocol)) {
      throw new Error('Panel backend URL must be HTTP(S)')
    }
    allowed.push(backend.origin)
    allowed.push((backend.protocol === 'https:' ? 'wss://' : 'ws://') + backend.host)
  }
  return {
    name: 'dogruadres-dashboard-network-policy',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      if (!html.includes('<head>')) throw new Error('Dashboard HTML head missing')
      return html.replace('<head>', '<head>\n    <meta http-equiv="Content-Security-Policy" content="connect-src ' + allowed.join(' ') + '" />')
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Baked into the panel at build time. For a backend-served production build
  // (e.g. Medusa Cloud) set it to the deployed backend origin so API calls are
  // same-origin; it defaults to http://localhost:9000 for development.
  const backendUrl = env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL

  return {
    plugins: [
      react(),
      dashboardConnectPolicy(backendUrl),
      mercurDashboardPlugin({
        medusaConfigPath: '../../packages/api/medusa-config.ts',
        ...(backendUrl ? { backendUrl } : {}),
      }),
    ],
  }
})
