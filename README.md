# UnfilteredHub

> **[Turkce dokumantasyon icin / For Turkish documentation: README.tr.md](README.tr.md)**

A self-hosted DNS-over-HTTPS proxy on Cloudflare Workers that encrypts your DNS queries, blocks ads and trackers, and gives you full control over your DNS resolution.

## What It Does

UnfilteredHub sits between your devices and upstream DNS resolvers. Every DNS query from your device travels over HTTPS to your own Cloudflare Worker, which resolves it through one of three upstream providers (Cloudflare, Google, Quad9), applies ad/tracker blocking, caches the result, and returns it encrypted.

- Accepts DNS queries via RFC 8484 (JSON and wireformat, GET and POST)
- Blocks ~300 embedded ad/tracker/malware domains, extensible via KV
- Caches responses using Cloudflare Cache API with upstream TTL awareness
- Selects the fastest upstream resolver using adaptive latency scoring
- Protects against DNS abuse (rate limiting, DGA detection, dangerous query blocking)
- Runs on Cloudflare's edge network (300+ locations, free tier)

## What It Does NOT Do

- **Does not provide anonymity.** Your Worker runs on your Cloudflare account. Cloudflare can see your queries. This encrypts the link between your device and the Worker, preventing ISP/network-level DNS inspection.
- **Does not log individual queries.** Daily aggregate counters (total, blocked, cached) are stored if KV is configured. No per-domain or per-IP query logs exist.
- **Does not filter content.** The blocklist targets advertising, tracking, and malware infrastructure. It does not block categories of websites.
- **Does not replace a VPN.** DNS encryption hides which domains you look up. Your ISP still sees the IP addresses you connect to afterward.
- **Does not guarantee uptime.** It depends on Cloudflare Workers availability and the three upstream resolvers.

## Features

| Category | Feature | Details |
|----------|---------|---------|
| **DNS Proxy** | RFC 8484 DoH | JSON (`?name=&type=`) and wireformat (`?dns=`, POST) |
| **DNS Proxy** | Multi-upstream failover | Cloudflare DNS, Google DNS, Quad9 with adaptive EMA scoring |
| **DNS Proxy** | DNSSEC pass-through | AD flag preserved from upstream; DO flag forwarded and cache-isolated |
| **Blocking** | Embedded core blocklist | ~300 domains (ads, trackers, malware, crypto miners, telemetry) |
| **Blocking** | KV extended blocklist | Add/remove domains via Admin API; supports 80K+ entries |
| **Blocking** | Subdomain matching | `ads.example.com` blocked if `example.com` is in the list |
| **Cache** | Cloudflare Cache API | TTL extracted from upstream response, clamped to 60s–3600s |
| **Cache** | DNSSEC-aware keys | `do=0` and `do=1` cached separately to prevent AD flag mismatch |
| **Abuse** | Per-IP rate limiting | 200 queries/min, KV-backed, 5-min block on exceed |
| **Abuse** | DGA detection | Shannon entropy + vowel heuristic on leftmost label |
| **Abuse** | Dangerous type blocking | ANY, CHAOS, oversized TXT refused with RCODE=5 |
| **Stats** | Sampled daily counters | Total, blocked, cached, abused — 1-in-10 sampling for KV budget |
| **UI** | Landing page | Dark theme, TR/EN, feature showcase, live impact widget |
| **UI** | Setup wizard | 3-step guide with QR code, device detection, connection test |
| **UI** | Admin dashboard | Login, stats cards, 7-day chart, KV blocklist CRUD |
| **UI** | Blocklist viewer | Paginated, searchable, export as TXT/JSON |
| **UI** | Transparency page | Public system status: resolvers, scores, policies, blocklist size |
| **UI** | /whoami diagnostic | Hashed client ID, resolver, cache, abuse flag, country |
| **Profiles** | Apple .mobileconfig | One-tap DoH setup for iOS/iPadOS/macOS |
| **Profiles** | Android guide + config | DNS stamp, app configs (Intra, Nebulo), manual instructions |
| **Admin** | API key auth | X-API-Key header, constant-time compare, optional HMAC-SHA256 |
| **Admin** | IP whitelist | Optional ADMIN_ALLOWED_IPS restriction |
| **Admin** | Brute-force protection | 10 failed attempts/5min triggers IP block |

## Quick Start

