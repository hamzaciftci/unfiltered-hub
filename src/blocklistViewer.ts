/**
 * UnfilteredHub — Public Blocklist Viewer
 * Transparent, paginated, searchable view of the embedded core blocklist.
 *
 * Endpoints:
 *   GET /blocklist           → HTML page (paginated, searchable, bilingual)
 *   GET /blocklist?format=json → JSON response
 *   GET /blocklist.txt       → Plain text export (one domain per line)
 *   GET /blocklist.json      → JSON array export
 *
 * Only exposes the embedded CORE_BLOCKLIST.
 * KV custom entries are never shown (privacy of admin config).
 */

import { CORE_BLOCKLIST, CORE_BLOCKLIST_SIZE } from './blocklist';
import { escHtml, detectLang, type Lang } from './utils';

/* ── Constants ─────────────────────────────────────────── */

const PAGE_SIZE = 50;
const CACHE_HEADER = 'public, max-age=300';

/* ── Sorted domain cache (computed once per isolate) ──── */

let sortedDomains: string[] | null = null;

function getDomains(): string[] {
  if (!sortedDomains) {
    sortedDomains = [...CORE_BLOCKLIST].sort();
  }
  return sortedDomains;
}

/* ── Search + Pagination ───────────────────────────────── */

interface PageResult {
  domains: string[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
}

function getPage(page: number, search: string): PageResult {
  let filtered = getDomains();

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(d => d.includes(q));
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const domains = filtered.slice(start, start + PAGE_SIZE);

  return { domains, total, page: safePage, totalPages, search };
}

/* ── Export: Plain Text ────────────────────────────────── */

export function handleBlocklistTxt(): Response {
  const text = getDomains().join('\n');
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="unfilteredhub-blocklist.txt"',
      'Cache-Control': CACHE_HEADER,
      'X-Blocklist-Count': String(CORE_BLOCKLIST_SIZE),
    },
  });
}

/* ── Export: JSON Array ────────────────────────────────── */

export function handleBlocklistJson(): Response {
  return Response.json(getDomains(), {
    headers: {
      'Content-Disposition': 'attachment; filename="unfilteredhub-blocklist.json"',
      'Cache-Control': CACHE_HEADER,
      'X-Blocklist-Count': String(CORE_BLOCKLIST_SIZE),
    },
  });
}

/* ── JSON API Response ─────────────────────────────────── */

