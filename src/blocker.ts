/**
 * UnfilteredHub — DNS Blocker Engine
 * Checks domains against the embedded core blocklist + an optional
 * KV-backed extended blocklist/allowlist snapshot.
 *
 * ── Snapshot model (why not one KV key per domain) ──────────
 * The previous design stored each blocked domain as its own KV key and
 * issued one kv.get PER LABEL LEVEL per DNS query (a.b.c.example.com =
 * 4 reads). At the free tier's 100k reads/day that dies quickly, and it
 * adds per-query latency.
 *
 * Now the entire extended list lives in ONE KV value ("snapshot"):
 *
 *   KV key:   bl:snapshot:v1
 *   Format:   plain text, one domain per line
 *             "example.com"    → blocked (subdomains too)
 *             "@good.com"      → allowlisted (overrides any block match)
 *             "# comment"      → ignored
 *
 * Each isolate loads the snapshot once and caches the parsed Sets in
 * memory for SNAPSHOT_TTL_MS (5 min) → at most ~1 KV read / 5 min / isolate,
 * ZERO KV reads on the hot path. Refresh happens in the background
 * (stale-while-revalidate) so DNS latency is never blocked by KV.
 *
 * Admin mutations write the snapshot back (1 read + 1 write per call)
 * and invalidate the local cache immediately; other isolates converge
 * within the TTL.
 */

import { CORE_BLOCKLIST } from './blocklist';
import { parseDomainFromWire } from './dnsWire';

// Re-export for existing consumers (index.ts historically imported it here)
export { parseDomainFromWire };

/* ── Constants ─────────────────────────────────────────── */

export const SNAPSHOT_KEY = 'bl:snapshot:v1';
const SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── Snapshot state (module-level, per isolate) ────────── */

export interface BlocklistSnapshot {
  block: Set<string>;
  allow: Set<string>;
}

const EMPTY_SNAPSHOT: BlocklistSnapshot = { block: new Set(), allow: new Set() };

let cached: BlocklistSnapshot | null = null;
let cachedAt = 0;
let inflight: Promise<BlocklistSnapshot> | null = null;

/** Test/ops helper — drop the in-memory snapshot so the next query reloads. */
export function invalidateBlocklistCache(): void {
  cached = null;
  cachedAt = 0;
  inflight = null;
}

/* ── Snapshot parsing / serialization ──────────────────── */

export function parseSnapshotText(text: string): BlocklistSnapshot {
  const block = new Set<string>();
  const allow = new Set<string>();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().toLowerCase();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('@')) {
      const d = line.slice(1).trim();
      if (d) allow.add(d);
    } else {
      block.add(line);
    }
  }

  return { block, allow };
}

export function serializeSnapshot(snapshot: BlocklistSnapshot): string {
  const lines: string[] = [];
  for (const d of [...snapshot.allow].sort()) lines.push(`@${d}`);
  for (const d of [...snapshot.block].sort()) lines.push(d);
  return lines.join('\n');
}

/* ── Snapshot loading (stale-while-revalidate) ─────────── */

async function fetchSnapshot(kv: KVNamespace): Promise<BlocklistSnapshot> {
  try {
    const text = await kv.get(SNAPSHOT_KEY);
    const snap = text ? parseSnapshotText(text) : { block: new Set<string>(), allow: new Set<string>() };
    cached = snap;
    cachedAt = Date.now();
    return snap;
  } catch {
    // KV unavailable → keep whatever we had (or empty); retry after TTL
    cachedAt = Date.now();
    return cached ?? EMPTY_SNAPSHOT;
  } finally {
    inflight = null;
  }
}

/**
 * Get the current snapshot without blocking the hot path:
 *   - cache fresh   → return it (0 KV ops)
 *   - cache stale   → return stale data, refresh in background
 *   - first load    → await one KV read (per isolate lifetime)
 */
export function getSnapshot(
  kv: KVNamespace | undefined,
): BlocklistSnapshot | Promise<BlocklistSnapshot> {
  if (!kv) return cached ?? EMPTY_SNAPSHOT;

  const fresh = cached && Date.now() - cachedAt <= SNAPSHOT_TTL_MS;
  if (cached && fresh) return cached;

  if (cached) {
    // Stale: serve old data now, revalidate in background
    if (!inflight) inflight = fetchSnapshot(kv);
    return cached;
  }

  // Cold start: must await the first load
  if (!inflight) inflight = fetchSnapshot(kv);
  return inflight;
}

/** Counts for admin/stats/transparency (may trigger one KV read on cold start). */
export async function getBlocklistCounts(
  kv: KVNamespace | undefined,
): Promise<{ core: number; kvBlock: number; kvAllow: number }> {
  const snap = await getSnapshot(kv);
  return { core: CORE_BLOCKLIST.size, kvBlock: snap.block.size, kvAllow: snap.allow.size };
}

