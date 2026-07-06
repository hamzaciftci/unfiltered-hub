/**
 * Abuse protection tests — the critical KV budget guarantee:
 * 1000 DNS queries must cause ZERO abuse-related KV writes.
 * Plus: rate limiting, suspicious escalation, dangerous query refusal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import worker from '../src/index';
import { resetAbuseState, checkJsonAbuse, checkWireAbuse, isDGA } from '../src/abuse';
import { resetStatsState } from '../src/stats';
import { resetResolverStats } from '../src/resolver';
import { invalidateBlocklistCache } from '../src/blocker';
import {
  MockKV,
  installMockCaches,
  makeCtx,
  buildWireQuery,
  toBase64Url,
  makeWireUpstreamFetch,
  dnsGetRequest,
} from './helpers';

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

describe('KV write budget (the production-killer bug)', () => {
  it('1000 DNS queries cause ZERO KV writes', async () => {
    const kv = new MockKV();
    kv.store.set('bl:snapshot:v1', 'something-blocked.com');
    const env = { BLOCKLIST: kv } as any;

    vi.stubGlobal('fetch', makeWireUpstreamFetch());

    const query = buildWireQuery('kv-budget.example.com');
    const dns = toBase64Url(query);

    for (let i = 0; i < 1000; i++) {
      const ctx = makeCtx();
      // Unique IPs so the rate limiter never engages
      const res = await worker.fetch(
        dnsGetRequest({ dns }, `10.${(i >> 16) & 0xff}.${(i >> 8) & 0xff}.${i & 0xff}`),
        env,
        ctx as any,
      );
      expect(res.status).toBe(200);
      await ctx.drain();
    }

    // The old design wrote to KV on EVERY query (1000 writes).
    // Now: abuse = in-memory, stats = buffered (flush interval not reached).
    expect(kv.writes).toBe(0);
    // Blocklist snapshot: exactly one read for the whole batch
    expect(kv.reads).toBe(1);
  });
});

describe('in-memory rate limiting', () => {
  it('blocks an IP after 200 queries/min with a 429', () => {
    const ip = '198.51.100.7';
    let refused = 0;
    for (let i = 0; i < 205; i++) {
      const r = checkJsonAbuse(ip, `q${i}.example.com`, 'A');
      if (!r.allowed) {
        refused++;
        expect(r.flag).toBe('rate_limited');
        expect(r.response!.status).toBe(429);
        expect(r.response!.headers.get('Retry-After')).toBeTruthy();
      }
    }
    expect(refused).toBe(5); // queries 201..205
  });

  it('does not rate-limit distinct IPs', () => {
    for (let i = 0; i < 300; i++) {
      const r = checkJsonAbuse(`10.0.${(i >> 8) & 0xff}.${i & 0xff}`, 'ok.example.com', 'A');
      expect(r.allowed).toBe(true);
    }
  });

  it('escalates after 3 suspicious (DGA) queries', () => {
    const ip = '198.51.100.8';
    const dga = 'zx9qk2vw7j3m1pl0.evil.com'; // high-entropy label
    expect(isDGA(dga)).toBe(true);

    const r1 = checkJsonAbuse(ip, dga, 'A');
    expect(r1.allowed).toBe(true);
    expect(r1.flag).toBe('suspicious');

    const r2 = checkJsonAbuse(ip, dga, 'A');
    expect(r2.allowed).toBe(true);

    const r3 = checkJsonAbuse(ip, dga, 'A');
    expect(r3.allowed).toBe(false); // 3rd suspicious → blocked
    expect(r3.response!.status).toBe(429);
  });
});

describe('dangerous query refusal', () => {
  it('refuses JSON ANY queries with RCODE=5', async () => {
    const r = checkJsonAbuse('198.51.100.9', 'example.com', 'ANY');
    expect(r.allowed).toBe(false);
    expect(r.flag).toBe('suspicious');
    const body = await r.response!.json() as any;
    expect(body.Status).toBe(5);
  });

  it('refuses wire ANY queries with wire RCODE=5, echoing the ID', async () => {
    const query = buildWireQuery('example.com', { id: 0xfeed, qtype: 255 });
    const r = checkWireAbuse('198.51.100.10', 'example.com', query.slice().buffer as ArrayBuffer);
    expect(r.allowed).toBe(false);
    const bytes = new Uint8Array(await r.response!.arrayBuffer());
    expect(bytes[0]).toBe(0xfe);
    expect(bytes[1]).toBe(0xed);
    expect(bytes[3] & 0x0f).toBe(5); // REFUSED
  });

  it('refuses CHAOS-class wire queries', () => {
    const query = buildWireQuery('version.bind', { qtype: 16, qclass: 3 });
    const r = checkWireAbuse('198.51.100.11', 'version.bind', query.slice().buffer as ArrayBuffer);
    expect(r.allowed).toBe(false);
  });
});