function buildJsonResponse(result: PageResult): Response {
  return Response.json({
    blocklist: result.domains,
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    pageSize: PAGE_SIZE,
    search: result.search || null,
    coreSize: CORE_BLOCKLIST_SIZE,
  }, {
    headers: {
      'Cache-Control': CACHE_HEADER,
      'X-Blocklist-Count': String(CORE_BLOCKLIST_SIZE),
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/* ── HTML UI ───────────────────────────────────────────── */

const translations = {
  tr: {
    title: 'Engelleme Listesi',
    subtitle: 'Reklam, izleyici ve zararli yazilim domainleri',
    searchPlaceholder: 'Domain ara...',
    totalDomains: 'Toplam Domain',
    showing: 'Gosterilen',
    of: '/',
    page: 'Sayfa',
    prev: 'Onceki',
    next: 'Sonraki',
    exportTxt: 'TXT Indir',
    exportJson: 'JSON Indir',
    copied: 'Kopyalandi!',
    copy: 'Kopyala',
    noResults: 'Sonuc bulunamadi.',
    results: 'sonuc',
    back: 'Ana Sayfa',
  },
  en: {
    title: 'Blocklist',
    subtitle: 'Ad, tracker, and malware domains',
    searchPlaceholder: 'Search domains...',
    totalDomains: 'Total Domains',
    showing: 'Showing',
    of: 'of',
    page: 'Page',
    prev: 'Previous',
    next: 'Next',
    exportTxt: 'Export TXT',
    exportJson: 'Export JSON',
    copied: 'Copied!',
    copy: 'Copy',
    noResults: 'No results found.',
    results: 'results',
    back: 'Home',
  },
};

function buildHtmlResponse(result: PageResult, lang: Lang): Response {
  const t = translations[lang];

  const domainRows = result.domains.length > 0
    ? result.domains.map((d, i) => {
        const num = (result.page - 1) * PAGE_SIZE + i + 1;
        return `<div class="row">
  <span class="num">${num}</span>
  <span class="domain">${escHtml(d)}</span>
  <button class="copy-btn" onclick="copyDomain('${escHtml(d)}',this)" title="${t.copy}">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
  </button>
</div>`;
      }).join('\n')
    : `<div class="empty">${t.noResults}</div>`;

  const searchQuery = result.search ? `&search=${encodeURIComponent(result.search)}` : '';
  const prevDisabled = result.page <= 1 ? 'disabled' : '';
  const nextDisabled = result.page >= result.totalPages ? 'disabled' : '';
  const prevHref = result.page > 1 ? `/blocklist?page=${result.page - 1}${searchQuery}&lang=${lang}` : '#';
  const nextHref = result.page < result.totalPages ? `/blocklist?page=${result.page + 1}${searchQuery}&lang=${lang}` : '#';

  const showingStart = result.domains.length > 0 ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const showingEnd = (result.page - 1) * PAGE_SIZE + result.domains.length;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UnfilteredHub — ${t.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;padding:20px}
.container{max-width:720px;margin:0 auto}
.header{text-align:center;margin-bottom:32px;padding-top:20px}
h1{font-size:1.5rem;color:#fff;margin-bottom:4px}
.subtitle{color:#888;font-size:.9rem;margin-bottom:20px}
.stats{display:flex;justify-content:center;gap:24px;margin-bottom:24px}
.stat{background:#141414;border:1px solid #222;border-radius:10px;padding:12px 20px;text-align:center}
.stat-value{font-size:1.3rem;font-weight:700;color:#fff}
.stat-label{font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.toolbar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.search-box{flex:1;min-width:200px;position:relative}
.search-box input{width:100%;padding:10px 12px 10px 36px;background:#141414;border:1px solid #333;border-radius:8px;color:#fff;font-size:.9rem;outline:none;transition:border-color .2s}
.search-box input:focus{border-color:#555}
.search-box svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#666}
.export-btns{display:flex;gap:8px}
.btn{padding:8px 16px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#ccc;font-size:.8rem;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:6px;transition:all .2s}
.btn:hover{background:#252525;border-color:#444;color:#fff}
.list{background:#141414;border:1px solid #222;border-radius:12px;overflow:hidden}
.row{display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid #1a1a1a;transition:background .15s}
.row:last-child{border-bottom:none}
.row:hover{background:#1a1a1a}
.num{color:#555;font-size:.75rem;width:36px;text-align:right;margin-right:12px;font-family:monospace}
.domain{flex:1;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:.85rem;color:#e0e0e0;word-break:break-all}
.copy-btn{background:none;border:none;color:#555;cursor:pointer;padding:4px 6px;border-radius:4px;transition:all .15s}
.copy-btn:hover{color:#fff;background:#333}
.copy-btn.ok{color:#00c853}
.empty{padding:40px;text-align:center;color:#666;font-size:.9rem}
.pagination{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:0 4px}
.pagination .info{color:#888;font-size:.8rem}
.pagination .nav{display:flex;gap:8px}
.pagination .btn[disabled]{opacity:.3;pointer-events:none}
.footer{text-align:center;margin-top:32px}
.footer a{color:#555;text-decoration:none;font-size:.8rem;transition:color .2s}
.footer a:hover{color:#aaa}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#00c853;color:#000;padding:8px 20px;border-radius:20px;font-size:.85rem;font-weight:600;opacity:0;transition:opacity .3s;pointer-events:none;z-index:100}
.toast.show{opacity:1}
@media(max-width:480px){.toolbar{flex-direction:column}.export-btns{justify-content:stretch}.export-btns .btn{flex:1;justify-content:center}.stats{flex-direction:column;gap:8px;align-items:center}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${t.title}</h1>
    <p class="subtitle">${t.subtitle}</p>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${CORE_BLOCKLIST_SIZE.toLocaleString()}</div>
        <div class="stat-label">${t.totalDomains}</div>
      </div>
      ${result.search ? `<div class="stat">
        <div class="stat-value">${result.total.toLocaleString()}</div>
        <div class="stat-label">${t.results}</div>
      </div>` : ''}
    </div>
  </div>

  <div class="toolbar">
    <div class="search-box">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input type="text" id="searchInput" placeholder="${t.searchPlaceholder}" value="${escHtml(result.search)}" />
    </div>
    <div class="export-btns">
      <a class="btn" href="/blocklist.txt">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${t.exportTxt}
      </a>
      <a class="btn" href="/blocklist.json">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${t.exportJson}
      </a>
    </div>
  </div>

  <div class="list">
    ${domainRows}
  </div>

  <div class="pagination">
    <span class="info">${t.showing} ${showingStart}–${showingEnd} ${t.of} ${result.total} &middot; ${t.page} ${result.page}/${result.totalPages}</span>
    <div class="nav">
      <a class="btn" href="${prevHref}" ${prevDisabled}>${t.prev}</a>
      <a class="btn" href="${nextHref}" ${nextDisabled}>${t.next}</a>
    </div>
  </div>

  <div class="footer">
    <a href="/">${t.back}</a>
  </div>
</div>

<div class="toast" id="toast">${t.copied}</div>

<script>
// Copy domain
function copyDomain(d,btn){
  navigator.clipboard.writeText(d).then(()=>{
    btn.classList.add('ok');
    const toast=document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(()=>{toast.classList.remove('show');btn.classList.remove('ok')},1500);
  });
}

// Live search with debounce
let timer;
document.getElementById('searchInput').addEventListener('input',function(){
  clearTimeout(timer);
  const q=this.value.trim();
  timer=setTimeout(()=>{
    const params=new URLSearchParams(window.location.search);
    if(q){params.set('search',q)}else{params.delete('search')}
    params.set('page','1');
    if(!params.has('lang'))params.set('lang','${lang}');
    window.location.href='/blocklist?'+params.toString();
  },400);
});

// Enter key for instant search
document.getElementById('searchInput').addEventListener('keydown',function(e){
  if(e.key==='Enter'){
    clearTimeout(timer);
    const q=this.value.trim();
    const params=new URLSearchParams(window.location.search);
    if(q){params.set('search',q)}else{params.delete('search')}
    params.set('page','1');
    if(!params.has('lang'))params.set('lang','${lang}');
    window.location.href='/blocklist?'+params.toString();
  }
});
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE_HEADER,
      'X-Blocklist-Count': String(CORE_BLOCKLIST_SIZE),
    },
  });
}

/* ── Public handler ────────────────────────────────────── */

/**
 * Handle GET /blocklist
 * Supports: ?page=N, ?search=keyword, ?format=json, ?lang=tr|en
 */
export function handleBlocklistPage(request: Request, url: URL): Response {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
  const search = (url.searchParams.get('search') || '').trim();
  const format = url.searchParams.get('format');

  const result = getPage(page, search);

  // JSON format
  if (format === 'json') {
    return buildJsonResponse(result);
  }

  return buildHtmlResponse(result, detectLang(url, request));
}
