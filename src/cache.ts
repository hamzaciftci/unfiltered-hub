/**
 * UnfilteredHub — DNS Cache Layer
 * Uses Cloudflare Workers Cache API to cache DNS responses.
 * Reduces upstream requests and improves response times.
 */

const CACHE_PREFIX = 'https://dns-cache.unfilteredhub.com/';
const MIN_TTL = 60;    // Minimum cache: 60 seconds
const MAX_TTL = 3600;  // Maximum cache: 1 hour
const DEFAULT_TTL = 300; // Default if no TTL found: 5 minutes

/**
 * Build a deterministic cache key URL from domain, query type, and DNSSEC DO flag.
 * DO=1 and DO=0 get separate cache entries so the AD flag in cached responses
 * stays consistent with what the client requested.
 */
function cacheKey(domain: string, type: string, dnssecOk: boolean): string {
  return `${CACHE_PREFIX}${domain.toLowerCase()}/${type.toUpperCase()}?do=${dnssecOk ? 1 : 0}`;
}

/**
 * Try to get a cached DNS response.
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
 * Store a DNS response in cache.
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
    const ttl = extractTTL(responseBody);

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
function extractTTL(responseBody: string): number {
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

    if (!found) return DEFAULT_TTL;

    // Clamp between min and max
    return Math.max(MIN_TTL, Math.min(MAX_TTL, minTTL));
  } catch {
    return DEFAULT_TTL;
  }
}
