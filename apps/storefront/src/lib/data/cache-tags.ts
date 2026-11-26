/**
 * Stable, catalog-wide cache tags. Unlike the per-visitor `getCacheOptions` in
 * `cookies.ts`, these are NOT suffixed with `_medusa_cache_id`, so the backend
 * can name and invalidate them from a webhook (see
 * `src/app/api/revalidate/route.ts`). Only use these for non-personalized
 * catalog data — never for cart/order/customer.
 *
 * This module is intentionally free of `server-only` / `next/headers` so it can
 * be imported by catalog data files that also end up in client bundles.
 */
export const CACHE_TAGS = {
  products: 'products',
  product: (handle: string) => `product-${handle}`,
  offers: 'offers',
  offer: (id: string) => `offer-${id}`,
  productOffers: (productId: string) => `product-offers-${productId}`,
  collections: 'collections',
  collection: (handle: string) => `collection-${handle}`,
  categories: 'categories',
  category: (handle: string) => `category-${handle}`,
} as const;

/**
 * Default fallback time-to-live (TTL) in seconds for catalog data.
 * Even if an on-demand cache invalidation webhook or event is missed,
 * cached catalog data will not remain stale indefinitely (#171).
 * Default is 900 seconds (15 minutes).
 */
export const DEFAULT_CATALOG_CACHE_TTL_SECONDS = 900;

/**
 * Parses and validates a catalog cache TTL value.
 * Falls back to DEFAULT_CATALOG_CACHE_TTL_SECONDS if invalid, non-positive, or NaN.
 */
export const parseCatalogCacheTtl = (
  rawTtl?: string | number | null
): number => {
  if (typeof rawTtl === 'number') {
    return Number.isFinite(rawTtl) && rawTtl > 0 ? Math.floor(rawTtl) : DEFAULT_CATALOG_CACHE_TTL_SECONDS;
  }
  if (typeof rawTtl === 'string') {
    const trimmed = rawTtl.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10);
      if (parsed > 0) {
        return parsed;
      }
    }
  }
  return DEFAULT_CATALOG_CACHE_TTL_SECONDS;
};

/**
 * Bounded catalog caching options (#171).
 * Caches fetch requests with on-demand tag revalidation AND a bounded fallback TTL.
 * This guarantees that even if a backend invalidation event is dropped or delayed,
 * stale prices, offers, and products will expire within the configured TTL.
 */
export const getGlobalCacheOptions = (
  base: string,
  scoped?: string,
  ttlSeconds: number = parseCatalogCacheTtl(process.env.CATALOG_CACHE_TTL_SECONDS)
): { revalidate: number; tags: string[] } => {
  const tags = scoped ? [base, scoped] : [base];
  return { revalidate: ttlSeconds, tags };
};
