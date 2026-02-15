# UnfilteredHub — Production Readiness Checklist

## 1. Worker Request Limits

| Metric | Value | Limit (Free) | Status |
|--------|-------|-------------|--------|
| Subrequests per DNS query | 3–5 max | 50 | OK |
| Upstream timeout per resolver | 3 000 ms | 30 000 ms CPU wall | OK |
| Worst-case total latency | ~9 000 ms (3×3s) | 30 000 ms wall | OK |
| Bundle size | 163.52 KiB (41.49 gzip) | 10 MB | OK |
| KV reads per query | 2–3 (blocklist + abuse) | 1 000/day free | WATCH |
| KV writes per query | 1 sampled (1-in-10) | 1 000/day free | WATCH |

- [ ] **KV free-tier budget**: At 1 000 KV writes/day with 10x sampling, the ceiling is ~10 000 queries/day before writes are exhausted. Stats + abuse counters both write. Monitor daily KV usage in Cloudflare dashboard.
- [ ] **Subrequest breakdown**: JSON cache HIT = 0 fetch, cache MISS = 1–3 upstream + 1–2 KV reads. Wire queries skip cache, always fetch upstream. Peak subrequest count ~5 — well within the 50 limit.
- [ ] **CPU time**: All synchronous ops are sub-millisecond (Set.has, DGA entropy, wire parsing). No large loops or blocking computation.

## 2. KV Failure Behavior

| Component | KV Purpose | Failure Mode | Impact |
|-----------|-----------|--------------|--------|
| `blocker.ts` | Extended blocklist lookup | **FAIL-OPEN** | KV domains not blocked, core list still active |
| `abuse.ts` | Per-IP rate limit counters | **FAIL-OPEN** | No rate limiting, all queries pass |
| `stats.ts` | Daily query counters | **FAIL-OPEN** | Stats not recorded, zero impact on DNS |
| `rateLimiter.ts` | Admin brute-force protection | **FAIL-OPEN** | No admin rate limiting |
| `admin.ts` | Blocklist CRUD operations | **FAIL-CLOSED (503)** | Admin API returns 503, DNS unaffected |
| `cache.ts` | DNS response cache | **N/A** (uses Cache API, not KV) | Falls back to upstream |

- [ ] **Design decision**: All DNS-critical paths fail-open. KV outage degrades protection but never blocks legitimate DNS queries.
- [ ] **Risk**: If KV goes down, rate limiting and extended blocklist are disabled simultaneously. An attacker could flood during a KV outage. Mitigation: Cloudflare's built-in DDoS protection at the edge.
- [ ] **Admin API**: Correctly fails-closed — admin ops require KV. This is expected behavior.

## 3. Cold Start Impact

| Item | Cold Start Cost | Memory |
|------|----------------|--------|
| `CORE_BLOCKLIST` Set (294 domains) | Set construction from literal array | ~15–20 KB |
| `statsMap` (resolver scores) | Empty Map creation | <1 KB |
| `sortedDomains` (blocklist viewer) | Lazy — only on `/blocklist` access | ~15 KB when triggered |
| `requestCounter` | Single number | 8 bytes |

- [ ] **Acceptable**: Total module-level allocation is ~20 KB. No file I/O, no network calls during module init. Cold start is dominated by V8 isolate creation (Cloudflare-managed), not application code.
- [ ] **Blocklist size ceiling**: The 294-domain Set is inline in the bundle. If the list grows to 5 000+, consider migrating to KV-only with in-memory LRU cache.

## 4. CPU Time Estimation Under Load

| Operation | CPU Time (est.) | Frequency |
|-----------|----------------|-----------|
| `Set.has()` blocklist lookup | <0.01 ms | Every query |
| `isDGA()` entropy calculation | ~0.05 ms | Every query |
| `parseDomainFromWire()` | ~0.02 ms | Wire queries |
| `shannonEntropy()` | ~0.03 ms | DGA-flagged domains |
| `hashIp()` SHA-256 | ~0.1 ms | `/whoami` only |
| QR code generation (setup.ts) | ~5 ms | Client-side JS, not on Worker |

- [ ] **Total CPU per DNS query**: ~0.1 ms sync + network I/O wait. Well within the 10 ms free tier / 50 ms paid tier CPU limits.
- [ ] **No CPU-heavy operations**: All scoring, entropy, and parsing are O(n) on short strings (<100 chars). No recursion, no heavy crypto on hot path.

## 5. Memory Usage Review

