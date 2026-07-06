/**
 * UnfilteredHub — DNS Cache Layer
 * Uses Cloudflare Workers Cache API to cache DNS responses.
 * Reduces upstream requests and improves response times.
 *
 * Two independent cache families:
 *   1. JSON responses (?name=&type=)          — key: json/{qname}/{qtype}?do=
 *   2. Wireformat responses (?dns= / POST)    — key: wire/{qname}/{qtype}/{qclass}?do=&cd=
 *
 * Wireformat notes:
 *   - Cached bytes keep the ORIGINAL requester's transaction ID, so every
 *     cache hit rewrites bytes 0-1 to the current request's ID (withRequestId).
 *   - Only NOERROR and NXDOMAIN responses are cached.
 *   - Negative answers (NXDOMAIN or zero answers) get a short TTL clamp.
 */

import {
  extractMinTtlFromWire,
  getAnswerCount,
  getRcode,
  withRequestId,
} from './dnsWire';

const CACHE_PREFIX = 'https://dns-cache.unfilteredhub.com/';
const MIN_TTL = 60;      // Minimum cache: 60 seconds
const MAX_TTL = 3600;    // Maximum cache: 1 hour
const DEFAULT_TTL = 300; // Default if no TTL found: 5 minutes

/** Negative answers (NXDOMAIN / NODATA) are cached briefly */
const NEG_MIN_TTL = 30;
const NEG_MAX_TTL = 300;

/* ── JSON cache ────────────────────────────────────────── */

/**
 * Build a deterministic cache key URL from domain, query type, and DNSSEC DO flag.
 * DO=1 and DO=0 get separate cache entries so the AD flag in cached responses
 * stays consistent with what the client requested.
 */
function cacheKey(domain: string, type: string, dnssecOk: boolean): string {
  return `${CACHE_PREFIX}json/${domain.toLowerCase()}/${type.toUpperCase()}?do=${dnssecOk ? 1 : 0}`;
}

/**
 * Try to get a cached DNS JSON response.
 * Returns the cached Response or null if not found.
 */
export async function getCachedResponse(
  domain: string,
  type: string,
  dnssecOk: boolean = false,
): Promise<Response | null> {
  try {
    const cache = caches.default;
    const key = cacheKey(domain, type, dnssecOk);
    const cached = await cache.match(key);
    if (cached) {
      // Clone and add cache-hit header
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, {
        status: cached.status,
        headers,
      });
    }
  } catch {
    // Cache API unavailable (e.g., in local dev), skip silently
  }
  return null;
}

/**
 * Store a DNS JSON response in cache.
 * Extracts TTL from the JSON DNS response to set cache duration.
 * Must be called with a cloned response body.
 */
export async function cacheResponse(
  domain: string,
  type: string,
  response: Response,
  responseBody: string,
  dnssecOk: boolean = false,
): Promise<void> {
  try {
    const cache = caches.default;
    const key = cacheKey(domain, type, dnssecOk);

    // Extract TTL from DNS JSON response
    const ttl = extractJsonTTL(responseBody);

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `s-maxage=${ttl}`);
    headers.set('X-Cache', 'MISS');
    headers.set('X-Cache-TTL', ttl.toString());

    const cacheableResponse = new Response(responseBody, {
      status: response.status,
      headers,
    });

    await cache.put(key, cacheableResponse);
  } catch {
    // Cache write failure is non-critical, skip silently
  }
}

/**
 * Extract the minimum TTL from a DNS JSON response.
 * Looks at Answer, Authority, and Additional sections.
 */
function extractJsonTTL(responseBody: string): number {
  try {
    const data = JSON.parse(responseBody);
    let minTTL = MAX_TTL;
    let found = false;

    for (const section of ['Answer', 'Authority', 'Additional']) {
      const records = data[section];
      if (Array.isArray(records)) {
        for (const record of records) {
          if (typeof record.TTL === 'number') {
            minTTL = Math.min(minTTL, record.TTL);
            found = true;
          }
        }
      }
    }

    // Negative answers (NXDOMAIN or empty) → short TTL
    const isNegative = data.Status === 3
      || !Array.isArray(data.Answer)
      || data.Answer.length === 0;
    if (isNegative) {
      const base = found ? minTTL : NEG_MAX_TTL;
      return Math.max(NEG_MIN_TTL, Math.min(NEG_MAX_TTL, base));
    }

    if (!found) return DEFAULT_TTL;

    // Clamp between min and max
    return Math.max(MIN_TTL, Math.min(MAX_TTL, minTTL));
  } catch {
    return DEFAULT_TTL;
  }
}

/* ── Wireformat cache ──────────────────────────────────── */

export interface WireCacheKeyParts {
  qname: string;
  qtype: number;
  qclass: number;
  /** EDNS DO flag — separates DNSSEC-aware entries */
  dnssecOk: boolean;
  /** CD (checking disabled) header flag */
  cdFlag: boolean;
}

function wireCacheKey(p: WireCacheKeyParts): string {
  return `${CACHE_PREFIX}wire/${p.qname.toLowerCase()}/${p.qtype}/${p.qclass}`
    + `?do=${p.dnssecOk ? 1 : 0}&cd=${p.cdFlag ? 1 : 0}`;
}

/**
 * Try to get a cached wireformat DNS response.
 * On hit, the response bytes are stamped with the CURRENT request's
 * transaction ID before returning (RFC 1035: the ID must echo the query).
 */
export async function getCachedWireResponse(
  parts: WireCacheKeyParts,
  requestBuffer: ArrayBuffer,
): Promise<Response | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(wireCacheKey(parts));
    if (!cached) return null;

    const bytes = new Uint8Array(await cached.arrayBuffer());
    if (bytes.length < 12) return null;

    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');

    return new Response(withRequestId(bytes, requestBuffer), {
      status: cached.status,
      headers,
    });
  } catch {
    return null;
  }
}

/**
 * Store a wireformat DNS response in cache.
 * Caches only NOERROR (0) and NXDOMAIN (3) responses.
 * TTL comes from the minimum record TTL in the response, clamped to
 * [MIN_TTL, MAX_TTL] for positive and [NEG_MIN_TTL, NEG_MAX_TTL] for
 * negative answers.
 */
export async function cacheWireResponse(
  parts: WireCacheKeyParts,
  responseBuffer: ArrayBuffer,
): Promise<void> {
  try {
    const rcode = getRcode(responseBuffer);
    if (rcode !== 0 && rcode !== 3) return;

    const extracted = extractMinTtlFromWire(responseBuffer);
    const isNegative = rcode === 3 || getAnswerCount(responseBuffer) === 0;

    let ttl: number;
    if (isNegative) {
      ttl = Math.max(NEG_MIN_TTL, Math.min(NEG_MAX_TTL, extracted ?? NEG_MAX_TTL));
    } else {
      ttl = Math.max(MIN_TTL, Math.min(MAX_TTL, extracted ?? DEFAULT_TTL));
    }

    const cacheable = new Response(responseBuffer, {
      headers: {
        'Content-Type': 'application/dns-message',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `s-maxage=${ttl}`,
        'X-Cache': 'MISS',
        'X-Cache-TTL': ttl.toString(),
      },
    });

    await caches.default.put(wireCacheKey(parts), cacheable);
  } catch {
    // Cache write failure is non-critical, skip silently
  }
}
