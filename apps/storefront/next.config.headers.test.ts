import { describe, expect, test } from 'bun:test';
import nextConfig from './next.config';

describe('Storefront security headers configuration', () => {
  test('defines security headers for all routes and sensitive paths', async () => {
    expect(nextConfig.headers).toBeDefined();
    const headersList = await nextConfig.headers!();
    expect(Array.isArray(headersList)).toBe(true);

    // Global headers check
    const globalRule = headersList.find(h => h.source === '/:path*');
    expect(globalRule).toBeDefined();
    expect(globalRule?.headers.some(h => h.key === 'X-Content-Type-Options' && h.value === 'nosniff')).toBe(true);
    expect(globalRule?.headers.some(h => h.key === 'X-Frame-Options' && h.value === 'SAMEORIGIN')).toBe(true);
    expect(globalRule?.headers.some(h => h.key === 'Referrer-Policy' && h.value === 'strict-origin-when-cross-origin')).toBe(true);

    // Sensitive auth and reset-password routes
    const sensitiveSources = [
      '/reset-password',
      '/:locale/reset-password',
      '/login',
      '/:locale/login',
      '/register',
      '/:locale/register',
      '/forgot-password',
      '/:locale/forgot-password',
      '/auth/:path*',
      '/:locale/auth/:path*',
      '/verify-email',
      '/:locale/verify-email',
      '/invitations/:path*',
      '/:locale/invitations/:path*',
      '/account/:path*',
      '/:locale/account/:path*',
      '/user/:path*',
      '/:locale/user/:path*',
    ];

    for (const source of sensitiveSources) {
      const rule = headersList.find(h => h.source === source);
      expect(rule).toBeDefined();
      expect(rule?.headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-store'))).toBe(true);
      expect(rule?.headers.some(h => h.key === 'Referrer-Policy' && h.value === 'no-referrer')).toBe(true);
      expect(rule?.headers.some(h => h.key === 'X-Robots-Tag' && h.value.includes('noindex'))).toBe(true);
    }
  });
});
