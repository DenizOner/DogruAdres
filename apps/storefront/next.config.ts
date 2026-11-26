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
  // Defense-in-depth: strict security headers on all routes, and private no-store
  // on one-time tokens, authentication screens, invitations, and user account pages.
  async headers() {
    const globalSecurityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    const sensitiveRouteHeaders = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ];
    return [
      { source: '/:path*', headers: globalSecurityHeaders },
      { source: '/reset-password', headers: sensitiveRouteHeaders },
      { source: '/:locale/reset-password', headers: sensitiveRouteHeaders },
      { source: '/login', headers: sensitiveRouteHeaders },
      { source: '/:locale/login', headers: sensitiveRouteHeaders },
      { source: '/register', headers: sensitiveRouteHeaders },
      { source: '/:locale/register', headers: sensitiveRouteHeaders },
      { source: '/forgot-password', headers: sensitiveRouteHeaders },
      { source: '/:locale/forgot-password', headers: sensitiveRouteHeaders },
      { source: '/auth/:path*', headers: sensitiveRouteHeaders },
      { source: '/:locale/auth/:path*', headers: sensitiveRouteHeaders },
      { source: '/verify-email', headers: sensitiveRouteHeaders },
      { source: '/:locale/verify-email', headers: sensitiveRouteHeaders },
      { source: '/invitations/:path*', headers: sensitiveRouteHeaders },
      { source: '/:locale/invitations/:path*', headers: sensitiveRouteHeaders },
      { source: '/account/:path*', headers: sensitiveRouteHeaders },
      { source: '/:locale/account/:path*', headers: sensitiveRouteHeaders },
      { source: '/user/:path*', headers: sensitiveRouteHeaders },
      { source: '/:locale/user/:path*', headers: sensitiveRouteHeaders },
    ];
  },
  async rewrites() {
    const backend = (process.env.MEDUSA_BACKEND_URL || 'http://127.0.0.1:9000').replace(/\/$/, '');
    return [
      { source: '/personal', destination: `${backend}/personal` },
      { source: '/personal/:path*', destination: `${backend}/personal/:path*` },
      { source: '/organization', destination: `${backend}/organization` },
      { source: '/organization/:path*', destination: `${backend}/organization/:path*` },
      { source: '/platform', destination: `${backend}/platform` },
      { source: '/platform/:path*', destination: `${backend}/platform/:path*` },
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
