/**
 * UnfilteredHub — Adaptive Multi-Upstream DNS Resolver
 *
 * Smart resolver selection with in-memory scoring:
 *   - Tracks per-resolver latency (exponential moving average)
 *   - Tracks success/failure ratios
 *   - Sorts by computed score before each query
 *   - Resets stats every 10 minutes to adapt to changing conditions
 *   - Exposes scores via getScoreHeader() for X-Resolver-Score
 *
 * Scoring formula:
 *   score = (avgLatency * 0.7) + (failureRatio * 300)
 *
 * Lower score = better resolver = tried first.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface DnsUpstream {
  name: string;
  url: string;
  /** Static priority: lower = preferred. Used as tiebreaker. */
  priority: number;
}

interface ResolverStats {
  successCount: number;
  failureCount: number;
  /** Exponential moving average of latency in ms */
  avgLatency: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  /** Unix-ms when this stats window started */
  windowStart: number;
}

interface ResolveResult {
  response: Response;
  resolver: string;
  /** Formatted score header value */
  scoreHeader: string;
}

/* ── Constants ─────────────────────────────────────────── */

/** Built-in upstream DNS providers */
export const UPSTREAMS: DnsUpstream[] = [
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query', priority: 1 },
  { name: 'Google', url: 'https://dns.google/dns-query', priority: 2 },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query', priority: 3 },
];

const UPSTREAM_TIMEOUT = 3000;
const EMA_ALPHA = 0.3;          // Weight for new latency samples
const FAILURE_PENALTY_MS = 500; // Latency penalty added on failure
const STATS_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_LATENCY = 50;     // Initial assumed latency

/* ── In-memory scoring state (module-level singleton) ── */

const statsMap = new Map<string, ResolverStats>();

/** Test helper — clear adaptive scoring state. */
export function resetResolverStats(): void {
  statsMap.clear();
}

function getStats(name: string): ResolverStats {
  let s = statsMap.get(name);
  const now = Date.now();

  // Create fresh stats if absent or window expired
  if (!s || now - s.windowStart > STATS_WINDOW_MS) {
    s = {
      successCount: 0,
      failureCount: 0,
      avgLatency: DEFAULT_LATENCY,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      windowStart: now,
    };
    statsMap.set(name, s);
  }

  return s;
}

function recordSuccess(name: string, latencyMs: number): void {
  const s = getStats(name);
  s.successCount++;
  s.lastSuccessTime = Date.now();
  // Exponential moving average
  s.avgLatency = s.avgLatency * (1 - EMA_ALPHA) + latencyMs * EMA_ALPHA;
}

function recordFailure(name: string): void {
  const s = getStats(name);
  s.failureCount++;
  s.lastFailureTime = Date.now();
  // Penalty: inflate avg latency as if a very slow response
  s.avgLatency = s.avgLatency * (1 - EMA_ALPHA) + (s.avgLatency + FAILURE_PENALTY_MS) * EMA_ALPHA;
}

/**
 * Compute score for a resolver. Lower = better.
 *   score = (avgLatency * 0.7) + (failureRatio * 300)
 */
function computeScore(name: string): number {
  const s = getStats(name);
  const total = s.successCount + s.failureCount;
  const failureRatio = total > 0 ? s.failureCount / total : 0;
  return s.avgLatency * 0.7 + failureRatio * 300;
}

/**
 * Sort upstreams by adaptive score (lowest first).
 * Static priority is used as tiebreaker for identical scores.
 */
function ranked(upstreams: DnsUpstream[]): DnsUpstream[] {
  return [...upstreams].sort((a, b) => {
    const diff = computeScore(a.name) - computeScore(b.name);
    return diff !== 0 ? diff : a.priority - b.priority;
  });
}

/**
 * Return the average latency (EMA) of the best-scoring resolver in ms.
 * Used by the impact widget. Returns DEFAULT_LATENCY if no data yet.
 */
export function getBestLatency(upstreams: DnsUpstream[]): number {
  const sorted = ranked(upstreams);
  const best = sorted[0];
  if (!best) return DEFAULT_LATENCY;
  const s = getStats(best.name);
  return Math.round(s.avgLatency);
}

/**
 * Build X-Resolver-Score header value.
 * Format: "cloudflare=12,google=20,quad9=45"
 */
