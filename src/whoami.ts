/**
 * UnfilteredHub — /whoami Endpoint
 * Connection diagnostic for users: shows resolver, cache status,
 * abuse flag, country, and DNSSEC mode without exposing the real IP.
 *
 * Two modes:
 *   - Accept: application/json → JSON response
 *   - Browser (default)        → HTML UI with green checkmark
 */

import { getScoreHeader, getUpstreams, type DnsUpstream } from './resolver';
import { escHtml, getClientIp, detectLang, type Lang } from './utils';

/* ── Types ─────────────────────────────────────────────── */

interface WhoAmIData {
  using_unfilteredhub: true;
  client_id: string;
  resolver: string;
  resolver_scores: string;
  cache: string;
  abuse_flag: string;
  country: string;
  dnssec: string;
  user_agent: string;
  timestamp: number;
}

/* ── IP Hashing (privacy-preserving) ───────────────────── */

/**
 * Hash the client IP with SHA-256, return first 12 hex chars.
 * Never exposes the real IP — only a short, irreversible fingerprint.
 */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + ':unfilteredhub-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 12);
}

/* ── JSON Response ─────────────────────────────────────── */

function buildJsonResponse(data: WhoAmIData): Response {
  return Response.json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

/* ── HTML UI ───────────────────────────────────────────── */

function buildHtmlResponse(data: WhoAmIData, lang: Lang): Response {
  const t = lang === 'tr' ? {
    title: 'Bağlantı Durumu',
    connected: 'UnfilteredHub\'a Bağlısınız',
    clientId: 'Cihaz Kimliği',
    resolver: 'DNS Resolver',
    cache: 'Önbellek',
    abuseFlag: 'Güvenlik Durumu',
    country: 'Konum',
    dnssec: 'DNSSEC',
    userAgent: 'Tarayıcı',
    timestamp: 'Zaman',
    desc: 'DNS sorgularınız HTTPS ile şifrelenerek gönderiliyor.',
    flagClean: 'Temiz',
    flagSuspicious: 'Şüpheli',
    flagRateLimited: 'Hız Sınırı',
    cacheEnabled: 'Aktif',
    back: 'Ana Sayfa',
  } : {
    title: 'Connection Status',
    connected: 'Connected to UnfilteredHub',
    clientId: 'Client ID',
    resolver: 'DNS Resolver',
    cache: 'Cache',
    abuseFlag: 'Security Status',
    country: 'Location',
    dnssec: 'DNSSEC',
    userAgent: 'Browser',
    timestamp: 'Timestamp',
    desc: 'Your DNS queries are encrypted over HTTPS.',
    flagClean: 'Clean',
    flagSuspicious: 'Suspicious',
    flagRateLimited: 'Rate Limited',
    cacheEnabled: 'Enabled',
    back: 'Home',
  };

  const flagLabel = data.abuse_flag === 'clean' ? t.flagClean
    : data.abuse_flag === 'suspicious' ? t.flagSuspicious
    : t.flagRateLimited;

  const flagColor = data.abuse_flag === 'clean' ? '#00c853'
    : data.abuse_flag === 'suspicious' ? '#ff9800'
    : '#f44336';

  const countryDisplay = data.country && data.country !== 'XX'
    ? countryFlag(data.country) + ' ' + data.country
    : '—';

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UnfilteredHub — ${t.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#141414;border:1px solid #222;border-radius:16px;padding:40px;max-width:480px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.check{text-align:center;margin-bottom:24px}
.check svg{width:64px;height:64px}
.check-circle{fill:none;stroke:#00c853;stroke-width:2;stroke-linecap:round;animation:draw .6s ease-out forwards}
.check-mark{fill:none;stroke:#00c853;stroke-width:2;stroke-linecap:round;stroke-dasharray:24;stroke-dashoffset:24;animation:draw .4s ease-out .4s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
h1{text-align:center;font-size:1.25rem;color:#fff;margin-bottom:4px}
.subtitle{text-align:center;font-size:.85rem;color:#888;margin-bottom:28px}
.grid{display:grid;gap:12px}
.row{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1a1a1a;border-radius:10px;border:1px solid #252525}
.row:hover{border-color:#333}
.label{font-size:.8rem;color:#888;text-transform:uppercase;letter-spacing:.5px}
.value{font-size:.9rem;color:#fff;font-weight:500;text-align:right;max-width:60%;word-break:break-all}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:.8rem;font-weight:600;color:#fff}
.footer{text-align:center;margin-top:24px}
.footer a{color:#666;text-decoration:none;font-size:.8rem;transition:color .2s}
.footer a:hover{color:#aaa}
</style>
</head>
<body>
<div class="card">
  <div class="check">
    <svg viewBox="0 0 52 52">
      <circle class="check-circle" cx="26" cy="26" r="24" stroke-dasharray="150" stroke-dashoffset="150"/>
      <path class="check-mark" d="M14 27l8 8 16-16"/>
    </svg>
  </div>
  <h1>${t.connected}</h1>
  <p class="subtitle">${t.desc}</p>
  <div class="grid">
    <div class="row">
      <span class="label">${t.clientId}</span>
      <span class="value" style="font-family:monospace;font-size:.8rem;color:#888">${escHtml(data.client_id)}</span>
    </div>
    <div class="row">
      <span class="label">${t.resolver}</span>
      <span class="value">${escHtml(data.resolver)}</span>
    </div>
    <div class="row">
      <span class="label">${t.cache}</span>
      <span class="value">${escHtml(data.cache === 'enabled' ? t.cacheEnabled : data.cache)}</span>
    </div>
    <div class="row">
      <span class="label">${t.abuseFlag}</span>
      <span class="value"><span class="badge" style="background:${flagColor}">${flagLabel}</span></span>
    </div>
    <div class="row">
      <span class="label">${t.country}</span>
      <span class="value">${countryDisplay}</span>
    </div>
    <div class="row">
      <span class="label">${t.dnssec}</span>
      <span class="value">${escHtml(data.dnssec)}</span>
    </div>
  </div>
  <div class="footer">
    <a href="/">${t.back}</a>
  </div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/* ── Helpers ───────────────────────────────────────────── */

/**
 * Convert 2-letter country code to flag emoji.
 * Each letter maps to a regional indicator symbol: A=🇦 B=🇧 etc.
 */
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const base = 0x1F1E6 - 65; // 'A' = 65
  return String.fromCodePoint(
    base + code.charCodeAt(0),
    base + code.charCodeAt(1),
  );
}

/* ── Public handler ────────────────────────────────────── */

/**
 * Handle GET /whoami
 * Returns JSON or HTML based on Accept header.
 */
export async function handleWhoAmI(
  request: Request,
  upstreams: DnsUpstream[],
): Promise<Response> {
  const clientIp = getClientIp(request);

  const clientId = await hashIp(clientIp);
  const country = request.headers.get('CF-IPCountry') || 'XX';
  const userAgent = request.headers.get('User-Agent') || '';

  // Best resolver = first in score-sorted list
  const bestResolver = upstreams[0]?.name || 'Unknown';
  const scores = getScoreHeader(upstreams);

  const data: WhoAmIData = {
    using_unfilteredhub: true,
    client_id: clientId,
    resolver: bestResolver,
    resolver_scores: scores,
    cache: 'enabled',
    abuse_flag: 'clean',
    country,
    dnssec: 'auto',
    user_agent: userAgent,
    timestamp: Date.now(),
  };

  // JSON if explicitly requested
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return buildJsonResponse(data);
  }

  const url = new URL(request.url);
  return buildHtmlResponse(data, detectLang(url, request));
}
