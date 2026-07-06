/**
 * UnfilteredHub — Abuse Protection (in-memory, zero KV cost)
 * Protects the public /dns-query endpoint from DNS abuse, amplification,
 * DGA-based C2, and volumetric flooding.
 *
 * Layers:
 *   1. Dangerous query type blocking (ANY, CHAOS, oversized TXT)
 *   2. DGA detection heuristic (high entropy / vowel-less long domains)
 *   3. Per-IP rate limiting (200 queries/min, in-memory token window)
 *   4. Suspicious query escalation (3 suspicious in 1 min → 5 min IP block)
 *
 * ── Why NO KV here ──────────────────────────────────────────
 * The previous design wrote to KV on EVERY query. Cloudflare's free tier
 * allows only 1,000 KV writes/day — a single phone exhausts that in hours,
 * silently disabling protection. KV is also eventually consistent (~60s),
 * which makes sub-minute rate windows meaningless anyway.
 *
 * Instead, counters live in per-isolate memory:
 *   - Exact and race-free within an isolate; zero latency, zero KV ops.
 *   - A given client IP is routed to the same Cloudflare PoP, so in
 *     practice one isolate sees (nearly) all of that client's traffic.
 *   - Worst case, an attacker spread across N isolates gets N× the limit —
 *     still bounded per isolate, and each isolate independently blocks.
 *   - Memory is capped (LRU eviction at MAX_TRACKED_IPS entries).
 *
 * Returns DNS REFUSED (RCODE=5) for abuse, 429 for rate limits.
 * Adds X-Abuse-Flag header: "clean" | "suspicious" | "rate_limited"
 */

import { parseQueryMeta } from './dnsWire';

/* ── Types ─────────────────────────────────────────────── */

export type AbuseFlag = 'clean' | 'suspicious' | 'rate_limited';

export interface AbuseCheckResult {
  /** true = request may proceed to resolver */
  allowed: boolean;
  /** Abuse classification for X-Abuse-Flag header */
  flag: AbuseFlag;
  /** If blocked, the ready-to-return Response */
  response?: Response;
}

/** In-memory per-IP counters for the current window */
interface IpBucket {
  /** Total queries in the current 60-second window */
  queryCount: number;
  /** Suspicious queries in the current 60-second window */
  suspiciousCount: number;
  /** Unix-ms: IP is hard-blocked until this time */
  blockUntil: number;
  /** Unix-ms: when this window started */
  windowStart: number;
}

/* ── Constants ─────────────────────────────────────────── */

/** DNS QTYPE values */
const QTYPE_TXT = 16;
const QTYPE_ANY = 255;

/** DNS QCLASS values */
const QCLASS_CH = 3; // CHAOS

const MAX_QUERIES_PER_MIN = 200;
const MAX_SUSPICIOUS_PER_MIN = 3;
const WINDOW_MS = 60 * 1000;
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 min

/** Memory bound: max distinct IPs tracked per isolate (LRU eviction) */
const MAX_TRACKED_IPS = 10_000;

/** DGA detection thresholds */
const DGA_MIN_LENGTH = 25;
const DGA_ENTROPY_THRESHOLD = 3.5;

/* ── In-memory bucket store (module-level singleton) ───── */

const buckets = new Map<string, IpBucket>();

/** Test/ops helper — clears all in-memory abuse state. */
export function resetAbuseState(): void {
  buckets.clear();
}

/** Number of IPs currently tracked (for /transparency observability). */
export function getTrackedIpCount(): number {
  return buckets.size;
}

function getBucket(ip: string): IpBucket {
  const t = Date.now();
  let b = buckets.get(ip);

  if (b && t - b.windowStart > WINDOW_MS && b.blockUntil <= t) {
    // Window expired and not blocked → fresh window
    b.queryCount = 0;
    b.suspiciousCount = 0;
    b.blockUntil = 0;
    b.windowStart = t;
  }

  if (!b) {
    b = { queryCount: 0, suspiciousCount: 0, blockUntil: 0, windowStart: t };
    // LRU-ish eviction: Map preserves insertion order — drop the oldest entry
    if (buckets.size >= MAX_TRACKED_IPS) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(ip, b);
  }

  return b;
}

