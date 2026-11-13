import type { NextConfig } from 'next'
import { isIP } from 'node:net'

// #175: Only operator configuration, never product-provided URLs, can add hosts.
type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number]

export function createImageRemotePatterns(env: Record<string, string | undefined>): RemotePattern[] {
  const production = env.NODE_ENV === 'production'
  const patterns: RemotePattern[] = []
  // In production, an API URL is not permission for the image proxy to fetch from that host.
  // Enable remote optimization only with an explicitly approved HTTPS media origin.
  // Redirect-free /static delivery and safe DNS/IP are separate deployment acceptance gates.
  const configured = (env.DOGRUADRES_STOREFRONT_MEDIA_BASE_URL
    || (!production ? env.MEDUSA_BACKEND_URL : undefined) || '').trim()

  if (configured) {
    const origin = new URL(configured)
    const hostname = origin.hostname.toLowerCase()
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    const publicDns = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(hostname)
      && !isIP(hostname)
      && !['.local', '.localhost', '.internal', '.test', '.invalid', '.example'].some((suffix) => hostname.endsWith(suffix))
    const safeHttps = origin.protocol === 'https:' && publicDns && origin.port === ''
    const localDevelopment = !production && origin.protocol === 'http:' && loopback
    const filePath = ['', '/', '/static', '/static/'].includes(origin.pathname)
    if ((!safeHttps && !localDevelopment) || origin.username || origin.password
      || origin.search || origin.hash || !filePath) {
      throw new Error('REFUSED: Storefront media origin must be an exact approved HTTPS host and /static path (loopback only in development)')
    }
    patterns.push({
      protocol: safeHttps ? 'https' : 'http',
      hostname,
      port: origin.port || '',
      pathname: '/static/**',
      search: '',
    })
  }

  // Demo-only images never become production optimizer targets.
  if (!production) {
    patterns.push(
      { protocol: 'https', hostname: 'cdn.jsdelivr.net', port: '', pathname: '/gh/mercurjs/mercur@main/static/**', search: '' },
      { protocol: 'https', hostname: 'api.dicebear.com', port: '', pathname: '/9.x/initials/svg' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/seed/**', search: '' },
    )
  }
  return patterns
}


const nextConfig: NextConfig = {
  output: "standalone",
  trailingSlash: false,
  reactStrictMode: true,
  // Reset links carry one-time bearer tokens: do not leak URLs through referrers
  // or cache full-token pages. Does not alter other Storefront routes.
  async headers() {
    const securityHeaders = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ];
    return [
      { source: '/reset-password', headers: securityHeaders },
      { source: '/:locale/reset-password', headers: securityHeaders },
    ];
  },
  logging: {
    fetches: {
      fullUrl: true
    }
  },
  images: {
    // SVG optimization is not required; public/ SVGs still load directly.
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: createImageRemotePatterns(process.env),
  }
};

export default nextConfig;
