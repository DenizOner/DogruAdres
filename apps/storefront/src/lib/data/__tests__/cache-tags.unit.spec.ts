import { describe, expect, it } from 'bun:test';
import {
  CACHE_TAGS,
  DEFAULT_CATALOG_CACHE_TTL_SECONDS,
  getGlobalCacheOptions,
  parseCatalogCacheTtl,
} from '../cache-tags';

describe('cache-tags data helper (#171)', () => {
  describe('CACHE_TAGS definitions', () => {
    it('generates consistent static and dynamic catalog tags', () => {
      expect(CACHE_TAGS.products).toBe('products');
      expect(CACHE_TAGS.product('test-handle')).toBe('product-test-handle');
      expect(CACHE_TAGS.offers).toBe('offers');
      expect(CACHE_TAGS.offer('off_123')).toBe('offer-off_123');
      expect(CACHE_TAGS.productOffers('prod_456')).toBe('product-offers-prod_456');
      expect(CACHE_TAGS.collections).toBe('collections');
      expect(CACHE_TAGS.collection('col-handle')).toBe('collection-col-handle');
      expect(CACHE_TAGS.categories).toBe('categories');
      expect(CACHE_TAGS.category('cat-handle')).toBe('category-cat-handle');
    });
  });

  describe('parseCatalogCacheTtl helper', () => {
    it('returns DEFAULT_CATALOG_CACHE_TTL_SECONDS (900) when raw value is undefined or null', () => {
      expect(DEFAULT_CATALOG_CACHE_TTL_SECONDS).toBe(900);
      expect(parseCatalogCacheTtl(undefined)).toBe(900);
      expect(parseCatalogCacheTtl(null)).toBe(900);
    });

    it('parses valid numeric string values', () => {
      expect(parseCatalogCacheTtl('60')).toBe(60);
      expect(parseCatalogCacheTtl(' 1800 ')).toBe(1800);
      expect(parseCatalogCacheTtl('3600')).toBe(3600);
    });

    it('accepts valid finite positive numbers', () => {
      expect(parseCatalogCacheTtl(300)).toBe(300);
      expect(parseCatalogCacheTtl(120.7)).toBe(120);
    });

    it('falls back to default for 0, negative numbers, or invalid strings', () => {
      expect(parseCatalogCacheTtl('0')).toBe(900);
      expect(parseCatalogCacheTtl('-300')).toBe(900);
      expect(parseCatalogCacheTtl(0)).toBe(900);
      expect(parseCatalogCacheTtl(-100)).toBe(900);
      expect(parseCatalogCacheTtl(NaN)).toBe(900);
      expect(parseCatalogCacheTtl(Infinity)).toBe(900);
      expect(parseCatalogCacheTtl('abc')).toBe(900);
      expect(parseCatalogCacheTtl('123abc')).toBe(900);
      expect(parseCatalogCacheTtl('')).toBe(900);
    });
  });

  describe('getGlobalCacheOptions', () => {
    it('returns bounded revalidate TTL and base tag when no scoped tag is provided', () => {
      const options = getGlobalCacheOptions(CACHE_TAGS.products);
      expect(options).toEqual({
        revalidate: 900,
        tags: ['products'],
      });
      expect(typeof options.revalidate).toBe('number');
      expect(options.revalidate).toBeGreaterThan(0);
    });

    it('includes both base and scoped tags when scoped tag is provided', () => {
      const options = getGlobalCacheOptions(
        CACHE_TAGS.products,
        CACHE_TAGS.product('apple-iphone')
      );
      expect(options).toEqual({
        revalidate: 900,
        tags: ['products', 'product-apple-iphone'],
      });
    });

    it('respects explicitly passed ttlSeconds', () => {
      const options = getGlobalCacheOptions(
        CACHE_TAGS.offers,
        CACHE_TAGS.offer('off_999'),
        300
      );
      expect(options).toEqual({
        revalidate: 300,
        tags: ['offers', 'offer-off_999'],
      });
    });

    it('does not return revalidate: false (#171: prevents indefinite stale cache)', () => {
      const options = getGlobalCacheOptions(CACHE_TAGS.categories);
      expect(options.revalidate).not.toBe(false as unknown as number);
      expect(options.revalidate).toBe(DEFAULT_CATALOG_CACHE_TTL_SECONDS);
    });
  });
});