/* ── DNS REFUSED response builders ─────────────────────── */

/**
 * Build a DNS REFUSED response in JSON format.
 * RCODE=5 (REFUSED) — server refuses to perform the query.
 */
function buildRefusedJsonResponse(flag: AbuseFlag): Response {
  return new Response(
    JSON.stringify({
      Status: 5, // REFUSED
      TC: false,
      RD: true,
      RA: true,
      AD: false,
      CD: false,
      Question: [],
      Answer: [],
      Comment: 'Refused by UnfilteredHub abuse protection',
    }),
    {
      headers: {
        'Content-Type': 'application/dns-json',
        'Access-Control-Allow-Origin': '*',
        'X-Abuse-Flag': flag,
      },
    },
  );
}

/**
 * Build a DNS REFUSED response in wireformat.
 * Copies query ID + question, sets RCODE=5.
 */
function buildRefusedWireResponse(queryBuffer: ArrayBuffer, flag: AbuseFlag): Response {
  const query = new Uint8Array(queryBuffer);

  if (query.length < 12) {
    return new Response('Invalid DNS query', {
      status: 400,
      headers: { 'X-Abuse-Flag': flag },
    });
  }

  const response = new Uint8Array(query.length);
  response.set(query);

  // Byte 2: QR=1, RD=1 → 0x81
  response[2] = 0x81;
  // Byte 3: RA=1, RCODE=5 (REFUSED) → 0x85
  response[3] = 0x85;
  // ANCOUNT = 0
  response[6] = 0;
  response[7] = 0;
  // NSCOUNT = 0
  response[8] = 0;
  response[9] = 0;
  // ARCOUNT = 0
  response[10] = 0;
  response[11] = 0;

  return new Response(response, {
    headers: {
      'Content-Type': 'application/dns-message',
      'Access-Control-Allow-Origin': '*',
      'X-Abuse-Flag': flag,
    },
  });
}

/**
 * Build a rate-limited 429 response with Retry-After.
 */
function buildRateLimitResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: 'DNS query rate limit exceeded' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-Abuse-Flag': 'rate_limited' as AbuseFlag,
      },
    },
  );
}

/* ── DGA Detection ─────────────────────────────────────── */

const VOWELS = new Set('aeiouAEIOU');

/**
 * Shannon entropy of a string. Higher = more random-looking.
 */
function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Check if a domain looks like a DGA-generated name.
 *
 * Heuristics:
 *   1. Long label (>25 chars) with zero vowels → suspicious
 *   2. High Shannon entropy (>3.5) on longest label → suspicious
 *
 * Only checks the leftmost (most specific) label to avoid
 * flagging legitimate long TLDs or CDN suffixes.
 */
export function isDGA(domain: string): boolean {
  const labels = domain.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length < 2) return false;

  // Check the leftmost label (subdomain / hostname)
  const target = labels[0];

  // Heuristic 1: long + no vowels
  if (target.length > DGA_MIN_LENGTH) {
    const hasVowel = [...target].some(ch => VOWELS.has(ch));
    if (!hasVowel) return true;
  }

  // Heuristic 2: high entropy on long-ish labels
  if (target.length > 10 && shannonEntropy(target) > DGA_ENTROPY_THRESHOLD) {
    return true;
  }

  return false;
}

/* ── Dangerous Query Type Detection ────────────────────── */

/**
 * Check if a JSON-format query targets a dangerous type.
 * Returns the AbuseFlag if dangerous, null if clean.
 */
export function checkDangerousJsonQuery(
  type: string,
): AbuseFlag | null {
  const upper = type.toUpperCase();
  if (upper === 'ANY' || upper === '255') return 'suspicious';
  return null;
}

