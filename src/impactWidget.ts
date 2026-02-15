/**
 * UnfilteredHub — Impact Widget
 * Public metrics display for the landing page.
 *
 * Server-side:  builds JSON from sampled KV stats + in-memory resolver latency.
 * Client-side:  auto-refreshes every 30 seconds via lightweight fetch.
 *
 * Shows: total queries, blocked, cache hit rate %, abuse prevented, avg latency.
 * Never fabricates numbers — shows "unavailable" when KV is down.
 */

import { getStats, type DailyStats } from './stats';
import { getBestLatency, type DnsUpstream } from './resolver';
import type { Lang } from './utils';

/* ── Types ─────────────────────────────────────────────── */

export interface ImpactData {
  available: boolean;
  totalQueries: number;
  blockedQueries: number;
  cacheHitRate: number;
  abusePrevented: number;
  avgLatencyMs: number;
  date: string;
  sampled: true;
}

/* ── API handler ───────────────────────────────────────── */

/**
 * Build impact data from existing KV stats + in-memory resolver latency.
 * Returns available=false when KV is unreachable (never fakes data).
 */
export async function getImpactData(
  kv: KVNamespace | undefined,
  upstreams: DnsUpstream[],
): Promise<ImpactData> {
  const stats = await getStats(kv);

  if (!stats) {
    return {
      available: false,
      totalQueries: 0,
      blockedQueries: 0,
      cacheHitRate: 0,
      abusePrevented: 0,
      avgLatencyMs: getBestLatency(upstreams),
      date: new Date().toISOString().slice(0, 10),
      sampled: true,
    };
  }

  const cacheHitRate = stats.total > 0
    ? Math.round((stats.cached / stats.total) * 100)
    : 0;

  return {
    available: true,
    totalQueries: stats.total,
    blockedQueries: stats.blocked,
    cacheHitRate,
    abusePrevented: stats.abused || 0,
    avgLatencyMs: getBestLatency(upstreams),
    date: stats.date,
    sampled: true,
  };
}

/**
 * Handle GET /api/impact — returns JSON impact data.
 */
