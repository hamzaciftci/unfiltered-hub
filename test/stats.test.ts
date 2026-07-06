/**
 * Stats buffering tests: no per-query KV writes, interval-based flush,
 * exact (unsampled) counts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { recordQuery, flushStats, getStats, resetStatsState } from '../src/stats';
import { MockKV } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-06T12:00:00Z'));
  resetStatsState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buffered stats', () => {
  it('1000 recordQuery calls cause ZERO KV writes within the flush interval', async () => {
    const kv = new MockKV();
    for (let i = 0; i < 1000; i++) {
      await recordQuery(kv as any, { blocked: i % 10 === 0, cached: i % 3 === 0 });
    }
    expect(kv.writes).toBe(0);
  });

  it('flushes exact counts after the interval elapses (1 read + 1 write)', async () => {
    const kv = new MockKV();
    for (let i = 0; i < 500; i++) {
      await recordQuery(kv as any, { blocked: i < 50, cached: i < 100 });
    }
    expect(kv.writes).toBe(0);

    // Advance past the 5-minute flush interval; next query triggers the flush
    vi.setSystemTime(new Date('2026-07-06T12:05:01Z'));
    await recordQuery(kv as any, { blocked: false, cached: false });

    expect(kv.writes).toBe(1);
    const stored = await getStats(kv as any);
    expect(stored!.total).toBe(501); // exact, not sampled
    expect(stored!.blocked).toBe(50);
    expect(stored!.cached).toBe(100);
  });

  it('accumulates across flushes on the same day', async () => {
    const kv = new MockKV();
    await recordQuery(kv as any, { blocked: true, cached: false });
    await flushStats(kv as any);

    await recordQuery(kv as any, { blocked: false, cached: true, abused: true });
    await flushStats(kv as any);

    const stored = await getStats(kv as any);
    expect(stored!.total).toBe(2);
    expect(stored!.blocked).toBe(1);
    expect(stored!.cached).toBe(1);
    expect(stored!.abused).toBe(1);
  });

  it('flushStats with an empty buffer is a no-op', async () => {
    const kv = new MockKV();
    await flushStats(kv as any);
    expect(kv.writes).toBe(0);
    expect(kv.reads).toBe(0);
  });

  it('re-buffers counts if the KV write fails (no data loss)', async () => {
    const kv = new MockKV();
    await recordQuery(kv as any, { blocked: true, cached: false });

    const failingKv = {
      get: async () => { throw new Error('kv down'); },
      put: async () => { throw new Error('kv down'); },
    };
    await flushStats(failingKv as any);

    // Counts returned to the buffer → a later flush persists them
    await flushStats(kv as any);
    const stored = await getStats(kv as any);
    expect(stored!.total).toBe(1);
    expect(stored!.blocked).toBe(1);
  });
});
