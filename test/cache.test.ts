/**
 * Wireformat cache tests: cache hit without upstream, DNS transaction ID
 * rewrite on cached responses, GET/POST sharing one cache family,
 * DNSSEC DO-flag cache isolation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import worker from '../src/index';
import { resetAbuseState } from '../src/abuse';
import { resetStatsState } from '../src/stats';
import { resetResolverStats } from '../src/resolver';
import { invalidateBlocklistCache } from '../src/blocker';
import {
  installMockCaches,
  makeCtx,
  buildWireQuery,
  toBase64Url,
  makeWireUpstreamFetch,
  dnsGetRequest,
  dnsPostRequest,
} from './helpers';

const env = {} as any;

beforeEach(() => {
  resetAbuseState();
  resetStatsState();
  resetResolverStats();
  invalidateBlocklistCache();
  installMockCaches();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fireGet(query: Uint8Array) {
  const ctx = makeCtx();
  const res = await worker.fetch(dnsGetRequest({ dns: toBase64Url(query) }), env, ctx as any);
  await ctx.drain(); // let waitUntil cache-fill complete
  return res;
}

async function firePost(query: Uint8Array) {
  const ctx = makeCtx();
  const res = await worker.fetch(dnsPostRequest(query), env, ctx as any);
  await ctx.drain();
  return res;
}

describe('wireformat cache', () => {
  it('serves the second identical GET query from cache (no upstream call)', async () => {
    const fetchMock = makeWireUpstreamFetch({ ttl: 300 });
    vi.stubGlobal('fetch', fetchMock);

    await fireGet(buildWireQuery('cached.example.com', { id: 0x0001 }));
    expect(fetchMock.calls.length).toBe(1);

    const res2 = await fireGet(buildWireQuery('cached.example.com', { id: 0x0002 }));
    expect(fetchMock.calls.length).toBe(1); // still 1 — served from cache
    expect(res2.headers.get('X-Cache')).toBe('HIT');
  });

  it('rewrites the DNS transaction ID on cached responses', async () => {
    vi.stubGlobal('fetch', makeWireUpstreamFetch());

    await fireGet(buildWireQuery('id-test.example.com', { id: 0xaaaa }));
    const res2 = await fireGet(buildWireQuery('id-test.example.com', { id: 0xbbbb }));

    const bytes = new Uint8Array(await res2.arrayBuffer());
    // Must be the SECOND request's ID, not the cached first one
    expect(bytes[0]).toBe(0xbb);
    expect(bytes[1]).toBe(0xbb);
  });

  it('shares cache entries between GET and POST for the same question', async () => {
    const fetchMock = makeWireUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    await fireGet(buildWireQuery('shared.example.com', { id: 0x1000 }));
    expect(fetchMock.calls.length).toBe(1);

    const res2 = await firePost(buildWireQuery('shared.example.com', { id: 0x2000 }));
    expect(fetchMock.calls.length).toBe(1); // POST hit the GET-filled cache
    expect(res2.headers.get('X-Cache')).toBe('HIT');
    const bytes = new Uint8Array(await res2.arrayBuffer());
    expect(bytes[0]).toBe(0x20);
    expect(bytes[1]).toBe(0x00);
  });

  it('separates DO=1 and DO=0 cache entries', async () => {
    const fetchMock = makeWireUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    await fireGet(buildWireQuery('dnssec.example.com', { id: 1 }));
    expect(fetchMock.calls.length).toBe(1);

    // Same question but DO=1 → different cache entry → upstream again
    await fireGet(buildWireQuery('dnssec.example.com', { id: 2, dnssecOk: true }));
    expect(fetchMock.calls.length).toBe(2);
  });

  it('JSON path: second query is a cache hit', async () => {
    const { makeJsonUpstreamFetch } = await import('./helpers');
    const fetchMock = makeJsonUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    const ctx1 = makeCtx();
    await worker.fetch(dnsGetRequest({ name: 'json-cache.example.com' }), env, ctx1 as any);
    await ctx1.drain();
    expect(fetchMock.calls.length).toBe(1);

    const ctx2 = makeCtx();
    const res2 = await worker.fetch(dnsGetRequest({ name: 'json-cache.example.com' }), env, ctx2 as any);
    await ctx2.drain();
    expect(fetchMock.calls.length).toBe(1);
    expect(res2.headers.get('X-Cache')).toBe('HIT');
  });
});