| Structure | Scope | Size | Bounded? | Auto-cleanup? |
|-----------|-------|------|----------|---------------|
| `statsMap` (resolver.ts) | Module | 3 entries × ~70 bytes | Yes (3 resolvers) | 10-min window reset |
| `CORE_BLOCKLIST` (blocklist.ts) | Module | 294 strings | Yes (hardcoded) | N/A — constant |
| `sortedDomains` (blocklistViewer.ts) | Module | 294 strings (sorted copy) | Yes (lazy, bounded) | Never — persists per isolate |
| `requestCounter` (stats.ts) | Module | 1 number | Yes | Wraps at Number.MAX_SAFE_INTEGER |
| `VOWELS` Set (abuse.ts) | Module | 10 chars | Yes | N/A — constant |

- [ ] **No unbounded growth**: All in-memory structures are either constant-size or auto-resetting.
- [ ] **No memory leaks**: No event listeners, no growing arrays, no closure captures that prevent GC.
- [ ] **Isolate lifetime**: Cloudflare recycles isolates automatically. Module state resets on recycle.

## 6. Rate Limit Sanity

### DNS Endpoint (`/dns-query`)

| Parameter | Value |
|-----------|-------|
| Max queries/IP/min | 200 |
| Max suspicious/IP/min | 3 |
| Window | 60 seconds |
| Block duration | 5 minutes |
| KV key format | `abuse:{IP}` |
| KV TTL | block_duration + 60s (auto-expire) |

### Admin Endpoint (`/admin/*`)

| Parameter | Value |
|-----------|-------|
| Max failed auth/IP | 10 per 5 min |
| Max total requests/IP | 100 per 10 min |
| Block duration (failed) | 5 minutes |
| Block duration (total) | 10 minutes |
| KV key format | `rl:{IP}` |
| KV TTL | window + 60s (auto-expire) |

- [ ] **200 queries/min is reasonable**: A typical browser makes ~50–100 DNS queries/min during active browsing. 200 provides 2–4x headroom.
- [ ] **Suspicious escalation**: 3 suspicious queries (DGA/ANY) in 60s triggers a 5-min block. This is aggressive enough to stop probing but unlikely to hit normal users.
- [ ] **Admin brute-force**: 10 failed attempts in 5 min → block. Standard for API key auth.
- [ ] **No KV key collision**: DNS abuse uses `abuse:` prefix, admin rate limit uses `rl:` prefix, stats use `stats:` prefix. No overlap.
- [ ] **Auto-cleanup**: All KV rate limit records have `expirationTtl`. No manual cleanup needed.
- [ ] **Race condition**: Concurrent requests from same IP can bypass the rate limit briefly (read-then-write, not atomic). Acceptable for DNS — exact enforcement is not critical.

## 7. Abuse False Positive Risk

### DGA Detection Thresholds

| Heuristic | Threshold | Triggers On |
|-----------|-----------|-------------|
| Long consonant-only | Label >25 chars AND 0 vowels | `bcdfghjklmnpqrstvwxyz12345.evil.com` |
| High entropy | Label >10 chars AND entropy >3.5 bits | `k8s3d9f2x1z7w4q6.api.com` |

### False Positive Analysis

| Domain Pattern | Length | Entropy | Vowels | DGA? | Risk |
|----------------|--------|---------|--------|------|------|
| `d111111abcdef8.cloudfront.net` | 14 | ~3.2 | Yes (a,e) | No | Safe |
| `cdn-abc123def456.example.com` | 17 | ~3.5 | Yes (a,e) | Borderline | Low |
| `xyzw1234567890abcdefghijk.api.com` | 24 | ~3.8 | Yes (a,e,i) | No (has vowels) | Safe |
| `bcdfghjklmnpqrstvwxyz12345.evil.com` | 27 | ~3.9 | No | **Yes** | Very rare |
| `a1b2c3d4e5.service.com` | 10 | ~3.3 | Yes (a,e) | No (≤10 chars) | Safe |

- [ ] **DGA flagging is non-blocking**: `isDGA()` returns `allowed: true, flag: 'suspicious'`. Queries are NOT refused — only counted toward the 3-suspicious-per-minute escalation.
- [ ] **Escalation risk**: A user would need 3 high-entropy or vowel-less domain lookups within 60 seconds to trigger a block. This is unlikely for legitimate browsing.
- [ ] **Only checks leftmost label**: TLDs, SLDs, and CDN suffixes are not evaluated. `long-random-string.cloudfront.net` only checks `long-random-string`.
- [ ] **Entropy 3.5 threshold**: Pure random alphanumeric has entropy ~5.17. English words have ~3.0–3.5. The threshold sits at the boundary — some legitimate hash-based subdomains may be flagged but not blocked.

