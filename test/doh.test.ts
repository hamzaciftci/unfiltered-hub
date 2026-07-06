/**
 * DoH endpoint tests: JSON GET, wireformat GET, wireformat POST,
 * blocklist responses on all paths.
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
  makeJsonUpstreamFetch,
  dnsGetRequest,
  dnsPostRequest,
} from './helpers';

const env = {} as any; // no KV — core blocklist + memory paths only

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

describe('DoH JSON (?name=&type=)', () => {
  it('resolves via upstream and returns dns-json', async () => {
    const fetchMock = makeJsonUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx();
    const res = await worker.fetch(dnsGetRequest({ name: 'example.com', type: 'A' }), env, ctx as any);
    await ctx.drain();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('dns-json');
    expect(res.headers.get('X-Resolver')).toBeTruthy();
    const body = await res.json() as any;
    expect(body.Status).toBe(0);
    expect(body.Answer[0].data).toBe('1.2.3.4');
    expect(fetchMock.calls.length).toBe(1);
  });

  it('returns NXDOMAIN for core-blocklisted domains without hitting upstream', async () => {
    const fetchMock = makeJsonUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx();
    const res = await worker.fetch(dnsGetRequest({ name: 'doubleclick.net' }), env, ctx as any);
    await ctx.drain();

    const body = await res.json() as any;
    expect(body.Status).toBe(3);
    expect(body.Comment).toContain('Blocked');
    expect(fetchMock.calls.length).toBe(0);
  });
});

describe('DoH wireformat GET (?dns=)', () => {
  it('resolves and returns dns-message bytes', async () => {
    const fetchMock = makeWireUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    const query = buildWireQuery('example.com', { id: 0xabcd });
    const ctx = makeCtx();
    const res = await worker.fetch(dnsGetRequest({ dns: toBase64Url(query) }), env, ctx as any);
    await ctx.drain();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('dns-message');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0xab);
    expect(bytes[1]).toBe(0xcd);
    expect((bytes[2] & 0x80) !== 0).toBe(true); // QR=1
    expect(fetchMock.calls.length).toBe(1);
  });

  it('blocks core-blocklisted domains with wire NXDOMAIN, echoing the query ID', async () => {
    const fetchMock = makeWireUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    const query = buildWireQuery('doubleclick.net', { id: 0x5678 });
    const ctx = makeCtx();
    const res = await worker.fetch(dnsGetRequest({ dns: toBase64Url(query) }), env, ctx as any);
    await ctx.drain();

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x56);
    expect(bytes[1]).toBe(0x78);
    expect(bytes[3] & 0x0f).toBe(3); // RCODE=3 NXDOMAIN
    expect(fetchMock.calls.length).toBe(0);
  });
});

describe('DoH wireformat POST', () => {
  it('resolves a binary body and returns dns-message', async () => {
    const fetchMock = makeWireUpstreamFetch();
    vi.stubGlobal('fetch', fetchMock);

    const query = buildWireQuery('example.org', { id: 0x1111 });
    const ctx = makeCtx();
    const res = await worker.fetch(dnsPostRequest(query), env, ctx as any);
    await ctx.drain();

    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x11);
    expect(bytes[1]).toBe(0x11);
    expect(bytes[7]).toBe(1); // one answer
    expect(fetchMock.calls.length).toBe(1);
  });
});
