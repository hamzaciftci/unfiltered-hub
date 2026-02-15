/**
 * UnfilteredHub — Query Statistics
 * Tracks DNS query stats using KV with sampling to stay within free tier limits.
 * Uses ctx.waitUntil() for non-blocking writes.
 */

export interface DailyStats {
  total: number;
  blocked: number;
  cached: number;
  /** Queries refused by abuse protection (sampled) */
  abused: number;
  date: string;
}

const STATS_PREFIX = 'stats:';
const SAMPLE_RATE = 10; // Write every Nth request, multiply counters by N

// In-memory counter per isolate — used for sampling
let requestCounter = 0;

/**
 * Get the current date key in YYYY-MM-DD format (UTC).
 */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record a DNS query in statistics.
 * Uses sampling: only writes to KV every SAMPLE_RATE requests.
 * Call with ctx.waitUntil() for non-blocking operation.
 */
export async function recordQuery(
  kv: KVNamespace | undefined,
  opts: { blocked: boolean; cached: boolean; abused?: boolean },
): Promise<void> {
  if (!kv) return;

  requestCounter++;
  if (requestCounter % SAMPLE_RATE !== 0) return;

  const key = `${STATS_PREFIX}${todayKey()}`;

  try {
    // Read current stats
    const existing = await kv.get(key, 'json') as DailyStats | null;
    const stats: DailyStats = existing || {
      total: 0,
      blocked: 0,
      cached: 0,
      abused: 0,
      date: todayKey(),
    };

    // Backfill for records created before abused field existed
    if (typeof stats.abused !== 'number') stats.abused = 0;

    // Increment by SAMPLE_RATE to account for sampling
    stats.total += SAMPLE_RATE;
    if (opts.blocked) stats.blocked += SAMPLE_RATE;
    if (opts.cached) stats.cached += SAMPLE_RATE;
    if (opts.abused) stats.abused += SAMPLE_RATE;

    // Write back with 48h expiration (auto-cleanup old stats)
    await kv.put(key, JSON.stringify(stats), { expirationTtl: 172800 });
  } catch {
    // Stats are non-critical, never fail the request
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
 * Get stats for the last N days.
 */
export async function getWeeklyStats(
  kv: KVNamespace | undefined,
  days: number = 7,
): Promise<DailyStats[]> {
  if (!kv) return [];

  const results: DailyStats[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const stats = await getStats(kv, dateStr);
    if (stats) {
      results.push(stats);
    } else {
      results.push({ total: 0, blocked: 0, cached: 0, abused: 0, date: dateStr });
    }
  }

  return results;
}
