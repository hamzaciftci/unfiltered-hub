/**
 * UnfilteredHub — Admin API
 * Protected endpoints for managing the KV blocklist snapshot.
 *
 * Security layers:
 *   1. Rate limiting (brute-force protection)
 *   2. IP whitelist (optional, via ADMIN_ALLOWED_IPS)
 *   3. Header-only API key (constant-time compare, weak keys rejected)
 *   4. HMAC signed requests (optional, replay-protected)
 *
 * Query-param auth (?key=) is explicitly rejected.
 *
 * Endpoints:
 *   GET    /admin/stats               → daily + weekly stats, blocklist counts
 *   GET    /admin/blocklist?cursor=&limit=   → paginated snapshot listing
 *   POST   /admin/blocklist           → { domains: [], list?: "block"|"allow" }
 *   DELETE /admin/blocklist           → { domains: [], list?: "block"|"allow" }
 *   POST   /admin/blocklist/refresh   → drop this isolate's snapshot cache
 */

import { getStats, getWeeklyStats } from './stats';
import { generateDashboard } from './dashboard';
import { checkRateLimit } from './rateLimiter';
import { authenticateAdmin, parseAllowedIps } from './adminAuth';
import { getClientIp } from './utils';
import {
  getBlocklistCounts,
  getSnapshot,
  invalidateBlocklistCache,
  mutateSnapshot,
} from './blocker';

export interface AdminEnv {
  BLOCKLIST?: KVNamespace;
  ADMIN_KEY?: string;
  ADMIN_ALLOWED_IPS?: string;
}

/** Max domains accepted per mutation request (snapshot is a single write) */
const MAX_MUTATION_BATCH = 10_000;

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

  if (path === '/admin/blocklist/refresh') {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
    }
    return handleRefresh(env);
  }

  if (path === '/admin/blocklist') {
    switch (request.method) {
      case 'GET':
        return handleListBlocklist(url, env);
      case 'POST':
        return handleMutateBlocklist(request, env, 'add');
      case 'DELETE':
        return handleMutateBlocklist(request, env, 'remove');
      default:
        return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
    }
  }

  return Response.json({ error: 'Not Found' }, { status: 404 });
}

/** GET /admin/stats */
async function handleStats(env: AdminEnv): Promise<Response> {
  const [counts, today, weekly] = await Promise.all([
    getBlocklistCounts(env.BLOCKLIST),
    getStats(env.BLOCKLIST),
    getWeeklyStats(env.BLOCKLIST, 7),
  ]);

  return Response.json({
    blocklist: {
      coreSize: counts.core,
      kvSize: counts.kvBlock,
      allowSize: counts.kvAllow,
      kvAvailable: !!env.BLOCKLIST,
    },
    queries: {
      today: today || { total: 0, blocked: 0, cached: 0, abused: 0, date: new Date().toISOString().slice(0, 10) },
      weekly,
    },
  });
}

/** POST /admin/blocklist/refresh — invalidate this isolate's snapshot cache */
async function handleRefresh(env: AdminEnv): Promise<Response> {
  invalidateBlocklistCache();
  const counts = await getBlocklistCounts(env.BLOCKLIST);
  return Response.json({
    refreshed: true,
    block: counts.kvBlock,
    allow: counts.kvAllow,
    note: 'Other isolates converge within the 5-minute snapshot TTL.',
  });
}

/**
 * GET /admin/blocklist?cursor=0&limit=100&list=block|allow
 * Pages through the in-memory snapshot (cursor = numeric offset).
 */
async function handleListBlocklist(url: URL, env: AdminEnv): Promise<Response> {
  if (!env.BLOCKLIST) {
    return Response.json({ error: 'KV not configured' }, { status: 503 });
  }

  const snap = await getSnapshot(env.BLOCKLIST);
  const which = url.searchParams.get('list') === 'allow' ? snap.allow : snap.block;
  const all = [...which].sort();

  const offset = Math.max(0, parseInt(url.searchParams.get('cursor') || '0') || 0);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '100') || 100), 1000);
  const page = all.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const complete = nextOffset >= all.length;

  return Response.json({
    domains: page,
    total: all.length,
    cursor: complete ? null : String(nextOffset),
    complete,
  });
}

/**
 * POST/DELETE /admin/blocklist
 * Body: { "domains": ["example.com", ...], "list": "block" | "allow" }
 * One snapshot read + one snapshot write per request, regardless of batch size.
 */
async function handleMutateBlocklist(
  request: Request,
  env: AdminEnv,
  action: 'add' | 'remove',
): Promise<Response> {
  if (!env.BLOCKLIST) {
    return Response.json({ error: 'KV not configured' }, { status: 503 });
  }

  let body: { domains?: string[]; list?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.domains || !Array.isArray(body.domains)) {
    return Response.json({ error: 'Invalid body. Expected { "domains": ["..."] }' }, { status: 400 });
  }
  if (body.domains.length === 0) {
    return Response.json({ error: 'No domains provided' }, { status: 400 });
  }
  if (body.domains.length > MAX_MUTATION_BATCH) {
    return Response.json(
      { error: `Too many domains. Max ${MAX_MUTATION_BATCH} per request.` },
      { status: 413 },
    );
  }

  const targetAllow = body.list === 'allow';
  const mutation = action === 'add'
    ? (targetAllow ? { addAllow: body.domains } : { addBlock: body.domains })
    : (targetAllow ? { removeAllow: body.domains } : { removeBlock: body.domains });

  const result = await mutateSnapshot(env.BLOCKLIST, mutation);

  return Response.json({
    [action === 'add' ? 'added' : 'removed']: result.changed,
    block: result.block,
    allow: result.allow,
  });
}
