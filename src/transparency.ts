/**
 * UnfilteredHub — Transparency Page
 * Public system status: shows how the resolver works without exposing secrets.
 *
 * Visible:  resolvers, scores, policies, blocklist size, region, version
 * Hidden:   ADMIN_KEY, IPs, KV internal keys
 */

import { getScoreHeader, type DnsUpstream } from './resolver';
import { CORE_BLOCKLIST_SIZE } from './blocklist';
import { escHtml, detectLang, type Lang } from './utils';

/* ── Types ─────────────────────────────────────────────── */

const TRANSPARENCY_VERSION = '1.0.0';

interface TransparencyData {
  service: string;
  version: string;
  buildTime: string;
  region: string;
  resolvers: {
    name: string;
    endpoint: string;
    priority: number;
  }[];
  resolverScores: string;
  dnssec: string;
  abuse: {
    enabled: boolean;
    blockedTypes: string[];
    dgaDetection: boolean;
    rateLimit: string;
    suspiciousEscalation: string;
  };
  cache: {
    enabled: boolean;
    backend: string;
    minTTL: number;
    maxTTL: number;
    defaultTTL: number;
    strategy: string;
  };
  blocklist: {
    coreSize: number;
    kvExtensible: boolean;
    sources: string[];
  };
  timestamp: number;
}

/* ── Data builder ──────────────────────────────────────── */

function buildData(
  request: Request,
  upstreams: DnsUpstream[],
  env: { VERSION?: string; BUILD_TIME?: string },
): TransparencyData {
  // Cloudflare request metadata (available in production)
  const cf = (request as any).cf;
  const colo = cf?.colo || 'local';

  return {
    service: 'unfilteredhub-doh',
    version: env.VERSION || '1.0.0',
    buildTime: env.BUILD_TIME || new Date().toISOString(),
    region: colo,
    resolvers: upstreams.map(u => ({
      name: u.name,
      endpoint: u.url,
      priority: u.priority,
    })),
    resolverScores: getScoreHeader(upstreams),
    dnssec: 'auto',
    abuse: {
      enabled: true,
      blockedTypes: ['ANY (QTYPE=255)', 'CHAOS class', 'Oversized TXT (>2048B)'],
      dgaDetection: true,
      rateLimit: '200 queries/min per IP, 5 min block on exceed',
      suspiciousEscalation: '3 suspicious queries/min triggers 5 min IP block',
    },
    cache: {
      enabled: true,
      backend: 'Cloudflare Cache API',
      minTTL: 60,
      maxTTL: 3600,
      defaultTTL: 300,
      strategy: 'Adaptive TTL from upstream DNS response',
    },
    blocklist: {
      coreSize: CORE_BLOCKLIST_SIZE,
      kvExtensible: true,
      sources: ['Steven Black unified hosts', 'AdGuard DNS filter', 'OISD small'],
    },
    timestamp: Date.now(),
  };
}

/* ── JSON response ─────────────────────────────────────── */

