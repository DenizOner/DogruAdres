import { HttpTypes } from '@medusajs/types';
import { NextRequest, NextResponse } from 'next/server';

import { PROTECTED_ROUTES } from './lib/constants';
import { isTokenExpired } from './lib/helpers/token';

const BACKEND_URL = process.env.MEDUSA_BACKEND_URL;
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || 'us';

const makeAuthRedirect = (
  req: NextRequest,
  locale: string,
  reason: 'sessionRequired' | 'sessionExpired'
) => {
  const redirectUrl = new URL(`/${locale}/login`, req.url);

  redirectUrl.searchParams.set(reason, 'true');

  const response = NextResponse.redirect(redirectUrl);

  if (reason === 'sessionExpired') {
    response.cookies.delete('_medusa_jwt');
  }

  return response;
};

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now()
};

async function getRegionMap(cacheId: string) {
  const { regionMap, regionMapUpdated } = regionMapCache;

  if (!BACKEND_URL) {
    throw new Error(
      'Middleware.ts: Error fetching regions. Did you set up regions in your Medusa Admin and define a MEDUSA_BACKEND_URL environment variable? Note that the variable is no longer named NEXT_PUBLIC_MEDUSA_BACKEND_URL.'
    );
  }

  if (!regionMap.keys().next().value || regionMapUpdated < Date.now() - 3600 * 1000) {
    // We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
    const { regions } = await fetch(`${BACKEND_URL}/store/regions`, {
      headers: {
        'x-publishable-api-key': PUBLISHABLE_API_KEY!
      },
      next: {
        revalidate: 3600,
        tags: [`regions-${cacheId}`]
      },
      cache: 'force-cache'
    }).then(async response => {
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message);
      }

      return json;
    });

    if (!regions?.length) {
      throw new Error('No regions found. Please set up regions in your Medusa Admin.');
    }

    regions.forEach((region: HttpTypes.StoreRegion) => {
      region.countries?.forEach(c => {
        regionMapCache.regionMap.set(c.iso_2 ?? '', region);
      });
    });

    regionMapCache.regionMapUpdated = Date.now();
  }

  return regionMapCache.regionMap;
}

async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  try {
    let countryCode;

    const vercelCountryCode = request.headers.get('x-vercel-ip-country')?.toLowerCase();

    const urlCountryCode = request.nextUrl.pathname.split('/')[1]?.toLowerCase();

    if (urlCountryCode && regionMap.has(urlCountryCode)) {
      countryCode = urlCountryCode;
    } else if (vercelCountryCode && regionMap.has(vercelCountryCode)) {
      countryCode = vercelCountryCode;
    } else if (regionMap.has(DEFAULT_REGION)) {
      countryCode = DEFAULT_REGION;
    } else if (regionMap.keys().next().value) {
      countryCode = regionMap.keys().next().value;
    }

    return countryCode;
  } catch {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        'Middleware.ts: Error getting the country code. Did you set up regions in your Medusa Admin and define a MEDUSA_BACKEND_URL environment variable? Note that the variable is no longer named NEXT_PUBLIC_MEDUSA_BACKEND_URL.'
      );
    }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check protected pages BEFORE public URL exceptions: a dynamic order ID can
  // contain a dot or the words "verify-email" without becoming a public asset.
  // Resolve encoded country prefixes before splitting. A raw /%74r/
  // otherwise bypasses the /tr/ closed-demo guard and can reach SSR.
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname).replace(/\/{2,}/g, '/');
  } catch {
    return new NextResponse(null, {
      status: 400,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
    });
  }
  const urlSegment = decodedPath.split('/')[1];
  const looksLikeLocale = /^[a-z]{2}$/i.test(urlSegment || '');
  const pathnameWithoutLocale = looksLikeLocale ? decodedPath.replace(/^\/[^/]+/, '') : decodedPath;
  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathnameWithoutLocale.startsWith(route));

  if (isProtectedRoute) {
    const jwtCookie = request.cookies.get('_medusa_jwt');
    const token = jwtCookie?.value;
    const locale = looksLikeLocale ? urlSegment : DEFAULT_REGION;

    if (!jwtCookie) {
      return makeAuthRedirect(request, locale, 'sessionRequired');
    }

    if (token && isTokenExpired(token)) {
      return makeAuthRedirect(request, locale, 'sessionExpired');
    }
  }

  // #243 closed B4B: these are unapproved Mercur B2C demo pages, not the
  // accepted Organization-scoped /personal/catalog reader. Deny their SSR,
  // metadata and external links before region lookup or the dot-path bypass.
  // Preserve the independently accepted Seller rename 404/200 HTTP contract:
  // /sellers/[handle] is excluded, with native /store/sellers still closed.
  // This is deliberately all-session until an approved Buyer-specific page
  // exists; a Medusa JWT alone is not Buyer Organization authorization.
  const demoPath = pathnameWithoutLocale.toLowerCase();
  if (demoPath === '' || demoPath === '/' ||
      /^\/(?:products|categories|collections|cart|checkout|order)(?:\/|$)/.test(demoPath)) {
    // Default or URL-supplied country is not necessarily a configured region.
    // Reuse the existing public region bootstrap, not a new auth mechanism.
    let locale: string | undefined;
    try {
      const cacheId = request.cookies.get('_medusa_cache_id')?.value || crypto.randomUUID();
      const regionMap = await getRegionMap(cacheId);
      locale = looksLikeLocale && regionMap.has(urlSegment.toLowerCase())
        ? urlSegment.toLowerCase()
        : await getCountryCode(request, regionMap);
    } catch {
      // Region service failure never authorizes public B2C demo rendering.
    }
    if (!locale) return new NextResponse(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
    });
    const response = NextResponse.redirect(new URL('/' + locale + '/login', request.url), 307);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  if (pathname.includes('.')) {
    return NextResponse.next();
  }

  // Auth routes (like email verification) do not depend on store regions or publishable keys
  if (pathname.includes('/auth/verify-email') || pathname.includes('/verify-email')) {
    if (pathname === '/auth/verify-email' || pathname.startsWith('/auth/verify-email/')) {
      const locale = DEFAULT_REGION || 'tr';
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/${locale}${pathname}`;
      const response = NextResponse.rewrite(rewriteUrl);
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    const response = NextResponse.next();
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // A real public password-recovery route exists at both URL shapes.
  // Avoid rewriting Server Action POST requests while preserving no-referrer
  // and no-store on the one-time bearer landing page.
  if (pathname === '/reset-password' || /^\/[a-z]{2}\/reset-password$/i.test(pathname)) {
    const response = NextResponse.next();
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const cacheIdCookie = request.cookies.get('_medusa_cache_id');
  const cacheId = cacheIdCookie?.value || crypto.randomUUID();

  if (looksLikeLocale && cacheIdCookie) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  if (!cacheIdCookie) {
    response.cookies.set('_medusa_cache_id', cacheId, {
      maxAge: 60 * 60 * 24
    });
  }

  const regionMap = await getRegionMap(cacheId);
  const countryCode = regionMap && (await getCountryCode(request, regionMap));
  const urlHasCountryCode = countryCode && pathname.split('/')[1].includes(countryCode);

  if (!urlHasCountryCode && countryCode) {
    const redirectPath = pathname === '/' ? '' : pathname;
    const queryString = request.nextUrl.search ? request.nextUrl.search : '';
    const redirectUrl = `${request.nextUrl.origin}/${countryCode}${redirectPath}${queryString}`;
    return NextResponse.redirect(redirectUrl, 307);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)'
  ]
};