/* ── Domain matching ───────────────────────────────────── */

function matchesSuffix(normalized: string, set: Set<string>): boolean {
  const parts = normalized.split('.');
  // Check each level: a.b.example.com → a.b.example.com, b.example.com, example.com
  for (let i = 0; i < Math.max(1, parts.length - 1); i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/**
 * Check if a domain (or any of its parent domains) is blocked.
 * Allowlist entries override block matches at any level.
 * Pure in-memory after the snapshot is loaded — no per-query KV reads.
 */
export async function isBlocked(
  domain: string,
  kv?: KVNamespace,
): Promise<boolean> {
  const normalized = domain.toLowerCase().replace(/\.$/, '');
  if (!normalized) return false;

  const snap = await getSnapshot(kv);

  // Allowlist wins — never block explicitly allowed domains
  if (matchesSuffix(normalized, snap.allow)) return false;

  if (matchesSuffix(normalized, snap.block)) return true;
  return matchesSuffix(normalized, CORE_BLOCKLIST);
}

/* ── Snapshot mutation (admin API) ─────────────────────── */

export interface SnapshotMutation {
  addBlock?: string[];
  removeBlock?: string[];
  addAllow?: string[];
  removeAllow?: string[];
}

function normalizeDomains(domains: string[]): string[] {
  return domains
    .map((d) => d.toLowerCase().trim().replace(/\.$/, ''))
    .filter((d) => d.length > 0 && d.includes('.'));
}

/**
 * Apply a mutation to the KV snapshot (read-modify-write) and refresh
 * the local in-memory cache. Costs exactly 1 KV read + 1 KV write.
 * Returns the new counts.
 */
export async function mutateSnapshot(
  kv: KVNamespace,
  mutation: SnapshotMutation,
): Promise<{ block: number; allow: number; changed: number }> {
  const text = (await kv.get(SNAPSHOT_KEY)) ?? '';
  const snap = parseSnapshotText(text);
  let changed = 0;

  for (const d of normalizeDomains(mutation.addBlock ?? [])) {
    if (!snap.block.has(d)) { snap.block.add(d); changed++; }
  }
  for (const d of normalizeDomains(mutation.removeBlock ?? [])) {
    if (snap.block.delete(d)) changed++;
  }
  for (const d of normalizeDomains(mutation.addAllow ?? [])) {
    if (!snap.allow.has(d)) { snap.allow.add(d); changed++; }
  }
  for (const d of normalizeDomains(mutation.removeAllow ?? [])) {
    if (snap.allow.delete(d)) changed++;
  }

  if (changed > 0) {
    await kv.put(SNAPSHOT_KEY, serializeSnapshot(snap));
  }

  // This isolate sees the change immediately; others converge within TTL
  cached = snap;
  cachedAt = Date.now();

  return { block: snap.block.size, allow: snap.allow.size, changed };
}

/* ── Blocked DNS response builders ─────────────────────── */

/**
 * Build a blocked DNS response in JSON format (application/dns-json).
 * Returns NXDOMAIN (Status: 3) with no answers.
 */
export function buildBlockedJsonResponse(): Response {
  return new Response(
    JSON.stringify({
      Status: 3, // NXDOMAIN
      TC: false,
      RD: true,
      RA: true,
      AD: false,
      CD: false,
      Question: [],
      Answer: [],
      Comment: 'Blocked by UnfilteredHub',
    }),
    {
      headers: {
        'Content-Type': 'application/dns-json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

/**
 * Build a blocked DNS response in wireformat (application/dns-message).
 * Creates a minimal NXDOMAIN response matching the query ID.
 */
export function buildBlockedWireResponse(queryBuffer: ArrayBuffer): Response {
  const query = new Uint8Array(queryBuffer);

  // Minimum valid DNS message is 12 bytes (header only)
  if (query.length < 12) {
    return new Response('Invalid DNS query', { status: 400 });
  }

  // Build response header:
  // - Copy query ID (bytes 0-1)
  // - Set QR=1, OPCODE=0, AA=0, TC=0, RD=1, RA=1, RCODE=3 (NXDOMAIN)
  const response = new Uint8Array(query.length);
  response.set(query); // Copy the entire query

  // Byte 2: QR=1 (bit 7), RD=1 (bit 0) → 0x81
  response[2] = 0x81;
  // Byte 3: RA=1 (bit 7), RCODE=3 (bits 0-3) → 0x83
  response[3] = 0x83;
  // ANCOUNT = 0
  response[6] = 0;
  response[7] = 0;
  // NSCOUNT = 0
  response[8] = 0;
  response[9] = 0;
  // ARCOUNT = 0
  response[10] = 0;
  response[11] = 0;

  return new Response(response, {
    headers: {
      'Content-Type': 'application/dns-message',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
