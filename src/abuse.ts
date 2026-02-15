/**
 * UnfilteredHub — Abuse Protection
 * Protects the public /dns-query endpoint from DNS abuse, amplification,
 * DGA-based C2, and volumetric flooding.
 *
 * Layers:
 *   1. Dangerous query type blocking (ANY, CHAOS, oversized TXT)
 *   2. DGA detection heuristic (high entropy / vowel-less long domains)
 *   3. Per-IP rate limiting (200 queries/min, KV-backed)
 *   4. Suspicious query escalation (3 suspicious in 1 min → 5 min IP block)
 *
 * Returns DNS REFUSED (RCODE=5) for abuse, never NXDOMAIN.
 * Adds X-Abuse-Flag header: "clean" | "suspicious" | "rate_limited"
 */

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

/** KV record for per-IP dns-query rate limiting */
interface DnsRateLimitRecord {
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
const WINDOW_SEC = 60;
const BLOCK_DURATION_SEC = 5 * 60; // 5 min
const KV_PREFIX = 'abuse:';

/** DGA detection thresholds */
const DGA_MIN_LENGTH = 25;
const DGA_ENTROPY_THRESHOLD = 3.5;

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

  return new Response(response.buffer, {
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
function buildRateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: 'DNS query rate limit exceeded' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
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
 * Parse QTYPE and QCLASS from a DNS wireformat query.
 * Returns null if parsing fails.
 */
export function parseQueryMeta(buffer: ArrayBuffer): { qtype: number; qclass: number; querySize: number } | null {
  const data = new Uint8Array(buffer);
  if (data.length < 12) return null;

  // Skip header (12 bytes), walk through question QNAME
  let offset = 12;
  while (offset < data.length) {
    const len = data[offset];
    if (len === 0) { offset++; break; }
    if ((len & 0xc0) === 0xc0) { offset += 2; break; } // pointer
    if (len > 63 || offset + 1 + len > data.length) return null;
    offset += 1 + len;
  }

  // QTYPE (2 bytes) + QCLASS (2 bytes) follow the QNAME
  if (offset + 4 > data.length) return null;

  const qtype = (data[offset] << 8) | data[offset + 1];
  const qclass = (data[offset + 2] << 8) | data[offset + 3];

  return { qtype, qclass, querySize: buffer.byteLength };
}

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

/* ── Per-IP Rate Limiting (KV-backed) ──────────────────── */

function kvKey(ip: string): string {
  return `${KV_PREFIX}${ip}`;
}

/**
 * Check per-IP DNS query rate limit.
 *
 * Returns:
 *   - allowed=true, flag='clean' → proceed normally
 *   - allowed=true, flag='suspicious' → proceed but record suspicion
 *   - allowed=false → return response immediately (429 or REFUSED)
 *
 * The caller must invoke `recordDnsQuery()` after the check to persist counters.
 */
export async function checkDnsRateLimit(
  ip: string,
  kv: KVNamespace | undefined,
): Promise<AbuseCheckResult & { record: DnsRateLimitRecord | null }> {
  if (!kv) {
    return { allowed: true, flag: 'clean', record: null };
  }

  const key = kvKey(ip);
  let record: DnsRateLimitRecord | null = null;

  try {
    record = await kv.get<DnsRateLimitRecord>(key, 'json');
  } catch {
    return { allowed: true, flag: 'clean', record: null };
  }

  const t = Date.now();

  // Hard block still active?
  if (record && record.blockUntil > t) {
    const retryAfter = Math.ceil((record.blockUntil - t) / 1000);
    return {
      allowed: false,
      flag: 'rate_limited',
      response: buildRateLimitResponse(retryAfter),
      record,
    };
  }

  // Window expired? Reset.
  if (!record || t - record.windowStart > WINDOW_SEC * 1000) {
    record = { queryCount: 0, suspiciousCount: 0, blockUntil: 0, windowStart: t };
  }

  // Over query cap?
  if (record.queryCount >= MAX_QUERIES_PER_MIN) {
    record.blockUntil = t + BLOCK_DURATION_SEC * 1000;
    try { await kv.put(key, JSON.stringify(record), { expirationTtl: BLOCK_DURATION_SEC + 60 }); } catch {}
    return {
      allowed: false,
      flag: 'rate_limited',
      response: buildRateLimitResponse(BLOCK_DURATION_SEC),
      record,
    };
  }

  // Suspicious escalation: 3+ suspicious queries → block
  if (record.suspiciousCount >= MAX_SUSPICIOUS_PER_MIN) {
    record.blockUntil = t + BLOCK_DURATION_SEC * 1000;
    try { await kv.put(key, JSON.stringify(record), { expirationTtl: BLOCK_DURATION_SEC + 60 }); } catch {}
    return {
      allowed: false,
      flag: 'rate_limited',
      response: buildRateLimitResponse(BLOCK_DURATION_SEC),
      record,
    };
  }

  return { allowed: true, flag: 'clean', record };
}

/**
 * Record a DNS query outcome into the rate limit counters.
 * Must be called with ctx.waitUntil() for non-blocking KV write.
 */
export async function recordDnsQuery(
  ip: string,
  kv: KVNamespace | undefined,
  suspicious: boolean,
  currentRecord: DnsRateLimitRecord | null,
): Promise<void> {
  if (!kv) return;

  const key = kvKey(ip);
  const t = Date.now();

  const record = currentRecord && (t - currentRecord.windowStart <= WINDOW_SEC * 1000)
    ? { ...currentRecord }
    : { queryCount: 0, suspiciousCount: 0, blockUntil: 0, windowStart: t };

  record.queryCount++;
  if (suspicious) {
    record.suspiciousCount++;
  }

  // If this tips over a limit, set block
  if (record.suspiciousCount >= MAX_SUSPICIOUS_PER_MIN) {
    record.blockUntil = Date.now() + BLOCK_DURATION_SEC * 1000;
  } else if (record.queryCount >= MAX_QUERIES_PER_MIN) {
    record.blockUntil = Date.now() + BLOCK_DURATION_SEC * 1000;
  }

  const ttl = record.blockUntil > 0
    ? Math.ceil((record.blockUntil - Date.now()) / 1000) + 60
    : WINDOW_SEC + 60;

  try {
    await kv.put(key, JSON.stringify(record), { expirationTtl: Math.max(ttl, 60) });
  } catch {
    // Non-critical, never fail the DNS query
  }
}

/* ── Main Abuse Check (combines all layers) ────────────── */

/**
 * Full abuse check for a JSON-format DNS query.
 * Call BEFORE resolver. Returns allowed=false if the query should be refused.
 */
export async function checkJsonAbuse(
  ip: string,
  domain: string,
  type: string,
  kv: KVNamespace | undefined,
): Promise<AbuseCheckResult & { _record: DnsRateLimitRecord | null }> {
  // Layer 1: Rate limit
  const rl = await checkDnsRateLimit(ip, kv);
  if (!rl.allowed) {
    return { allowed: false, flag: rl.flag, response: rl.response, _record: rl.record };
  }

  // Layer 2: Dangerous query type
  const dangerFlag = checkDangerousJsonQuery(type);
  if (dangerFlag) {
    return {
      allowed: false,
      flag: 'suspicious',
      response: buildRefusedJsonResponse('suspicious'),
      _record: rl.record,
    };
  }

  // Layer 3: DGA detection
  if (isDGA(domain)) {
    return {
      allowed: true, // Allow but mark suspicious — let resolver handle
      flag: 'suspicious',
      _record: rl.record,
    };
  }

  return { allowed: true, flag: 'clean', _record: rl.record };
}

/**
 * Full abuse check for a wireformat DNS query.
 * Call BEFORE resolver. Returns allowed=false if the query should be refused.
 */
export async function checkWireAbuse(
  ip: string,
  domain: string | null,
  buffer: ArrayBuffer,
  kv: KVNamespace | undefined,
): Promise<AbuseCheckResult & { _record: DnsRateLimitRecord | null }> {
  // Layer 1: Rate limit
  const rl = await checkDnsRateLimit(ip, kv);
  if (!rl.allowed) {
    return { allowed: false, flag: rl.flag, response: rl.response, _record: rl.record };
  }

  // Layer 2: Dangerous query type / class
  const dangerFlag = checkDangerousWireQuery(buffer);
  if (dangerFlag) {
    return {
      allowed: false,
      flag: 'suspicious',
      response: buildRefusedWireResponse(buffer, 'suspicious'),
      _record: rl.record,
    };
  }

  // Layer 3: DGA detection (only if domain was parsed)
  if (domain && isDGA(domain)) {
    return {
      allowed: true,
      flag: 'suspicious',
      _record: rl.record,
    };
  }

  return { allowed: true, flag: 'clean', _record: rl.record };
}
