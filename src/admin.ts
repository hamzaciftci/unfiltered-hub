/**
 * UnfilteredHub — Admin API
 * Protected endpoints for managing the KV blocklist.
 *
 * Security layers:
 *   1. Rate limiting (brute-force protection)
 *   2. IP whitelist (optional, via ADMIN_ALLOWED_IPS)
 *   3. Header-only API key (constant-time compare)
 *   4. HMAC signed requests (optional, replay-protected)
 *
 * Query-param auth (?key=) is explicitly rejected.
 */

import { CORE_BLOCKLIST_SIZE } from './blocklist';
import { getStats, getWeeklyStats } from './stats';
import { generateDashboard } from './dashboard';
import { checkRateLimit } from './rateLimiter';
import { authenticateAdmin, parseAllowedIps } from './adminAuth';
import { getClientIp } from './utils';

export interface AdminEnv {
  BLOCKLIST?: KVNamespace;
  ADMIN_KEY?: string;
  ADMIN_ALLOWED_IPS?: string;
}

/**
 * Handle all /admin/* requests.
 */
export async function handleAdmin(
  request: Request,
  url: URL,
  env: AdminEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const clientIp = getClientIp(request);

  const path = url.pathname;

  // ── Dashboard UI (no auth required — it's a UI shell) ──
  // The dashboard HTML contains no secrets. All data fetches
  // from the dashboard JS use X-API-Key header for auth.
  if (path === '/admin/dashboard') {
    return new Response(generateDashboard(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── Rate limit check (before auth) ──────────────────────
  const rl = await checkRateLimit(clientIp, env.BLOCKLIST);
  if (!rl.allowed) {
    return rl.response!;
  }

  // ── Authentication pipeline ─────────────────────────────
  const allowedIps = parseAllowedIps(env.ADMIN_ALLOWED_IPS);
  const auth = await authenticateAdmin(request, url, env.ADMIN_KEY, clientIp, allowedIps);

  // Record outcome in background (never blocks the response)
  ctx.waitUntil(rl.recordOutcome(auth.authAttemptFailed));

  if (!auth.authenticated) {
    return auth.response!;
  }

  // ── Routing (auth passed) ──────────────────────────────

  if (path === '/admin/stats') {
    return handleStats(env);
  }

  if (path === '/admin/blocklist') {
    switch (request.method) {
      case 'GET':
        return handleListBlocklist(url, env);
      case 'POST':
        return handleAddBlocklist(request, env);
      case 'DELETE':
        return handleRemoveBlocklist(request, env);
      default:
        return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
    }
  }

  return Response.json({ error: 'Not Found' }, { status: 404 });
}

/** GET /admin/stats */
async function handleStats(env: AdminEnv): Promise<Response> {
  let kvCount = 0;
  if (env.BLOCKLIST) {
    try {
      const list = await env.BLOCKLIST.list({ limit: 1000 });
      kvCount = list.keys.length;
    } catch {
      kvCount = -1;
    }
  }

  const today = await getStats(env.BLOCKLIST);
  const weekly = await getWeeklyStats(env.BLOCKLIST, 7);

  return Response.json({
    blocklist: {
      coreSize: CORE_BLOCKLIST_SIZE,
      kvSize: kvCount,
      kvAvailable: !!env.BLOCKLIST,
    },
    queries: {
      today: today || { total: 0, blocked: 0, cached: 0, date: new Date().toISOString().slice(0, 10) },
      weekly,
    },
  });
}

/** GET /admin/blocklist?cursor=xxx&limit=100 */
async function handleListBlocklist(url: URL, env: AdminEnv): Promise<Response> {
  if (!env.BLOCKLIST) {
    return Response.json({ error: 'KV not configured' }, { status: 503 });
  }

  const cursor = url.searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);

  const list = await env.BLOCKLIST.list({ limit, cursor });

  return Response.json({
    domains: list.keys.map((k) => k.name),
    cursor: list.list_complete ? null : list.cursor,
    complete: list.list_complete,
  });
}

/** POST /admin/blocklist  body: { "domains": ["example.com", ...] } */
async function handleAddBlocklist(request: Request, env: AdminEnv): Promise<Response> {
  if (!env.BLOCKLIST) {
    return Response.json({ error: 'KV not configured' }, { status: 503 });
  }

  const body = await request.json<{ domains?: string[] }>();
  if (!body.domains || !Array.isArray(body.domains)) {
    return Response.json({ error: 'Invalid body. Expected { "domains": ["..."] }' }, { status: 400 });
  }

  const domains = body.domains
    .map((d) => d.toLowerCase().trim().replace(/\.$/, ''))
    .filter((d) => d.length > 0 && d.includes('.'));

  if (domains.length === 0) {
    return Response.json({ error: 'No valid domains provided' }, { status: 400 });
  }

  const maxBatch = 25;
  const batch = domains.slice(0, maxBatch);
  await Promise.all(batch.map((d) => env.BLOCKLIST!.put(d, '1')));

  return Response.json({
    added: batch.length,
    total: domains.length,
    truncated: domains.length > maxBatch,
    message: domains.length > maxBatch
      ? `Added first ${maxBatch}. Send remaining in follow-up requests.`
      : `Added ${batch.length} domain(s).`,
  });
}

/** DELETE /admin/blocklist  body: { "domains": ["example.com", ...] } */
async function handleRemoveBlocklist(request: Request, env: AdminEnv): Promise<Response> {
  if (!env.BLOCKLIST) {
    return Response.json({ error: 'KV not configured' }, { status: 503 });
  }

  const body = await request.json<{ domains?: string[] }>();
  if (!body.domains || !Array.isArray(body.domains)) {
    return Response.json({ error: 'Invalid body. Expected { "domains": ["..."] }' }, { status: 400 });
  }

  const domains = body.domains
    .map((d) => d.toLowerCase().trim().replace(/\.$/, ''))
    .filter((d) => d.length > 0);

  if (domains.length === 0) {
    return Response.json({ error: 'No valid domains provided' }, { status: 400 });
  }

  await Promise.all(domains.map((d) => env.BLOCKLIST!.delete(d)));

  return Response.json({ removed: domains.length });
}
