/**
 * UnfilteredHub — Admin Authentication Module
 * Hardened auth: header-only API key, constant-time compare,
 * optional HMAC signed requests, IP whitelist, replay protection.
 */

/* ── Constant-time string comparison ────────────────────── */

/**
 * Compare two strings in constant time to prevent timing attacks.
 * Uses Web Crypto subtle.timingSafeEqual emulation via XOR accumulation.
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const encA = new TextEncoder().encode(a);
  const encB = new TextEncoder().encode(b);

  // Length mismatch — still iterate max length to avoid length oracle
  const len = Math.max(encA.length, encB.length);
  let mismatch = encA.length !== encB.length ? 1 : 0;

  for (let i = 0; i < len; i++) {
    const byteA = i < encA.length ? encA[i] : 0;
    const byteB = i < encB.length ? encB[i] : 0;
    mismatch |= byteA ^ byteB;
  }

  return mismatch === 0;
}

/* ── IP Whitelist ───────────────────────────────────────── */

/**
 * Parse ADMIN_ALLOWED_IPS env var (comma-separated) into a Set.
 * Returns null if not configured (= all IPs allowed).
 */
export function parseAllowedIps(envValue?: string): Set<string> | null {
  if (!envValue || envValue.trim() === '') return null;
  const ips = envValue.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
  return ips.length > 0 ? new Set(ips) : null;
}

/**
 * Check whether clientIp is in the whitelist.
 * If whitelist is null (not configured), all IPs are allowed.
 */
export function isIpAllowed(clientIp: string, whitelist: Set<string> | null): boolean {
  if (!whitelist) return true;
  return whitelist.has(clientIp);
}

/* ── HMAC Signature Verification ────────────────────────── */

const HMAC_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Import a secret key for HMAC-SHA256.
 */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Compute HMAC-SHA256 of a message and return hex-encoded string.
 */
async function hmacSign(key: CryptoKey, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface HmacVerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify an HMAC-signed admin request.
 *
 * Expected headers:
 *   X-Timestamp: Unix epoch in seconds (string)
 *   X-Signature: HMAC-SHA256( ADMIN_KEY, "{method}:{path}:{timestamp}" ) as hex
 *
 * Protections:
 *   1. Timestamp must be within 5 minutes of server time (replay protection)
 *   2. Signature must match exactly (constant-time via subtle.verify)
 */
export async function verifyHmac(
  request: Request,
  url: URL,
  adminKey: string,
): Promise<HmacVerifyResult> {
  const timestamp = request.headers.get('X-Timestamp');
  const signature = request.headers.get('X-Signature');

  // Both headers are optional — if absent, HMAC auth is not attempted
  if (!timestamp && !signature) {
    return { valid: false, error: 'no_hmac_headers' };
  }

  if (!timestamp || !signature) {
    return { valid: false, error: 'X-Timestamp and X-Signature headers are both required for HMAC auth' };
  }

  // ── Timestamp validation (replay protection) ────────
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, error: 'X-Timestamp must be a Unix epoch in seconds' };
  }

  const now = Math.floor(Date.now() / 1000);
  const drift = Math.abs(now - ts);
  if (drift > HMAC_MAX_AGE_MS / 1000) {
    return { valid: false, error: `Request expired. Timestamp drift: ${drift}s (max ${HMAC_MAX_AGE_MS / 1000}s)` };
  }

  // ── Signature verification ──────────────────────────
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const message = `${method}:${path}:${timestamp}`;

  const key = await importHmacKey(adminKey);
  const expected = await hmacSign(key, message);

  // Constant-time comparison for the signature
  if (!secureCompare(signature, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

/* ── Weak key rejection ─────────────────────────────────── */

const MIN_KEY_LENGTH = 16;

/** Known default/placeholder values that must never protect production. */
const WEAK_KEYS = new Set([
  'test-secret-123',
  'changeme',
  'change-me',
  'admin',
  'password',
  'secret',
  'letmein',
  '123456',
  '12345678',
  'admin123',
  'your-secret-key',
  'your-admin-key',
]);

/**
 * Reject default/short admin keys. Fail closed: a weak key means the
 * admin API stays disabled until a real secret is configured via
 * `wrangler secret put ADMIN_KEY`.
 */
export function isWeakAdminKey(key: string): boolean {
  return key.length < MIN_KEY_LENGTH || WEAK_KEYS.has(key.toLowerCase());
}

/* ── Auth result type ───────────────────────────────────── */

export interface AdminAuthResult {
  authenticated: boolean;
  /** HTTP Response to return immediately if auth failed */
  response?: Response;
  /** Whether auth was attempted but failed (for rate limiter) */
  authAttemptFailed: boolean;
}

/**
 * Full admin authentication pipeline:
 *   1. Reject if API key sent via query parameter (400)
 *   2. Check IP whitelist (403)
 *   3. Try X-API-Key header (constant-time compare)
 *   4. Try HMAC signed request (X-Timestamp + X-Signature)
 *   5. Reject if neither method succeeded (401)
 */
export async function authenticateAdmin(
  request: Request,
  url: URL,
  adminKey: string | undefined,
  clientIp: string,
  allowedIps: Set<string> | null,
): Promise<AdminAuthResult> {
  // ── 0. No ADMIN_KEY configured — reject all ─────────
  if (!adminKey) {
    return {
      authenticated: false,
      authAttemptFailed: false,
      response: Response.json(
        { error: 'Admin API not configured. Set ADMIN_KEY secret.' },
        { status: 503 },
      ),
    };
  }

  // ── 0b. Weak/default ADMIN_KEY — fail closed ────────
  if (isWeakAdminKey(adminKey)) {
    return {
      authenticated: false,
      authAttemptFailed: false,
      response: Response.json(
        {
          error: 'ADMIN_KEY is too weak (default or under 16 chars). '
            + 'Set a strong secret: npx wrangler secret put ADMIN_KEY',
        },
        { status: 503 },
      ),
    };
  }

  // ── 1. Reject query-param auth attempts ─────────────
  if (url.searchParams.has('key') || url.searchParams.has('api_key') || url.searchParams.has('apikey')) {
    return {
      authenticated: false,
      authAttemptFailed: true,
      response: Response.json(
        { error: 'API key in URL is not allowed. Use X-API-Key header instead.' },
        { status: 400 },
      ),
    };
  }

  // ── 2. IP whitelist ─────────────────────────────────
  if (!isIpAllowed(clientIp, allowedIps)) {
    return {
      authenticated: false,
      authAttemptFailed: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  // ── 3. X-API-Key header auth ────────────────────────
  const apiKeyHeader = request.headers.get('X-API-Key');
  if (apiKeyHeader) {
    if (secureCompare(apiKeyHeader, adminKey)) {
      return { authenticated: true, authAttemptFailed: false };
    }
    // Key was provided but wrong — don't fall through to HMAC
    return {
      authenticated: false,
      authAttemptFailed: true,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // ── 4. HMAC signed request ──────────────────────────
  const hmac = await verifyHmac(request, url, adminKey);
  if (hmac.valid) {
    return { authenticated: true, authAttemptFailed: false };
  }

  // HMAC headers were present but invalid
  if (hmac.error && hmac.error !== 'no_hmac_headers') {
    return {
      authenticated: false,
      authAttemptFailed: true,
      response: Response.json({ error: hmac.error }, { status: 401 }),
    };
  }

  // ── 5. No auth method provided ──────────────────────
  return {
    authenticated: false,
    authAttemptFailed: true,
    response: Response.json({ error: 'Unauthorized. Provide X-API-Key header.' }, { status: 401 }),
  };
}