export function getScoreHeader(upstreams: DnsUpstream[]): string {
  return upstreams
    .map(u => `${u.name.toLowerCase()}=${Math.round(computeScore(u.name))}`)
    .join(',');
}

/* ── Core fetch with timing ────────────────────────────── */

async function timedFetch(
  input: RequestInfo,
  init: RequestInit,
): Promise<{ response: Response; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  const start = Date.now();

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return { response, latencyMs: Date.now() - start };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/* ── Public resolve functions ──────────────────────────── */

/**
 * Resolve a DNS JSON query with adaptive failover.
 */
export async function resolveJson(
  name: string,
  type: string,
  upstreams: DnsUpstream[] = UPSTREAMS,
  dnssecOk: boolean = false,
): Promise<{ body: string; response: Response; resolver: string; scoreHeader: string }> {
  const sorted = ranked(upstreams);

  for (const upstream of sorted) {
    try {
      const url = new URL(upstream.url);
      url.searchParams.set('name', name);
      url.searchParams.set('type', type);
      if (dnssecOk) url.searchParams.set('do', '1');

      const { response: res, latencyMs } = await timedFetch(url.toString(), {
        headers: { 'Accept': 'application/dns-json' },
      });

      if (res.ok) {
        const body = await res.text();
        recordSuccess(upstream.name, latencyMs);
        return {
          body,
          response: res,
          resolver: upstream.name,
          scoreHeader: getScoreHeader(upstreams),
        };
      }

      // Non-ok HTTP status counts as failure
      recordFailure(upstream.name);
    } catch {
      recordFailure(upstream.name);
    }
  }

  throw new Error('All upstream DNS resolvers failed');
}

/**
 * Resolve a wireformat DNS query (GET with base64url) with adaptive failover.
 */
export async function resolveWireGet(
  dnsParam: string,
  upstreams: DnsUpstream[] = UPSTREAMS,
): Promise<ResolveResult> {
  const sorted = ranked(upstreams);

  for (const upstream of sorted) {
    try {
      const { response: res, latencyMs } = await timedFetch(
        `${upstream.url}?dns=${dnsParam}`,
        { headers: { 'Accept': 'application/dns-message' } },
      );

      if (res.ok) {
        recordSuccess(upstream.name, latencyMs);
        return {
          response: res,
          resolver: upstream.name,
          scoreHeader: getScoreHeader(upstreams),
        };
      }

      recordFailure(upstream.name);
    } catch {
      recordFailure(upstream.name);
    }
  }

  throw new Error('All upstream DNS resolvers failed');
}

/**
 * Resolve a wireformat DNS query (POST with binary body) with adaptive failover.
 */
export async function resolveWirePost(
  body: ArrayBuffer,
  upstreams: DnsUpstream[] = UPSTREAMS,
): Promise<ResolveResult> {
  const sorted = ranked(upstreams);

  for (const upstream of sorted) {
    try {
      const { response: res, latencyMs } = await timedFetch(upstream.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/dns-message',
          'Accept': 'application/dns-message',
        },
        body,
      });

      if (res.ok) {
        recordSuccess(upstream.name, latencyMs);
        return {
          response: res,
          resolver: upstream.name,
          scoreHeader: getScoreHeader(upstreams),
        };
      }

      recordFailure(upstream.name);
    } catch {
      recordFailure(upstream.name);
    }
  }

  throw new Error('All upstream DNS resolvers failed');
}

/**
 * Parse the UPSTREAM env var to determine resolver order.
 * Accepts: "cloudflare", "google", "quad9" or comma-separated "google,cloudflare"
 * Returns reordered upstreams based on user preference.
 */
export function getUpstreams(envUpstream?: string): DnsUpstream[] {
  if (!envUpstream) return UPSTREAMS;

  const names = envUpstream.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (names.length === 0) return UPSTREAMS;

  const result: DnsUpstream[] = [];
  let priority = 1;

  for (const name of names) {
    const found = UPSTREAMS.find(u => u.name.toLowerCase() === name);
    if (found) {
      result.push({ ...found, priority: priority++ });
    }
  }

  for (const upstream of UPSTREAMS) {
    if (!result.find(r => r.name === upstream.name)) {
      result.push({ ...upstream, priority: priority++ });
    }
  }

  return result;
}
