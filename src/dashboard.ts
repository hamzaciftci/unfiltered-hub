/**
 * UnfilteredHub — Admin Dashboard UI
 * Visual web interface for monitoring stats and managing blocklist.
 *
 * Security: API key is never embedded in HTML or URL.
 * User enters key via login form → stored in sessionStorage → sent via X-API-Key header.
 */

import { UPSTREAMS } from './resolver';

export function generateDashboard(): string {
  const resolverList = UPSTREAMS.map(u => `"${u.name}"`).join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UnfilteredHub — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0f;--bg2:#12121a;--bg3:#1a1a2e;
  --accent:#6c63ff;--accent2:#4ecdc4;--red:#ef4444;--green:#22c55e;--yellow:#eab308;
  --text:#e0e0e0;--text2:#a0a0b0;--radius:12px;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
a{color:var(--accent);text-decoration:none}

/* Login */
.login-overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:2000}
.login-box{background:var(--bg2);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius);padding:2.5rem;width:100%;max-width:400px;text-align:center}
.login-box h2{font-size:1.3rem;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:0.5rem}
.login-box p{color:var(--text2);font-size:0.85rem;margin-bottom:1.5rem}
.login-box input{width:100%;padding:0.7rem 1rem;border-radius:8px;border:1px solid rgba(108,99,255,0.3);background:var(--bg);color:var(--text);font-size:0.95rem;font-family:monospace;margin-bottom:1rem}
.login-box input:focus{outline:none;border-color:var(--accent)}
.login-box button{width:100%;padding:0.7rem;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:0.95rem;font-weight:600;cursor:pointer;transition:background 0.2s}
.login-box button:hover{background:#8b5cf6}
.login-error{color:var(--red);font-size:0.85rem;margin-top:0.75rem;display:none}

/* Layout */
.dashboard{max-width:1200px;margin:0 auto;padding:2rem;display:none}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem;flex-wrap:wrap;gap:1rem}
.header h1{font-size:1.5rem;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.header-right{display:flex;align-items:center;gap:0.75rem}
.header .badge{background:var(--bg3);padding:0.3rem 0.8rem;border-radius:20px;font-size:0.75rem;color:var(--accent2)}
.logout-btn{background:none;border:1px solid rgba(239,68,68,0.4);color:var(--red);padding:0.3rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.75rem;transition:all 0.2s}
.logout-btn:hover{background:rgba(239,68,68,0.1);border-color:var(--red)}

/* Cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:var(--bg2);border:1px solid rgba(108,99,255,0.1);border-radius:var(--radius);padding:1.5rem;transition:border-color 0.2s}
.card:hover{border-color:rgba(108,99,255,0.3)}
.card-label{font-size:0.8rem;color:var(--text2);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem}
.card-value{font-size:2rem;font-weight:700}
.card-sub{font-size:0.8rem;color:var(--text2);margin-top:0.3rem}
.card-value.green{color:var(--green)}
.card-value.accent{color:var(--accent)}
.card-value.accent2{color:var(--accent2)}
.card-value.red{color:var(--red)}
.card-value.yellow{color:var(--yellow)}

/* Chart */
.chart-section{background:var(--bg2);border:1px solid rgba(108,99,255,0.1);border-radius:var(--radius);padding:1.5rem;margin-bottom:2rem}
.chart-title{font-size:1rem;font-weight:600;margin-bottom:1rem}
.chart{display:flex;align-items:flex-end;gap:4px;height:200px;padding:0 0.5rem}
.chart-bar-group{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}
.chart-bar{width:100%;border-radius:4px 4px 0 0;min-height:2px;transition:height 0.5s ease}
.chart-bar.total{background:var(--accent);opacity:0.3}
.chart-bar.blocked{background:var(--red);opacity:0.7}
.chart-bar.cached{background:var(--accent2);opacity:0.7}
.chart-label{font-size:0.65rem;color:var(--text2);margin-top:4px;text-align:center}
.chart-legend{display:flex;gap:1.5rem;margin-top:1rem;justify-content:center}
.legend-item{display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:var(--text2)}
.legend-dot{width:10px;height:10px;border-radius:2px}

/* Blocklist section */
.section{background:var(--bg2);border:1px solid rgba(108,99,255,0.1);border-radius:var(--radius);padding:1.5rem;margin-bottom:2rem}
.section-title{font-size:1rem;font-weight:600;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center}
.domain-list{max-height:300px;overflow-y:auto;font-family:'Courier New',monospace;font-size:0.85rem}
.domain-item{padding:0.4rem 0;border-bottom:1px solid rgba(108,99,255,0.05);display:flex;justify-content:space-between;align-items:center}
.domain-item:last-child{border-bottom:none}
.domain-item button{background:var(--red);color:#fff;border:none;padding:0.2rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.75rem}
.domain-item button:hover{opacity:0.8}

/* Forms */
.add-form{display:flex;gap:0.5rem;margin-bottom:1rem}
.add-form input{flex:1;padding:0.6rem 1rem;border-radius:8px;border:1px solid rgba(108,99,255,0.3);background:var(--bg);color:var(--text);font-size:0.9rem}
.add-form input:focus{outline:none;border-color:var(--accent)}
.btn{padding:0.6rem 1.2rem;border-radius:8px;border:none;cursor:pointer;font-size:0.9rem;font-weight:600;transition:all 0.2s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:#8b5cf6}
.btn-sm{padding:0.3rem 0.8rem;font-size:0.8rem}

/* Resolvers */
.resolver-list{display:flex;gap:0.75rem;flex-wrap:wrap}
.resolver-badge{background:var(--bg3);border:1px solid rgba(108,99,255,0.15);padding:0.4rem 1rem;border-radius:8px;font-size:0.85rem;display:flex;align-items:center;gap:0.5rem}
.resolver-badge .dot{width:8px;height:8px;border-radius:50%;background:var(--green)}

/* Status */
.status-bar{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:2rem}
.status-item{display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--text2)}
.status-dot{width:8px;height:8px;border-radius:50%}
.status-dot.ok{background:var(--green)}
.status-dot.warn{background:var(--yellow)}
.status-dot.err{background:var(--red)}

/* Toast */
.toast{position:fixed;bottom:2rem;right:2rem;background:var(--bg3);border:1px solid var(--accent);color:var(--text);padding:0.8rem 1.5rem;border-radius:8px;font-size:0.9rem;display:none;z-index:1000;animation:slideUp 0.3s ease}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}

/* Loading */
.loading{text-align:center;padding:2rem;color:var(--text2)}
.spinner{display:inline-block;width:20px;height:20px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:0.5rem;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}

@media(max-width:600px){.dashboard{padding:1rem}.cards{grid-template-columns:1fr 1fr}.login-box{margin:1rem}}
</style>
</head>
<body>

<!-- Login overlay -->
<div class="login-overlay" id="loginOverlay">
  <div class="login-box">
    <h2>UnfilteredHub</h2>
    <p>Enter your Admin API Key to access the dashboard.</p>
    <input type="password" id="loginKeyInput" placeholder="API Key" autocomplete="off" autofocus>
    <button onclick="attemptLogin()">Sign In</button>
    <div class="login-error" id="loginError"></div>
  </div>
</div>

<!-- Dashboard (hidden until auth) -->
<div class="dashboard" id="dashboardMain">

<div class="header">
  <h1>UnfilteredHub Dashboard</h1>
  <div class="header-right">
    <span class="badge">Admin Panel</span>
    <button class="logout-btn" onclick="logout()">Logout</button>
  </div>
</div>

<div class="status-bar" id="statusBar">
  <div class="status-item"><span class="spinner"></span> Loading...</div>
</div>

<div class="cards" id="statsCards">
  <div class="card"><div class="card-label">Total Queries (Today)</div><div class="card-value accent" id="totalQueries">-</div></div>
  <div class="card"><div class="card-label">Blocked</div><div class="card-value red" id="blockedQueries">-</div><div class="card-sub" id="blockedPct"></div></div>
  <div class="card"><div class="card-label">Cached</div><div class="card-value accent2" id="cachedQueries">-</div><div class="card-sub" id="cachedPct"></div></div>
  <div class="card"><div class="card-label">Core Blocklist</div><div class="card-value green" id="coreSize">-</div></div>
  <div class="card"><div class="card-label">KV Blocklist</div><div class="card-value yellow" id="kvSize">-</div><div class="card-sub" id="kvStatus"></div></div>
</div>

<div class="chart-section">
  <div class="chart-title">Last 7 Days</div>
  <div class="chart" id="weeklyChart"><div class="loading"><span class="spinner"></span></div></div>
  <div class="chart-legend">
    <div class="legend-item"><div class="legend-dot" style="background:var(--accent);opacity:0.3"></div> Total</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--red);opacity:0.7"></div> Blocked</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--accent2);opacity:0.7"></div> Cached</div>
  </div>
