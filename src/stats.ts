/**
 * UnfilteredHub — Query Statistics (buffered, KV-friendly)
 *
 * ── Why buffered ────────────────────────────────────────────
 * The free tier allows 1,000 KV writes/day. Writing per query (even
 * sampled 1/10) burns through that with a single active device.
 *
 * Counters accumulate in per-isolate memory and are flushed to KV at
 * most once per FLUSH_INTERVAL_MS (5 min) → ≤ ~288 writes/day/isolate,
 * regardless of query volume. Counts are EXACT (no sampling); an
 * isolate that dies before its next flush loses at most one buffer's
 * worth of counts — undercounting is the accepted trade-off.
 *
 * Cross-isolate flushes use read-modify-write on the same daily key,
 * so two simultaneous flushes can drop one increment batch. For
 * dashboard statistics this is acceptable; correctness of DNS serving
 * never depends on these numbers.
 */

export interface DailyStats {
  total: number;
  blocked: number;
  cached: number;
  /** Queries refused by abuse protection */
  abused: number;
  date: string;
}

const STATS_PREFIX = 'stats:';
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
/** Safety valve: force a flush if the buffer grows huge before the interval */
const MAX_BUFFERED_EVENTS = 5000;
/** Keep daily keys for 8 days so the 7-day dashboard chart is complete */
const STATS_TTL_SEC = 8 * 24 * 60 * 60;

/* ── In-memory buffer (per isolate) ────────────────────── */

interface StatsBuffer {
  total: number;
  blocked: number;
  cached: number;
  abused: number;
}

function emptyBuffer(): StatsBuffer {
  return { total: 0, blocked: 0, cached: 0, abused: 0 };
}

let buffer = emptyBuffer();
let bufferedEvents = 0;
// Start the clock at isolate birth: short-lived isolates never write,
// long-lived ones flush every FLUSH_INTERVAL_MS.
let lastFlush = Date.now();
let flushing = false;

/** Test helper — reset all buffered state. */
export function resetStatsState(): void {
  buffer = emptyBuffer();
  bufferedEvents = 0;
  lastFlush = Date.now();
  flushing = false;
}

/**
 * Get the current date key in YYYY-MM-DD format (UTC).
 */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record a DNS query in statistics.
 * Increments in-memory counters; only touches KV when the flush
 * interval has elapsed. Call with ctx.waitUntil() so an eventual
 * flush never blocks the response.
 */
export async function recordQuery(
  kv: KVNamespace | undefined,
  opts: { blocked: boolean; cached: boolean; abused?: boolean },
): Promise<void> {
  buffer.total++;
  if (opts.blocked) buffer.blocked++;
  if (opts.cached) buffer.cached++;
  if (opts.abused) buffer.abused++;
  bufferedEvents++;

  if (!kv) return;

  const due = Date.now() - lastFlush >= FLUSH_INTERVAL_MS
    || bufferedEvents >= MAX_BUFFERED_EVENTS;
  if (due) {
    await flushStats(kv);
  }
}

/**
 * Flush buffered counters into today's KV record (read-modify-write).
 * Costs exactly 1 KV read + 1 KV write per flush.
 */
export async function flushStats(kv: KVNamespace): Promise<void> {
  if (flushing || bufferedEvents === 0) return;
  flushing = true;

  const pending = buffer;
  buffer = emptyBuffer();
  bufferedEvents = 0;
  lastFlush = Date.now();

  const key = `${STATS_PREFIX}${todayKey()}`;

  try {
    const existing = await kv.get(key, 'json') as DailyStats | null;
    const stats: DailyStats = existing || {
      total: 0,
      blocked: 0,
      cached: 0,
      abused: 0,
      date: todayKey(),
    };

    // Backfill for records created before the abused field existed
    if (typeof stats.abused !== 'number') stats.abused = 0;

    stats.total += pending.total;
    stats.blocked += pending.blocked;
    stats.cached += pending.cached;
    stats.abused += pending.abused;

    await kv.put(key, JSON.stringify(stats), { expirationTtl: STATS_TTL_SEC });
  } catch {
    // KV failed — return the counts to the buffer so they flush next time
    buffer.total += pending.total;
    buffer.blocked += pending.blocked;
    buffer.cached += pending.cached;
    buffer.abused += pending.abused;
    bufferedEvents += pending.total;
  } finally {
    flushing = false;
  }
}

/**
 * Get stats for a specific date or today.
 */
export async function getStats(
  kv: KVNamespace | undefined,
  date?: string,
): Promise<DailyStats | null> {
  if (!kv) return null;

  const key = `${STATS_PREFIX}${date || todayKey()}`;
  try {
    return await kv.get(key, 'json') as DailyStats | null;
  } catch {
    return null;
  }
}

/**
 * Get stats for the last N days (parallel reads).
 */
export async function getWeeklyStats(
  kv: KVNamespace | undefined,
  days: number = 7,
): Promise<DailyStats[]> {
  if (!kv) return [];

  const now = new Date();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const results = await Promise.all(dates.map((dateStr) => getStats(kv, dateStr)));
  return results.map((stats, i) =>
    stats ?? { total: 0, blocked: 0, cached: 0, abused: 0, date: dates[i] },
  );
}