**Prerequisites:** Node.js 18+, a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
# 1. Clone and install
git clone https://github.com/AliAnilworker/unfilteredhub-doh.git
cd unfilteredhub-doh && npm install

# 2. Authenticate with Cloudflare
npx wrangler login

# 3. Deploy
npx wrangler deploy
```

Your Worker URL will be printed:

```
Published unfilteredhub-doh
  https://unfilteredhub-doh.YOUR-ACCOUNT.workers.dev
```

Test it:

```bash
curl 'https://unfilteredhub-doh.YOUR-ACCOUNT.workers.dev/dns-query?name=example.com&type=A'
```

**Optional — enable KV for extended blocklist and stats:**

```bash
npx wrangler kv namespace create BLOCKLIST
# Add the returned ID to wrangler.toml under [[kv_namespaces]]
npx wrangler secret put ADMIN_KEY
# Enter a strong key (e.g. openssl rand -hex 32)
npx wrangler deploy
```

## Security Model

**Threat model:** Prevent network-level observers (ISPs, public Wi-Fi operators) from seeing DNS queries in plaintext.

**What is encrypted:**
- Device to Worker: HTTPS (TLS 1.3 on Cloudflare edge)
- Worker to upstream: HTTPS (Cloudflare/Google/Quad9 DoH endpoints)

**What is NOT encrypted:**
- Worker execution context — Cloudflare processes queries in cleartext within the isolate
- IP addresses of resolved domains — visible to the network after DNS resolution

**Authentication layers (Admin API):**

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1 | Rate limiting | 10 failed auth / 5 min, 100 total / 10 min per IP |
| 2 | IP whitelist | Optional `ADMIN_ALLOWED_IPS` env var |
| 3 | API key | `X-API-Key` header, constant-time comparison |
| 4 | HMAC signatures | Optional `X-Timestamp` + `X-Signature`, 5-min replay window |

Query-parameter auth (`?key=`) is explicitly rejected to prevent key leakage in access logs.

**KV failure behavior:** All DNS-critical paths fail-open. If KV is unavailable, rate limiting and extended blocklist are disabled but DNS resolution continues using the embedded core blocklist.

## Abuse Protection

The `/dns-query` endpoint is public. Three layers protect against misuse:

**Layer 1 — Dangerous query blocking.** ANY queries (amplification vector), CHAOS class queries (info disclosure), and oversized TXT queries (>2048 bytes) are refused with DNS RCODE=5 (REFUSED).

**Layer 2 — DGA detection.** Domain labels are checked for bot-generated patterns:
- Labels >25 characters with zero vowels
- Labels >10 characters with Shannon entropy >3.5

DGA-flagged queries are allowed but marked `suspicious`. They are not blocked on first occurrence.

**Layer 3 — Per-IP rate limiting.** KV-backed counters enforce:
- 200 queries/min hard cap — exceed triggers a 5-minute IP block
- 3 suspicious queries/min — exceed triggers a 5-minute IP block

Blocked IPs receive HTTP 429 with `Retry-After` header. Rate limit state auto-expires via KV TTL.

All abuse responses use DNS REFUSED (RCODE=5), not NXDOMAIN, so clients can distinguish "query refused" from "domain does not exist."

## Transparency Philosophy

UnfilteredHub exposes its internals to users rather than hiding them.

- `/transparency` — Public page showing all active resolvers, their live scores, abuse protection thresholds, cache policy, and blocklist sources. No authentication required.
- `/blocklist` — Full searchable, paginated view of every domain in the core blocklist. Export as TXT or JSON.
- `/whoami` — Connection diagnostic showing hashed client ID (SHA-256, first 12 hex chars — never the real IP), active resolver, cache status, abuse flag, and country.
- `/api/impact` — Live stats JSON (total queries, blocked, cache rate, abuse prevented, avg latency) used by the landing page widget. Returns `available: false` when KV is down instead of fabricating numbers.
- `X-Resolver`, `X-Resolver-Score`, `X-Cache`, `X-Abuse-Flag` headers on every DNS response.

Admin API keys, IP whitelists, and KV internal keys are never exposed through any public endpoint.

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │            Cloudflare Worker                │
                         │                                             │
  ┌────────┐   HTTPS     │  ┌─────────┐    ┌──────────┐               │
  │ Device ├────────────►│  │  Router  ├───►│  Abuse   │               │
  └────────┘             │  │ index.ts │    │  Check   │               │
                         │  └────┬────┘    └────┬─────┘               │
                         │       │              │                      │
                         │  ┌────▼────┐    ┌────▼─────┐               │
                         │  │  Block  │    │  Cache   │               │
                         │  │  Check  │    │  Lookup  │               │
                         │  └────┬────┘    └────┬─────┘               │
                         │       │              │                      │
                         │       │         ┌────▼──────────────┐      │
                         │       │         │ Adaptive Resolver │      │
                         │       │         │ (EMA scoring)     │      │
                         │       │         └────┬──────────────┘      │
                         │       │              │                      │
                         └───────┼──────────────┼──────────────────────┘
                                 │              │
                      NXDOMAIN   │              │  HTTPS
                      (blocked)  │              │
                                 │    ┌─────────▼─────────┐
                                 │    │  Cloudflare DNS    │
                                 │    │  Google DNS        │
                                 │    │  Quad9             │
                                 │    └───────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Response flow:          │
                    │  1. Blocklist → NXDOMAIN│
                    │  2. Cache → HIT         │
                    │  3. Upstream → resolve   │
                    │  4. Cache write (bg)     │
                    │  5. Stats record (bg)    │
                    └─────────────────────────┘
```

