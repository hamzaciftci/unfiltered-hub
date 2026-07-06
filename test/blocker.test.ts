/**
 * Blocklist tests: snapshot loading, suffix matching, allowlist override,
 * and the critical KV-read budget (no per-label reads).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  isBlocked,
  invalidateBlocklistCache,
  mutateSnapshot,
  getBlocklistCounts,
  parseSnapshotText,
  serializeSnapshot,
  SNAPSHOT_KEY,
} from '../src/blocker';
import { MockKV } from './helpers';

function kvWithSnapshot(lines: string[]): MockKV {
  const kv = new MockKV();
  kv.store.set(SNAPSHOT_KEY, lines.join('\n'));
  return kv;
}

beforeEach(() => {
  invalidateBlocklistCache();
});

describe('suffix matching', () => {
  it('blocks exact domains from the KV snapshot', async () => {
    const kv = kvWithSnapshot(['ads.example.com']);
    expect(await isBlocked('ads.example.com', kv as any)).toBe(true);
  });

  it('blocks subdomains of a blocked parent (suffix match)', async () => {
    const kv = kvWithSnapshot(['example.com']);
    expect(await isBlocked('a.b.example.com', kv as any)).toBe(true);
    expect(await isBlocked('a.b.example.net', kv as any)).toBe(false); // different TLD not affected
  });

  it('does not block sibling domains', async () => {
    const kv = kvWithSnapshot(['ads.example.com']);
    expect(await isBlocked('mail.example.com', kv as any)).toBe(false);
    expect(await isBlocked('example.com', kv as any)).toBe(false);
  });

  it('blocks core-blocklist domains without KV', async () => {
    expect(await isBlocked('doubleclick.net')).toBe(true);
    expect(await isBlocked('tracker.ads.doubleclick.net')).toBe(true);
    expect(await isBlocked('example.com')).toBe(false);
  });
});

describe('allowlist override', () => {
  it('allowlist entry overrides a block match', async () => {
    const kv = kvWithSnapshot(['tracker.com', '@good.tracker.com']);
    expect(await isBlocked('tracker.com', kv as any)).toBe(true);
    expect(await isBlocked('good.tracker.com', kv as any)).toBe(false);
    expect(await isBlocked('sub.good.tracker.com', kv as any)).toBe(false);
    expect(await isBlocked('bad.tracker.com', kv as any)).toBe(true);
  });

  it('allowlist overrides the CORE blocklist too', async () => {
    const kv = kvWithSnapshot(['@doubleclick.net']);
    expect(await isBlocked('doubleclick.net', kv as any)).toBe(false);
  });
});

describe('KV read budget', () => {
  it('multi-label domains do NOT cause per-label KV reads', async () => {
    const kv = kvWithSnapshot(['example.com']);
    await isBlocked('a.b.c.example.com', kv as any);
    expect(kv.reads).toBe(1); // one snapshot read, not 4 label reads
  });

  it('1000 queries within the TTL cause exactly 1 KV read', async () => {
    const kv = kvWithSnapshot(['blocked.com']);
    for (let i = 0; i < 1000; i++) {
      await isBlocked(`host${i}.example.com`, kv as any);
    }
    expect(kv.reads).toBe(1);
  });
});

describe('snapshot mutation (admin path)', () => {
  it('adds and removes domains with 1 read + 1 write', async () => {
    const kv = kvWithSnapshot(['old.com']);
    const before = { r: kv.reads, w: kv.writes };

    const result = await mutateSnapshot(kv as any, { addBlock: ['new.com', 'new2.com'] });
    expect(result.changed).toBe(2);
    expect(result.block).toBe(3);
    expect(kv.reads - before.r).toBe(1);
    expect(kv.writes - before.w).toBe(1);

    // Mutation refreshes the local cache immediately
    expect(await isBlocked('new.com', kv as any)).toBe(true);
  });

  it('supports allowlist mutations', async () => {
    const kv = kvWithSnapshot(['tracker.com']);
    await mutateSnapshot(kv as any, { addAllow: ['good.tracker.com'] });
    expect(await isBlocked('good.tracker.com', kv as any)).toBe(false);

    const counts = await getBlocklistCounts(kv as any);
    expect(counts.kvBlock).toBe(1);
    expect(counts.kvAllow).toBe(1);
  });
});

describe('snapshot format', () => {
  it('round-trips parse/serialize with comments ignored', () => {
    const snap = parseSnapshotText('# comment\nads.com\n@ok.com\n\nTRACKER.COM');
    expect(snap.block.has('ads.com')).toBe(true);
    expect(snap.block.has('tracker.com')).toBe(true); // lowercased
    expect(snap.allow.has('ok.com')).toBe(true);

    const text = serializeSnapshot(snap);
    const again = parseSnapshotText(text);
    expect(again.block).toEqual(snap.block);
    expect(again.allow).toEqual(snap.allow);
  });
});