## 8. Cache Invalidation Edge Cases

| Scenario | Behavior | Risk |
|----------|----------|------|
| DNS record TTL changes upstream | Cached response served until old TTL expires | Low — max 3600s (1h) |
| Domain moves to new IP | Stale cache for up to MAX_TTL (3600s) | Medium |
| Newly blocked domain (added to KV) | Cache doesn't serve blocked domains (block check runs before cache) | None |
| Cache API unavailable | Falls back to upstream resolve | None |
| TTL=0 from upstream | Clamped to MIN_TTL (60s) | Low — 60s stale max |
| NXDOMAIN response | Cached with extracted TTL or DEFAULT_TTL (300s) | Low |
| Blocked domain unblocked (removed from KV + core) | Cache was never populated (blocked domains skip cache) | None |

- [ ] **Cache key ignores DO/CD flags**: Cache key = `domain/TYPE`. Two clients, one requesting DNSSEC validation (DO=1) and one not, share the same cached response. AD flag in cached response may not match client expectations.
- [ ] **Wire format queries are not cached**: Only JSON-format DNS queries use the cache. Wire queries always go to upstream. This is by design — wire format responses are harder to parse for TTL.
- [ ] **No manual cache purge**: There is no admin endpoint to purge the Cache API. Entries expire naturally via TTL. If an emergency purge is needed, deploy a code change or use Cloudflare dashboard.
- [ ] **Cache stampede**: Multiple concurrent cache misses for the same domain will all fetch upstream. No mutex/lock. Acceptable — upstream DNS handles concurrent queries fine.

## 9. DNSSEC Behavior Review

| Scenario | AD Flag | CD Flag | RCODE | Correct? |
|----------|---------|---------|-------|----------|
| Allowed query (upstream response) | Preserved from upstream | Preserved from upstream | Preserved | Yes |
| Blocked domain (NXDOMAIN) | `false` | `false` | 3 (NXDOMAIN) | Yes — synthetic response, no DNSSEC |
| Abuse refused | `false` | `false` | 5 (REFUSED) | Yes — not a DNS answer |
| Cached JSON response | Preserved (body is verbatim upstream) | Preserved in body | Preserved | Yes |
| Wire blocked response | Bit 5 of byte 3 = 0 (AD=0) | Not set | 3 (NXDOMAIN) | Yes |
| Wire refused response | Bit 5 of byte 3 = 0 (AD=0) | Not set | 5 (REFUSED) | Yes |

- [ ] **Upstream DNSSEC**: All three upstreams (Cloudflare, Google, Quad9) support DNSSEC validation. The AD flag is set by upstream when the domain validates. UnfilteredHub passes this through transparently.
- [ ] **Synthetic responses**: Blocked and refused responses correctly set AD=false. These are proxy-generated, not DNSSEC-validated.
- [ ] **Client-side DNSSEC**: If a client sets CD=1 (checking disabled), this is forwarded to upstream in JSON format (pass-through). Wire format also passes through.
- [ ] **Cache + DNSSEC**: Cached responses preserve the original AD flag. A response that was AD=true will remain AD=true when served from cache, even if the DNSSEC signature has expired between cache write and read. This is standard behavior for DNS caches.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Worker limits | **PASS** | 5 subrequests max, <0.1ms CPU |
| KV failure | **PASS** | All DNS paths fail-open |
| Cold start | **PASS** | ~20 KB module-level, no I/O |
| CPU time | **PASS** | Sub-millisecond sync ops |
| Memory | **PASS** | All structures bounded |
| Rate limits | **PASS** | 200/min DNS, 10/5min admin auth |
| Abuse FP | **PASS** | DGA flags only, 3-strike escalation |
| Cache | **WARN** | DO/CD flag sharing, no manual purge |
| DNSSEC | **PASS** | AD preserved for upstream, false for synthetic |

### Action Items Before Deploy

1. **Monitor KV usage**: Set up alerting for KV read/write quotas approaching free-tier limits.
2. **Consider DO/CD cache key**: If DNSSEC-strict clients are expected, add DO flag to cache key to prevent AD flag mismatch.
3. **Test with real DNS clients**: Verify behavior with `dig`, `kdig`, Firefox DoH, and iOS/Android private DNS.
4. **Set up Cloudflare Workers analytics**: Monitor error rates, latency percentiles, and cache hit ratio.
5. **Wrangler version**: Currently on 3.114.17, latest is 4.65.0. Update before production deploy.
