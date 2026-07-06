/**
 * Admin auth security tests: missing key, wrong key, weak/default key,
 * query-param rejection, happy path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import worker from '../src/index';
import { isWeakAdminKey } from '../src/adminAuth';
import { resetAbuseState } from '../src/abuse';
import { resetStatsState } from '../src/stats';
import { invalidateBlocklistCache } from '../src/blocker';
import { installMockCaches, makeCtx, MockKV, STRONG_ADMIN_KEY, WORKER_BASE } from './helpers';

beforeEach(() => {
  resetAbuseState();
  resetStatsState();
  invalidateBlocklistCache();
  installMockCaches();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function adminRequest(path: string, headers: Record<string, string> = {}, init: RequestInit = {}): Request {
  return new Request(`${WORKER_BASE}${path}`, {
    ...init,
    headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers },
  });
}

describe('isWeakAdminKey', () => {
  it('rejects known defaults and short keys', () => {
    expect(isWeakAdminKey('test-secret-123')).toBe(true);
    expect(isWeakAdminKey('changeme')).toBe(true);
    expect(isWeakAdminKey('PASSWORD')).toBe(true);
    expect(isWeakAdminKey('short')).toBe(true);
    expect(isWeakAdminKey('exactly15chars!')).toBe(true);
    expect(isWeakAdminKey(STRONG_ADMIN_KEY)).toBe(false);
  });
});

describe('admin endpoint auth', () => {
  it('returns 503 when ADMIN_KEY is not configured', async () => {
    const res = await worker.fetch(adminRequest('/admin/stats'), {} as any, makeCtx() as any);
    expect(res.status).toBe(503);
  });

  it('returns 503 (fail closed) when ADMIN_KEY is a weak default', async () => {
    const env = { ADMIN_KEY: 'test-secret-123' } as any;
    const res = await worker.fetch(
      adminRequest('/admin/stats', { 'X-API-Key': 'test-secret-123' }),
      env,
      makeCtx() as any,
    );
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toContain('weak');
  });

  it('returns 401 for a wrong key', async () => {
    const env = { ADMIN_KEY: STRONG_ADMIN_KEY } as any;
    const res = await worker.fetch(
      adminRequest('/admin/stats', { 'X-API-Key': 'wrong-key-but-long-enough!!' }),
      env,
      makeCtx() as any,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when the key is passed as a query parameter', async () => {
    const env = { ADMIN_KEY: STRONG_ADMIN_KEY } as any;
    const res = await worker.fetch(
      adminRequest(`/admin/stats?key=${STRONG_ADMIN_KEY}`),
      env,
      makeCtx() as any,
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 with no credentials at all', async () => {
    const env = { ADMIN_KEY: STRONG_ADMIN_KEY } as any;
    const res = await worker.fetch(adminRequest('/admin/stats'), env, makeCtx() as any);
    expect(res.status).toBe(401);
  });

  it('accepts the correct key and returns stats', async () => {
    const kv = new MockKV();
    const env = { ADMIN_KEY: STRONG_ADMIN_KEY, BLOCKLIST: kv } as any;
    const ctx = makeCtx();
    const res = await worker.fetch(
      adminRequest('/admin/stats', { 'X-API-Key': STRONG_ADMIN_KEY }),
      env,
      ctx as any,
    );
    await ctx.drain();
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.blocklist.coreSize).toBeGreaterThan(0);
    expect(body.queries).toBeDefined();
  });

  it('enforces the IP whitelist when configured', async () => {
    const env = { ADMIN_KEY: STRONG_ADMIN_KEY, ADMIN_ALLOWED_IPS: '203.0.113.99' } as any;
    const res = await worker.fetch(
      adminRequest('/admin/stats', { 'X-API-Key': STRONG_ADMIN_KEY }),
      env,
      makeCtx() as any,
    );
    expect(res.status).toBe(403);
  });
});

describe('admin blocklist CRUD (snapshot)', () => {
  it('adds, lists and removes domains through the API', async () => {
    const kv = new MockKV();
    const env = { ADMIN_KEY: STRONG_ADMIN_KEY, BLOCKLIST: kv } as any;
    const auth = { 'X-API-Key': STRONG_ADMIN_KEY, 'Content-Type': 'application/json' };

    // Add
    let ctx = makeCtx();
    let res = await worker.fetch(
      adminRequest('/admin/blocklist', auth, {
        method: 'POST',
        body: JSON.stringify({ domains: ['spam.example.com', 'ads.example.net'] }),
      }),
      env, ctx as any,
    );
    await ctx.drain();
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).added).toBe(2);

    // List
    ctx = makeCtx();
    res = await worker.fetch(adminRequest('/admin/blocklist?limit=10', auth), env, ctx as any);
    await ctx.drain();
    const list = await res.json() as any;
    expect(list.domains).toContain('spam.example.com');
    expect(list.total).toBe(2);

    // Remove
    ctx = makeCtx();
    res = await worker.fetch(
      adminRequest('/admin/blocklist', auth, {
        method: 'DELETE',
        body: JSON.stringify({ domains: ['spam.example.com'] }),
      }),
      env, ctx as any,
    );
    await ctx.drain();
    expect(((await res.json()) as any).removed).toBe(1);
  });
});