/**
 * Check if a wireformat query targets dangerous types/classes.
 * Returns the AbuseFlag if dangerous, null if clean.
 */
export function checkDangerousWireQuery(
  buffer: ArrayBuffer,
): AbuseFlag | null {
  const meta = parseQueryMeta(buffer);
  if (!meta) return null;

  // Block ANY queries (amplification vector)
  if (meta.qtype === QTYPE_ANY) return 'suspicious';

  // Block CHAOS class queries (info disclosure)
  if (meta.qclass === QCLASS_CH) return 'suspicious';

  // Block oversized TXT queries (>2048 bytes — abuse indicator)
  if (meta.qtype === QTYPE_TXT && meta.querySize > 2048) return 'suspicious';

  return null;
}

/* ── Rate limiting core (check + record in one step) ───── */

/**
 * Apply the in-memory rate limit for one query and record it.
 * `suspicious=true` also increments the escalation counter.
 * Synchronous — no KV, no await, no waitUntil needed.
 */
function applyRateLimit(ip: string, suspicious: boolean): AbuseCheckResult | null {
  const t = Date.now();
  const b = getBucket(ip);

  // Hard block still active?
  if (b.blockUntil > t) {
    const retryAfter = Math.ceil((b.blockUntil - t) / 1000);
    return {
      allowed: false,
      flag: 'rate_limited',
      response: buildRateLimitResponse(retryAfter),
    };
  }

  b.queryCount++;
  if (suspicious) b.suspiciousCount++;

  // Over the per-minute cap, or too many suspicious queries → block
  if (b.queryCount > MAX_QUERIES_PER_MIN || b.suspiciousCount >= MAX_SUSPICIOUS_PER_MIN) {
    b.blockUntil = t + BLOCK_DURATION_MS;
    return {
      allowed: false,
      flag: 'rate_limited',
      response: buildRateLimitResponse(Math.ceil(BLOCK_DURATION_MS / 1000)),
    };
  }

  return null; // within limits
}

/* ── Main Abuse Check (combines all layers) ────────────── */

/**
 * Full abuse check for a JSON-format DNS query.
 * Checks AND records the query in one synchronous call.
 * Call BEFORE resolver. Returns allowed=false if the query should be refused.
 */
export function checkJsonAbuse(
  ip: string,
  domain: string,
  type: string,
): AbuseCheckResult {
  // Layer 1: dangerous query type (counts as suspicious)
  const dangerFlag = checkDangerousJsonQuery(type);
  // Layer 2: DGA heuristic (allowed, but suspicious)
  const dga = !dangerFlag && isDGA(domain);
  const suspicious = !!dangerFlag || dga;

  // Layer 3: rate limit (records this query)
  const limited = applyRateLimit(ip, suspicious);
  if (limited) return limited;

  if (dangerFlag) {
    return {
      allowed: false,
      flag: 'suspicious',
      response: buildRefusedJsonResponse('suspicious'),
    };
  }

  return { allowed: true, flag: dga ? 'suspicious' : 'clean' };
}

/**
 * Full abuse check for a wireformat DNS query.
 * Checks AND records the query in one synchronous call.
 * Call BEFORE resolver. Returns allowed=false if the query should be refused.
 */
export function checkWireAbuse(
  ip: string,
  domain: string | null,
  buffer: ArrayBuffer,
): AbuseCheckResult {
  const dangerFlag = checkDangerousWireQuery(buffer);
  const dga = !dangerFlag && !!domain && isDGA(domain);
  const suspicious = !!dangerFlag || dga;

  const limited = applyRateLimit(ip, suspicious);
  if (limited) return limited;

  if (dangerFlag) {
    return {
      allowed: false,
      flag: 'suspicious',
      response: buildRefusedWireResponse(buffer, 'suspicious'),
    };
  }

  return { allowed: true, flag: dga ? 'suspicious' : 'clean' };
}
