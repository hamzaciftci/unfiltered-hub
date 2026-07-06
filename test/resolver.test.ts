/**
 * Upstream resolver tests: fallback on failure, fallback on timeout,
 * UPSTREAM env parsing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { resolveJson, getUpstreams, resetResolverStats, UPSTREAMS } from '../src/resolver';

beforeEach(() => {
  resetResolverStats();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('upstream fallback', () => {
  it('falls back to the next resolver when the first fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('cloudflare-dns.com')) {
        throw new TypeError('network error');
      }
      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        headers: { 'Content-Type': 'application/dns-json' },
      });
    });

    const result = await resolveJson('example.com', 'A');
    expect(result.resolver).toBe('Google');
    expect(calls.length).toBe(2);
  });

  it('falls back when the first resolver returns a non-ok status', async () => {
    vi.stubGlobal('fetch', async (input: any) => {
      const url = String(input);
      if (url.includes('cloudflare-dns.com')) {
        return new Response('upstream error', { status: 502 });
      }
      return new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        headers: { 'Content-Type': 'application/dns-json' },
      });
    });

    const result = await resolveJson('example.com', 'A');
    expect(result.resolver).toBe('Google');
  });

  it('falls back when the first resolver hangs until timeout (no infinite wait)', async () => {
    vi.useFakeTimers();

    vi.stubGlobal('fetch', (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('cloudflare-dns.com')) {
        // Hang forever; only the abort signal resolves this promise
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')));
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        headers: { 'Content-Type': 'application/dns-json' },
      }));
    });

    const pending = resolveJson('example.com', 'A');
    await vi.advanceTimersByTimeAsync(3100); // past the 3s upstream timeout
    const result = await pending;
    expect(result.resolver).toBe('Google');
  });

  it('throws when ALL resolvers fail', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('down'); });
    await expect(resolveJson('example.com', 'A')).rejects.toThrow('All upstream DNS resolvers failed');
  });
});

describe('getUpstreams env parsing', () => {
  it('returns defaults without env', () => {
    expect(getUpstreams(undefined)).toEqual(UPSTREAMS);
  });

  it('reorders by user preference and appends the rest', () => {
    const ups = getUpstreams('quad9,google');
    expect(ups.map(u => u.name)).toEqual(['Quad9', 'Google', 'Cloudflare']);
  });

  it('ignores unknown names', () => {
    const ups = getUpstreams('nonexistent,google');
    expect(ups[0].name).toBe('Google');
    expect(ups.length).toBe(3);
  });
});
