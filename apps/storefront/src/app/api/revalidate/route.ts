import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { CACHE_TAGS } from '@/lib/data/cache-tags';

export const runtime = 'nodejs';

// #172: Bound work BEFORE calling revalidateTag. Existing Medusa/Mercur events
// emit a few tags per change; do not change the shared secret or event contract.
const MAX_BODY_BYTES = 32 * 1024;
const MAX_TAG_COUNT = 128;
const MAX_TAG_BYTES = 256;

const BASE_TAGS = new Set<string>([
  CACHE_TAGS.products,
  CACHE_TAGS.offers,
  CACHE_TAGS.collections,
  CACHE_TAGS.categories,
]);

// Keep the dynamic families aligned with the existing CACHE_TAGS helpers.
// No wildcard or unrelated (person, session, cart, order) invalidation.
const SCOPED_PREFIXES = [
  CACHE_TAGS.product(''),
  CACHE_TAGS.productOffers(''),
  CACHE_TAGS.offer(''),
  CACHE_TAGS.collection(''),
  CACHE_TAGS.category(''),
].sort((a, b) => b.length - a.length);

const SAFE_CATALOG_SUFFIX = /^[\p{L}\p{N}][\p{L}\p{N}._~-]*$/u;

const isAllowedCatalogTag = (tag: string): boolean => {
  if (BASE_TAGS.has(tag)) return true;
  const prefix = SCOPED_PREFIXES.find((candidate) => tag.startsWith(candidate));
  return !!prefix && SAFE_CATALOG_SUFFIX.test(tag.slice(prefix.length));
};

const reject = (status: number, error: string) =>
  NextResponse.json(
    { revalidated: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );

// Do not use request.json(): it buffers unbounded attacker-controlled bodies.
const readBoundedJson = async (request: NextRequest): Promise<unknown> => {
  const length = request.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BODY_BYTES) {
    throw new Error('too-large');
  }
  if (!request.body) throw new Error('invalid-json');

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let received = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('too-large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message === 'too-large') throw error;
    throw new Error('invalid-json');
  } finally {
    reader.releaseLock();
  }
};

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return reject(500, 'REVALIDATE_SECRET not configured');
  if (request.headers.get('x-revalidate-secret') !== secret) {
    return reject(401, 'Unauthorized');
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (error) {
    return error instanceof Error && error.message === 'too-large'
      ? reject(413, 'Request body too large')
      : reject(400, 'Invalid JSON body');
  }

  if (!payload || typeof payload !== 'object' || !('tags' in payload)
      || !Array.isArray(payload.tags) || payload.tags.length === 0) {
    return reject(400, 'No valid tags provided');
  }
  if (payload.tags.length > MAX_TAG_COUNT) {
    return reject(400, 'Too many tags');
  }

  // Fully validate before doing even one cache mutation. Dedupe a valid event
  // batch without rejecting otherwise legitimate repeated catalog tags.
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of payload.tags) {
    if (typeof value !== 'string'
        || Buffer.byteLength(value, 'utf8') > MAX_TAG_BYTES
        || !isAllowedCatalogTag(value)) {
      return reject(400, 'Invalid catalog tag');
    }
    if (!seen.has(value)) {
      seen.add(value);
      tags.push(value);
    }
  }

  for (const tag of tags) {
    revalidateTag(tag);
  }

  return NextResponse.json(
    { revalidated: true, tags },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