export async function handleImpactApi(
  kv: KVNamespace | undefined,
  upstreams: DnsUpstream[],
): Promise<Response> {
  const data = await getImpactData(kv, upstreams);
  return Response.json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

/* ── Widget HTML/CSS/JS (injected into landing page) ──── */

const widgetTranslations = {
  tr: {
    title: 'Canli Istatistikler',
    totalQueries: 'Toplam Sorgu',
    blocked: 'Engellenen',
    cacheHit: 'Cache Isabet',
    abusePrevented: 'Abuse Onlendi',
    avgLatency: 'Ort. Gecikme',
    sampled: 'Yaklasik degerler (orneklemeli metrik)',
    unavailable: 'Istatistikler gecici olarak kullanilamiyor',
    today: 'Bugun',
  },
  en: {
    title: 'Live Impact',
    totalQueries: 'Total Queries',
    blocked: 'Blocked',
    cacheHit: 'Cache Hit',
    abusePrevented: 'Abuse Prevented',
    avgLatency: 'Avg. Latency',
    sampled: 'Approximate values (sampled metrics)',
    unavailable: 'Statistics temporarily unavailable',
    today: 'Today',
  },
};

/**
 * Generate the HTML fragment for the impact widget.
 * Designed to be injected into the landing page between hero and features.
 */
export function generateImpactWidgetHtml(lang: Lang): string {
  const t = widgetTranslations[lang];

  return `
<section class="section impact-section" id="impact">
  <div class="impact-widget" id="impactWidget">
    <div class="impact-header">
      <h3 class="impact-title">${t.title}</h3>
      <span class="impact-badge">${t.today}</span>
    </div>
    <div class="impact-grid" id="impactGrid">
      <div class="impact-card">
        <div class="impact-value" id="iw-total">—</div>
        <div class="impact-label">${t.totalQueries}</div>
      </div>
      <div class="impact-card">
        <div class="impact-value" id="iw-blocked">—</div>
        <div class="impact-label">${t.blocked}</div>
      </div>
      <div class="impact-card">
        <div class="impact-value" id="iw-cache">—</div>
        <div class="impact-label">${t.cacheHit}</div>
      </div>
      <div class="impact-card">
        <div class="impact-value" id="iw-abuse">—</div>
        <div class="impact-label">${t.abusePrevented}</div>
      </div>
      <div class="impact-card">
        <div class="impact-value" id="iw-latency">—</div>
        <div class="impact-label">${t.avgLatency}</div>
      </div>
    </div>
    <div class="impact-footer" id="impactFooter">
      <span class="impact-dot"></span>
      <span>${t.sampled}</span>
    </div>
    <div class="impact-unavailable" id="impactUnavailable" style="display:none">
      ${t.unavailable}
    </div>
  </div>
</section>`;
}

/**
 * Generate the CSS for the impact widget (appended to landing <style>).
 */
export function generateImpactWidgetCss(): string {
  return `
/* Impact Widget */
.impact-section{padding:2rem 2rem 0}
.impact-widget{
  max-width:800px;margin:0 auto;
  background:var(--bg2);border:1px solid rgba(108,99,255,0.15);
  border-radius:var(--radius);padding:1.5rem 2rem;
  position:relative;overflow:hidden;
}
.impact-widget::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent));
  background-size:200% 100%;
  animation:impactShimmer 3s linear infinite;
}
@keyframes impactShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.impact-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem}
.impact-title{font-size:1rem;color:var(--text);font-weight:600;margin:0}
.impact-badge{
  font-size:0.7rem;padding:3px 10px;border-radius:12px;
  background:rgba(78,205,196,0.15);color:var(--accent2);font-weight:600;
  text-transform:uppercase;letter-spacing:0.5px;
}
.impact-grid{
  display:grid;grid-template-columns:repeat(5,1fr);gap:12px;
}
.impact-card{
  text-align:center;padding:12px 6px;
  background:rgba(10,10,15,0.5);border-radius:8px;
  border:1px solid rgba(255,255,255,0.04);
  transition:border-color 0.3s;
}
.impact-card:hover{border-color:rgba(108,99,255,0.2)}
.impact-value{
  font-size:1.4rem;font-weight:700;
  color:var(--accent2);margin-bottom:2px;
  font-variant-numeric:tabular-nums;
  min-height:2rem;display:flex;align-items:center;justify-content:center;
}
.impact-label{font-size:0.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:0.3px}
.impact-footer{
  display:flex;align-items:center;gap:6px;
  margin-top:12px;font-size:0.72rem;color:var(--text2);
  justify-content:center;
}
.impact-dot{
  width:6px;height:6px;border-radius:50%;background:#00c853;
  animation:impactPulse 2s ease infinite;
}
@keyframes impactPulse{0%,100%{opacity:1}50%{opacity:0.4}}
.impact-unavailable{
  text-align:center;padding:20px;color:var(--text2);
  font-size:0.85rem;font-style:italic;
}
@media(max-width:600px){
  .impact-grid{grid-template-columns:repeat(2,1fr)}
  .impact-card:last-child{grid-column:span 2}
  .impact-section{padding:1.5rem 1rem 0}
  .impact-widget{padding:1.2rem}
  .impact-value{font-size:1.2rem}
}`;
}

/**
 * Generate the JS for the impact widget (auto-refresh every 30 seconds).
 */
export function generateImpactWidgetJs(): string {
  return `
// Impact Widget — auto-refresh
(function(){
  function fmt(n){
    if(n>=1000000)return (n/1000000).toFixed(1)+'M';
    if(n>=1000)return (n/1000).toFixed(1)+'K';
    return String(n);
  }
  function update(data){
    var grid=document.getElementById('impactGrid');
    var footer=document.getElementById('impactFooter');
    var unavail=document.getElementById('impactUnavailable');
    if(!data.available){
      grid.style.display='none';
      footer.style.display='none';
      unavail.style.display='block';
      return;
    }
    grid.style.display='';
    footer.style.display='';
    unavail.style.display='none';
    document.getElementById('iw-total').textContent=fmt(data.totalQueries);
    document.getElementById('iw-blocked').textContent=fmt(data.blockedQueries);
    document.getElementById('iw-cache').textContent=data.cacheHitRate+'%';
    document.getElementById('iw-abuse').textContent=fmt(data.abusePrevented);
    document.getElementById('iw-latency').textContent=data.avgLatencyMs+'ms';
  }
  function load(){
    fetch('/api/impact')
      .then(function(r){return r.json()})
      .then(update)
      .catch(function(){
        update({available:false});
      });
  }
  load();
  setInterval(load,30000);
})();`;
}
