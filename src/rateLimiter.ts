/**
 * UnfilteredHub — Rate Limiter
 * IP-based rate limiting and brute-force protection using Cloudflare KV.
 *
 * Two tiers:
 *   1. Auth failures:  max 10 per 5 min  → blocks IP for 5 min
 *   2. Total requests: max 100 per 10 min → blocks IP for 10 min
 *
 * KV keys auto-expire via expirationTtl so no cleanup is needed.
 */

/** Persisted counter stored in KV */
export interface RateLimitRecord {
  /** Cumulative failed auth attempts in current window */
  failedAttempts: number;
  /** Cumulative total admin requests in current window */
  totalAttempts: number;
  /** Unix-ms timestamp: IP is hard-blocked until this time */
  blockUntil: number;
  /** Unix-ms timestamp when the sliding window started */
  windowStart: number;
}

export interface RateLimitResult {
  /** true  → request may proceed */
  allowed: boolean;
  /** If blocked, the 429 Response to return immediately */
  response?: Response;
  /** Callback the caller must invoke after auth outcome is known */
  recordOutcome: (authFailed: boolean) => Promise<void>;
}

/* ── tunables ─────────────────────────────────────────────── */
const MAX_FAILED_ATTEMPTS = 10;
const FAILED_WINDOW_SEC   = 5 * 60;       // 5 min
const MAX_TOTAL_ATTEMPTS  = 100;
const TOTAL_WINDOW_SEC    = 10 * 60;       // 10 min
const KV_PREFIX           = 'rl:';
/* ────────────────────────────────────────────────────────── */

function kvKey(ip: string): string {
  return `${KV_PREFIX}${ip}`;
}

function now(): number {
  return Date.now();
}

function make429(): Response {
  return Response.json(
    { error: 'Rate limit exceeded' },
    {
      status: 429,
      headers: {
        'Retry-After': String(FAILED_WINDOW_SEC),
        'Content-Type': 'application/json',
      },
    },
  );
}

/**
 * Check whether the request from `ip` is within rate limits.
 *
 * Returns a `RateLimitResult`:
 *   • `allowed === false`  →  return `result.response` immediately (429)
 *   • `allowed === true`   →  proceed, then call
 *       `result.recordOutcome(authFailed)` inside `ctx.waitUntil()`
 */
export async function checkRateLimit(
  ip: string,
  kv: KVNamespace | undefined,
): Promise<RateLimitResult> {
  // If KV is unavailable, degrade gracefully — allow the request
  if (!kv) {
    return { allowed: true, recordOutcome: async () => {} };
  }

  const key = kvKey(ip);
  let record: RateLimitRecord | null = null;

  try {
    record = await kv.get<RateLimitRecord>(key, 'json');
  } catch {
    // KV read failure → allow the request rather than locking out everyone
    return { allowed: true, recordOutcome: async () => {} };
  }

  const t = now();

  // ── 1. Hard block still active? ─────────────────────────
  if (record && record.blockUntil > t) {
    const retryAfter = Math.ceil((record.blockUntil - t) / 1000);
    return {
      allowed: false,
      response: Response.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'Content-Type': 'application/json',
          },
        },
      ),
      recordOutcome: async () => {},
    };
  }

  // ── 2. Window expired? Reset. ───────────────────────────
  if (!record || t - record.windowStart > TOTAL_WINDOW_SEC * 1000) {
    record = { failedAttempts: 0, totalAttempts: 0, blockUntil: 0, windowStart: t };
  }

  // ── 3. Already over total-request cap? ──────────────────
  if (record.totalAttempts >= MAX_TOTAL_ATTEMPTS) {
    record.blockUntil = t + TOTAL_WINDOW_SEC * 1000;
    try { await kv.put(key, JSON.stringify(record), { expirationTtl: TOTAL_WINDOW_SEC }); } catch {}
    return { allowed: false, response: make429(), recordOutcome: async () => {} };
  }

  // ── 4. Already over failed-auth cap? ───────────────────
  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.blockUntil = t + FAILED_WINDOW_SEC * 1000;
    try { await kv.put(key, JSON.stringify(record), { expirationTtl: FAILED_WINDOW_SEC }); } catch {}
    return { allowed: false, response: make429(), recordOutcome: async () => {} };
  }

  // ── 5. Request allowed — provide outcome recorder ──────
  const snapshot = { ...record };
  return {
    allowed: true,
    recordOutcome: async (authFailed: boolean) => {
      snapshot.totalAttempts += 1;
      if (authFailed) {
        snapshot.failedAttempts += 1;
      }

      // Decide if this attempt tips over a limit
      if (snapshot.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        snapshot.blockUntil = now() + FAILED_WINDOW_SEC * 1000;
      } else if (snapshot.totalAttempts >= MAX_TOTAL_ATTEMPTS) {
        snapshot.blockUntil = now() + TOTAL_WINDOW_SEC * 1000;
      }

      const ttl = snapshot.blockUntil > 0
        ? Math.ceil((snapshot.blockUntil - now()) / 1000) + 60  // keep record a little past block
        : TOTAL_WINDOW_SEC + 60;

      try {
        await kv.put(key, JSON.stringify(snapshot), { expirationTtl: Math.max(ttl, 60) });
      } catch {
        // KV write failure is non-fatal
      }
    },
  };
}