function buildJsonResponse(data: TransparencyData): Response {
  return Response.json(data, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Transparency-Version': TRANSPARENCY_VERSION,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/* ── HTML response ─────────────────────────────────────── */

const translations = {
  tr: {
    title: 'Seffaflik Raporu',
    subtitle: 'Sistem durumu ve politikalar',
    version: 'Surum',
    buildTime: 'Derleme Zamani',
    region: 'Bolge',
    resolversTitle: 'DNS Resolver\'lar',
    name: 'Ad',
    endpoint: 'Endpoint',
    priority: 'Oncelik',
    scores: 'Canli Skorlar',
    dnssec: 'DNSSEC',
    abuseTitle: 'Abuse Korumasi',
    status: 'Durum',
    enabled: 'Aktif',
    disabled: 'Devre Disi',
    blockedTypes: 'Engellenen Tipler',
    dgaDetection: 'DGA Tespiti',
    rateLimit: 'Hiz Siniri',
    escalation: 'Eskalasyon',
    cacheTitle: 'Cache Politikasi',
    backend: 'Altyapi',
    minTTL: 'Min TTL',
    maxTTL: 'Max TTL',
    defaultTTL: 'Varsayilan TTL',
    strategy: 'Strateji',
    blocklistTitle: 'Engelleme Listesi',
    coreSize: 'Core Boyutu',
    kvExtensible: 'KV ile Genisletilebilir',
    sources: 'Kaynaklar',
    yes: 'Evet',
    no: 'Hayir',
    seconds: 'saniye',
    back: 'Ana Sayfa',
  },
  en: {
    title: 'Transparency Report',
    subtitle: 'System status and policies',
    version: 'Version',
    buildTime: 'Build Time',
    region: 'Region',
    resolversTitle: 'DNS Resolvers',
    name: 'Name',
    endpoint: 'Endpoint',
    priority: 'Priority',
    scores: 'Live Scores',
    dnssec: 'DNSSEC',
    abuseTitle: 'Abuse Protection',
    status: 'Status',
    enabled: 'Enabled',
    disabled: 'Disabled',
    blockedTypes: 'Blocked Types',
    dgaDetection: 'DGA Detection',
    rateLimit: 'Rate Limit',
    escalation: 'Escalation',
    cacheTitle: 'Cache Policy',
    backend: 'Backend',
    minTTL: 'Min TTL',
    maxTTL: 'Max TTL',
    defaultTTL: 'Default TTL',
    strategy: 'Strategy',
    blocklistTitle: 'Blocklist',
    coreSize: 'Core Size',
    kvExtensible: 'KV Extensible',
    sources: 'Sources',
    yes: 'Yes',
    no: 'No',
    seconds: 'seconds',
    back: 'Home',
  },
};

function buildHtmlResponse(data: TransparencyData, lang: Lang): Response {
  const t = translations[lang];

  const resolverRows = data.resolvers.map(r =>
    `<tr><td>${escHtml(r.name)}</td><td class="mono">${escHtml(r.endpoint)}</td><td>${r.priority}</td></tr>`
  ).join('');

  const scoresParsed = data.resolverScores.split(',').map(s => {
    const [name, score] = s.split('=');
    return `<span class="score-chip">${escHtml(name)} <strong>${score}</strong></span>`;
  }).join(' ');

  const blockedTypesList = data.abuse.blockedTypes
    .map(bt => `<span class="tag">${escHtml(bt)}</span>`).join(' ');

  const sourcesList = data.blocklist.sources
    .map(s => `<span class="tag src">${escHtml(s)}</span>`).join(' ');

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UnfilteredHub — ${t.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;padding:20px}
.container{max-width:760px;margin:0 auto}
.header{text-align:center;margin-bottom:32px;padding-top:20px}
h1{font-size:1.5rem;color:#fff;margin-bottom:4px}
.subtitle{color:#888;font-size:.9rem;margin-bottom:20px}
.meta{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-bottom:8px}
.meta-item{background:#141414;border:1px solid #222;border-radius:8px;padding:8px 14px;font-size:.8rem}
.meta-item .label{color:#888;margin-right:6px}
.meta-item .val{color:#fff;font-weight:600}
.section{background:#141414;border:1px solid #222;border-radius:12px;padding:24px;margin-bottom:16px}
.section h2{font-size:1rem;color:#fff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.section h2 .icon{width:20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;color:#fff}
.icon-r{background:#2979ff}
.icon-a{background:#ff6d00}
.icon-c{background:#00c853}
.icon-b{background:#aa00ff}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;color:#888;font-weight:500;padding:8px 10px;border-bottom:1px solid #252525;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px}
td{padding:8px 10px;border-bottom:1px solid #1a1a1a;color:#ccc}
tr:last-child td{border-bottom:none}
.mono{font-family:'SF Mono',Monaco,Consolas,monospace;font-size:.8rem;color:#888}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a1a1a}
.row:last-child{border-bottom:none}
.row .rl{color:#888;font-size:.85rem}
.row .rv{color:#fff;font-size:.85rem;text-align:right;max-width:65%;word-break:break-word}
.score-chip{display:inline-block;background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:3px 10px;margin:2px;font-size:.8rem;color:#ccc}
.score-chip strong{color:#fff}
.tag{display:inline-block;background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:2px 8px;margin:2px;font-size:.78rem;color:#ccc}
.tag.src{border-color:#2a2a4a;color:#99f}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:.78rem;font-weight:600;color:#fff}
.badge-on{background:#00c853}
.badge-off{background:#666}
.footer{text-align:center;margin-top:28px}
.footer a{color:#555;text-decoration:none;font-size:.8rem;transition:color .2s}
.footer a:hover{color:#aaa}
@media(max-width:480px){.meta{flex-direction:column;align-items:center}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${t.title}</h1>
    <p class="subtitle">${t.subtitle}</p>
    <div class="meta">
      <div class="meta-item"><span class="label">${t.version}:</span><span class="val">${escHtml(data.version)}</span></div>
      <div class="meta-item"><span class="label">${t.region}:</span><span class="val">${escHtml(data.region)}</span></div>
      <div class="meta-item"><span class="label">${t.dnssec}:</span><span class="val">${escHtml(data.dnssec)}</span></div>
    </div>
  </div>

  <div class="section">
    <h2><span class="icon icon-r">R</span> ${t.resolversTitle}</h2>
    <table>
      <tr><th>${t.name}</th><th>${t.endpoint}</th><th>${t.priority}</th></tr>
      ${resolverRows}
    </table>
    <div style="margin-top:12px">
      <div class="rl" style="font-size:.78rem;color:#888;margin-bottom:6px">${t.scores}:</div>
      ${scoresParsed}
    </div>
  </div>

  <div class="section">
    <h2><span class="icon icon-a">A</span> ${t.abuseTitle}</h2>
    <div class="row">
      <span class="rl">${t.status}</span>
      <span class="rv"><span class="badge ${data.abuse.enabled ? 'badge-on' : 'badge-off'}">${data.abuse.enabled ? t.enabled : t.disabled}</span></span>
    </div>
    <div class="row">
      <span class="rl">${t.blockedTypes}</span>
      <span class="rv">${blockedTypesList}</span>
    </div>
    <div class="row">
      <span class="rl">${t.dgaDetection}</span>
      <span class="rv"><span class="badge ${data.abuse.dgaDetection ? 'badge-on' : 'badge-off'}">${data.abuse.dgaDetection ? t.enabled : t.disabled}</span></span>
    </div>
    <div class="row">
      <span class="rl">${t.rateLimit}</span>
      <span class="rv">${escHtml(data.abuse.rateLimit)}</span>
    </div>
    <div class="row">
      <span class="rl">${t.escalation}</span>
      <span class="rv">${escHtml(data.abuse.suspiciousEscalation)}</span>
    </div>
  </div>

  <div class="section">
    <h2><span class="icon icon-c">C</span> ${t.cacheTitle}</h2>
    <div class="row">
      <span class="rl">${t.status}</span>
      <span class="rv"><span class="badge badge-on">${t.enabled}</span></span>
    </div>
    <div class="row">
      <span class="rl">${t.backend}</span>
      <span class="rv">${escHtml(data.cache.backend)}</span>
    </div>
    <div class="row">
      <span class="rl">${t.minTTL}</span>
      <span class="rv">${data.cache.minTTL} ${t.seconds}</span>
    </div>
    <div class="row">
      <span class="rl">${t.maxTTL}</span>
      <span class="rv">${data.cache.maxTTL} ${t.seconds}</span>
    </div>
    <div class="row">
      <span class="rl">${t.defaultTTL}</span>
      <span class="rv">${data.cache.defaultTTL} ${t.seconds}</span>
    </div>
    <div class="row">
      <span class="rl">${t.strategy}</span>
      <span class="rv">${escHtml(data.cache.strategy)}</span>
    </div>
  </div>

  <div class="section">
    <h2><span class="icon icon-b">B</span> ${t.blocklistTitle}</h2>
    <div class="row">
      <span class="rl">${t.coreSize}</span>
      <span class="rv"><strong>${data.blocklist.coreSize.toLocaleString()}</strong> domains</span>
    </div>
    <div class="row">
      <span class="rl">${t.kvExtensible}</span>
      <span class="rv"><span class="badge badge-on">${t.yes}</span></span>
    </div>
    <div class="row">
      <span class="rl">${t.sources}</span>
      <span class="rv">${sourcesList}</span>
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
      'X-Transparency-Version': TRANSPARENCY_VERSION,
    },
  });
}

/* ── Public handler ────────────────────────────────────── */

export function handleTransparency(
  request: Request,
  url: URL,
  upstreams: DnsUpstream[],
  env: { VERSION?: string; BUILD_TIME?: string },
): Response {
  const data = buildData(request, upstreams, env);

  // JSON format
  if (url.searchParams.get('format') === 'json') {
    return buildJsonResponse(data);
  }

  return buildHtmlResponse(data, detectLang(url, request));
}