</div>

<div class="section">
  <div class="section-title">
    <span>DNS Resolvers</span>
  </div>
  <div class="resolver-list" id="resolverList"></div>
</div>

<div class="section">
  <div class="section-title">
    <span>KV Blocklist Management</span>
    <span class="badge" id="domainCount">0 domains</span>
  </div>
  <div class="add-form">
    <input type="text" id="addDomainInput" placeholder="evil-tracker.com">
    <button class="btn btn-primary" onclick="addDomain()">Add Domain</button>
  </div>
  <div class="domain-list" id="domainList">
    <div class="loading"><span class="spinner"></span> Loading blocklist...</div>
  </div>
  <div style="margin-top:1rem;text-align:center">
    <button class="btn btn-primary btn-sm" id="loadMoreBtn" onclick="loadMoreDomains()" style="display:none">Load More</button>
  </div>
</div>

</div>

<div class="toast" id="toast"></div>

<script>
const BASE = '';
let currentCursor = null;
let allDomains = [];
let refreshInterval = null;

/* ── Session key management ────────────────────────────── */

function getKey() {
  return sessionStorage.getItem('uh_admin_key') || '';
}

function setKey(k) {
  sessionStorage.setItem('uh_admin_key', k);
}

function clearKey() {
  sessionStorage.removeItem('uh_admin_key');
}