**Source layout:**

```
src/
├── index.ts           Router, DNS handler orchestration
├── resolver.ts        Multi-upstream with adaptive EMA scoring
├── blocker.ts         Domain matching, NXDOMAIN response builders
├── blocklist.ts       Embedded ~300-domain Set
├── abuse.ts           Rate limiting, DGA detection, type blocking
├── cache.ts           Cache API read/write with DNSSEC-aware keys
├── stats.ts           Sampled KV counters (1-in-10)
├── utils.ts           Shared: escHtml, getClientIp, detectLang, DNS headers
├── admin.ts           Admin API routing (stats, blocklist CRUD)
├── adminAuth.ts       Auth pipeline (API key, HMAC, IP whitelist)
├── rateLimiter.ts     Admin brute-force protection
├── dashboard.ts       Admin dashboard HTML/JS
├── landing.ts         Landing page with impact widget
├── impactWidget.ts    Live stats widget (HTML/CSS/JS)
├── whoami.ts          /whoami endpoint (JSON + HTML)
├── transparency.ts    /transparency endpoint
├── blocklistViewer.ts /blocklist paginated viewer
├── setup.ts           Setup wizard with QR code encoder
├── apple-profile.ts   iOS/macOS .mobileconfig generator
└── android-profile.ts Android guide, DNS stamp, JSON config
```

## Limitations

- **Cloudflare Workers free tier**: 100,000 requests/day, 10ms CPU/request, 1,000 KV writes/day. Sufficient for personal use (one household). Not designed for public resolver scale.
- **KV write budget**: With 10x sampling, stats + abuse counters support ~10,000 queries/day before hitting the 1,000 KV writes/day free limit. Paid Workers removes this constraint.
- **No KV = degraded protection**: Without KV configured, rate limiting, extended blocklist, and stats are all disabled. The core embedded blocklist and upstream resolution still work.
- **Cache does not cover wireformat**: Only JSON-format DNS queries are cached. Wireformat (binary) queries always go to upstream. This is by design — wireformat responses are harder to parse for TTL extraction.
- **Android Private DNS limitation**: Android's native Private DNS uses DNS-over-TLS (DoT), which Cloudflare Workers cannot serve. Android users must use app-level DoH (Chrome, Firefox, Intra) or the setup wizard's guide.
- **No manual cache purge endpoint**: Cached DNS entries expire naturally via TTL (60s–3600s). There is no admin endpoint to force-purge a cached entry.
- **Stats are estimates**: The 1-in-10 sampling means reported numbers are `actual_count * 10`. Precision is traded for KV write budget.
- **Single-region KV consistency**: KV is eventually consistent. Rate limit counters may allow brief bursts above threshold during cross-region propagation (~60s window).

## Production Checklist

See [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) for a detailed review of:

- Worker request limits and CPU time estimation
- KV failure behavior (fail-open vs fail-closed) for every component
- Cold start impact and memory usage
- Rate limit threshold analysis
- DGA false positive risk assessment
- Cache invalidation edge cases
- DNSSEC AD flag consistency

## License

[MIT](LICENSE)