function headers() {
  return { 'X-API-Key': getKey(), 'Content-Type': 'application/json' };
}

/* ── Login / Logout ────────────────────────────────────── */

async function attemptLogin() {
  const input = document.getElementById('loginKeyInput');
  const errEl = document.getElementById('loginError');
  const key = input.value.trim();
  if (!key) { input.style.borderColor = 'var(--red)'; return; }

  // Verify key by hitting /admin/stats
  try {
    const res = await fetch(BASE + '/admin/stats', {
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      setKey(key);
      showDashboard();
    } else {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Authentication failed.';
      errEl.style.display = 'block';
      input.style.borderColor = 'var(--red)';
    }
  } catch (e) {
    errEl.textContent = 'Network error: ' + e.message;
    errEl.style.display = 'block';
  }
}

function logout() {
  clearKey();
  if (refreshInterval) clearInterval(refreshInterval);
  document.getElementById('dashboardMain').style.display = 'none';
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginKeyInput').value = '';
  document.getElementById('loginError').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('dashboardMain').style.display = 'block';
  renderResolvers();
  loadStats();
  loadDomains();
  refreshInterval = setInterval(loadStats, 30000);
}

// Enter key on login input
document.getElementById('loginKeyInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') attemptLogin();
});

// Auto-login if key exists in sessionStorage
if (getKey()) {
  showDashboard();
}

/* ── Dashboard logic ───────────────────────────────────── */

function showToast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', ms || 3000);
}

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

async function loadStats() {
  try {
    const res = await fetch(BASE + '/admin/stats', { headers: headers() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    const today = data.queries?.today || { total: 0, blocked: 0, cached: 0 };
    document.getElementById('totalQueries').textContent = fmt(today.total);
    document.getElementById('blockedQueries').textContent = fmt(today.blocked);
    document.getElementById('cachedQueries').textContent = fmt(today.cached);

    if (today.total > 0) {
      document.getElementById('blockedPct').textContent = ((today.blocked / today.total) * 100).toFixed(1) + '% of total';
      document.getElementById('cachedPct').textContent = ((today.cached / today.total) * 100).toFixed(1) + '% of total';
    }

    document.getElementById('coreSize').textContent = fmt(data.blocklist?.coreSize || 0);
    document.getElementById('kvSize').textContent = fmt(data.blocklist?.kvSize || 0);
    document.getElementById('kvStatus').textContent = data.blocklist?.kvAvailable ? 'KV Active' : 'KV Not Configured';

    const weekly = data.queries?.weekly || [];
    renderChart(weekly);

    document.getElementById('statusBar').innerHTML =
      '<div class="status-item"><span class="status-dot ok"></span> Worker Online</div>' +
      '<div class="status-item"><span class="status-dot ' + (data.blocklist?.kvAvailable ? 'ok' : 'warn') + '"></span> KV ' + (data.blocklist?.kvAvailable ? 'Connected' : 'Not Configured') + '</div>' +
      '<div class="status-item"><span class="status-dot ok"></span> Adblock Active</div>' +
      '<div class="status-item"><span class="status-dot ok"></span> Cache Active</div>';

  } catch (e) {
    showToast('Failed to load stats: ' + e.message, 5000);
  }
}

function renderChart(weekly) {
  const chart = document.getElementById('weeklyChart');
  if (!weekly.length) { chart.innerHTML = '<div class="loading">No data yet</div>'; return; }

  const maxVal = Math.max(...weekly.map(d => d.total), 1);
  const reversed = [...weekly].reverse();

  chart.innerHTML = reversed.map(day => {
    const totalH = Math.max((day.total / maxVal) * 180, 2);
    const blockedH = Math.max((day.blocked / maxVal) * 180, day.blocked > 0 ? 2 : 0);
    const cachedH = Math.max((day.cached / maxVal) * 180, day.cached > 0 ? 2 : 0);
    const label = day.date?.slice(5) || '';
    return '<div class="chart-bar-group">' +
      '<div class="chart-bar total" style="height:' + totalH + 'px" title="Total: ' + day.total + '"></div>' +
      '<div class="chart-bar blocked" style="height:' + blockedH + 'px" title="Blocked: ' + day.blocked + '"></div>' +
      '<div class="chart-bar cached" style="height:' + cachedH + 'px" title="Cached: ' + day.cached + '"></div>' +
      '<div class="chart-label">' + label + '</div></div>';
  }).join('');
}

function renderResolvers() {
  const resolvers = [${resolverList}];
  document.getElementById('resolverList').innerHTML = resolvers.map(r =>
    '<div class="resolver-badge"><span class="dot"></span>' + r + '</div>'
  ).join('');
}

async function loadDomains() {
  try {
    const url = BASE + '/admin/blocklist?limit=100' + (currentCursor ? '&cursor=' + encodeURIComponent(currentCursor) : '');
    const res = await fetch(url, { headers: headers() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    allDomains = allDomains.concat(data.domains || []);
    currentCursor = data.cursor;

    renderDomainList();
    document.getElementById('domainCount').textContent = allDomains.length + (data.complete ? '' : '+') + ' domains';
    document.getElementById('loadMoreBtn').style.display = data.complete ? 'none' : 'inline-block';
  } catch (e) {
    document.getElementById('domainList').innerHTML = '<div style="color:var(--text2);padding:1rem">KV not configured or error loading blocklist</div>';
  }
}

function loadMoreDomains() { loadDomains(); }

function renderDomainList() {
  const list = document.getElementById('domainList');
  if (!allDomains.length) {
    list.innerHTML = '<div style="color:var(--text2);padding:1rem">No domains in KV blocklist. Add domains above or use the import script.</div>';
    return;
  }
  list.innerHTML = allDomains.map(d =>
    '<div class="domain-item"><span>' + escHtml(d) + '</span><button onclick="removeDomain(\\'' + escHtml(d) + '\\')">Remove</button></div>'
  ).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function addDomain() {
  const input = document.getElementById('addDomainInput');
  const domain = input.value.trim().toLowerCase();
  if (!domain || !domain.includes('.')) { input.style.borderColor = 'var(--red)'; return; }

  try {
    const res = await fetch(BASE + '/admin/blocklist', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ domains: [domain] }),
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (data.added) {
      allDomains.unshift(domain);
      renderDomainList();
      input.value = '';
      input.style.borderColor = '';
      showToast('Added: ' + domain);
    } else {
      showToast('Error: ' + (data.error || 'Unknown'));
    }
  } catch (e) {
    showToast('Error: ' + e.message, 5000);
  }
}

async function removeDomain(domain) {
  try {
    const res = await fetch(BASE + '/admin/blocklist', {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ domains: [domain] }),
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (data.removed) {
      allDomains = allDomains.filter(d => d !== domain);
      renderDomainList();
      showToast('Removed: ' + domain);
    }
  } catch (e) {
    showToast('Error: ' + e.message, 5000);
  }
}
</script>
</body>
</html>`;
}
