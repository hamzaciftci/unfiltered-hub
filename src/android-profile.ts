/**
 * UnfilteredHub — Android DoH Profile Generator
 * Generates DNS Stamp (sdns://), JSON config, and setup guide for Android devices.
 *
 * Android 9+ has Private DNS (DoT only).
 * For DoH, users need a compatible app (Intra, Nebulo, personalDNSfilter, etc.)
 * or Android 13+ with supported resolvers.
 *
 * DNS Stamp spec: https://dnscrypt.info/stamps-specifications/
 */

/**
 * Generate a DNS Stamp (sdns:// URI) for a DoH server.
 * Protocol 0x02 = DNS-over-HTTPS
 * Props: DNSSEC (0x01) | No-Log (0x02) | No-Filter (0x04) = 0x07
 * For filtered (adblock): DNSSEC (0x01) | No-Log (0x02) = 0x03
 */
export function generateDnsStamp(domain: string, options?: { filtered?: boolean }): string {
  const props = options?.filtered ? 0x03 : 0x07; // DNSSEC + NoLog (+ NoFilter if unfiltered)
  const hostname = domain;
  const path = '/dns-query';

  // Build stamp binary: protocol(1) + props(8) + LP(addr) + LP(hash) + LP(hostname) + LP(path)
  const parts: number[] = [];

  // Protocol: 0x02 = DoH
  parts.push(0x02);

  // Props: 8 bytes little-endian
  parts.push(props);
  for (let i = 0; i < 7; i++) parts.push(0);

  // LP-encoded address (empty for HTTPS — hostname is used)
  parts.push(0);

  // LP-encoded hash (empty — public server, no pinning)
  parts.push(0);

  // LP-encoded hostname
  const hostBytes = new TextEncoder().encode(hostname);
  parts.push(hostBytes.length);
  for (const b of hostBytes) parts.push(b);

  // LP-encoded path
  const pathBytes = new TextEncoder().encode(path);
  parts.push(pathBytes.length);
  for (const b of pathBytes) parts.push(b);

  // Base64url encode
  const binary = new Uint8Array(parts);
  const base64 = btoa(String.fromCharCode(...binary))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `sdns://${base64}`;
}

/**
 * Generate JSON config for DoH endpoint.
 */
export function generateAndroidConfig(domain: string): object {
  const dohUrl = `https://${domain}/dns-query`;
  const stamp = generateDnsStamp(domain, { filtered: true });
  const stampUnfiltered = generateDnsStamp(domain, { filtered: false });

  return {
    name: 'UnfilteredHub DoH',
    description: 'DNS-over-HTTPS proxy with ad/tracker blocking',
    doh: {
      url: dohUrl,
      method: 'GET',
    },
    stamps: {
      filtered: stamp,
      unfiltered: stampUnfiltered,
    },
    features: {
      adblock: true,
      cache: true,
      dnssec: true,
      logging: false,
      multiResolver: true,
    },
    apps: {
      intra: {
        name: 'Intra (by Google Jigsaw)',
        playStore: 'https://play.google.com/store/apps/details?id=app.intra',
        config: dohUrl,
      },
      nebulo: {
        name: 'Nebulo',
        playStore: 'https://play.google.com/store/apps/details?id=com.frostnerd.smokescreen',
        config: dohUrl,
      },
      personalDnsFilter: {
        name: 'personalDNSfilter',
        playStore: 'https://play.google.com/store/apps/details?id=dnsfilter.android',
        config: dohUrl,
      },
    },
  };
}

/**
 * Generate Android setup guide HTML page.
 */
export function generateAndroidGuide(domain: string, lang: 'tr' | 'en' = 'tr'): string {
  const dohUrl = `https://${domain}/dns-query`;
  const stamp = generateDnsStamp(domain, { filtered: true });

  const t = lang === 'tr' ? {
    title: 'Android Kurulum Rehberi',
    subtitle: 'DNS-over-HTTPS ile gizli ve güvenli DNS',
    methodTitle: 'Kurulum Yöntemleri',
    method1Title: 'Yöntem 1: Intra Uygulaması (Önerilen)',
    method1Desc: 'Google Jigsaw tarafından geliştirilen ücretsiz ve açık kaynak uygulama.',
    method1Steps: [
      'Google Play Store\'dan <strong>Intra</strong> uygulamasını indirin',
      'Uygulamayı açın ve <strong>"Choose your DNS server"</strong> bölümüne gidin',
      '<strong>"Custom server URL"</strong> seçeneğini seçin',
      'Aşağıdaki URL\'yi yapıştırın:',
      '<strong>"Start"</strong> butonuna basın — tamamdır!',
    ],
    method2Title: 'Yöntem 2: Nebulo Uygulaması',
    method2Desc: 'Gelişmiş DNS yönetimi için güçlü bir araç.',
    method2Steps: [
      'Google Play Store\'dan <strong>Nebulo</strong> uygulamasını indirin',
      'Uygulamayı açın → <strong>Settings</strong> → <strong>DNS Server</strong>',
      '<strong>"Add"</strong> → <strong>"DoH"</strong> seçin',
      'URL olarak aşağıdaki adresi girin:',
      'Kaydedin ve aktif edin',
    ],
    method3Title: 'Yöntem 3: Manuel (Android 9+)',
    method3Desc: 'Android\'in yerleşik Private DNS özelliği sadece DNS-over-TLS (DoT) destekler. DoH için yukarıdaki uygulamalardan birini kullanmanızı öneririz.',
    dnsStampTitle: 'DNS Stamp',
    dnsStampDesc: 'dnscrypt-proxy, DNSCloak veya stamp destekleyen diğer uygulamalar için:',
    jsonConfigTitle: 'JSON Config',
    jsonConfigDesc: 'Programatik kullanım veya otomasyon için:',
    downloadBtn: 'JSON Config İndir',
    copyBtn: 'Kopyala',
    copiedMsg: 'Kopyalandı!',
    features: [
      ['Reklam Engelleme', 'Reklamlar ve izleyiciler otomatik engellenir'],
      ['DNS Şifreleme', 'Tüm sorgularınız HTTPS ile şifrelenir'],
      ['Sıfır Kayıt', 'DNS sorgularınız kaydedilmez'],
      ['Hızlı Cache', 'Tekrarlayan sorgular anında yanıtlanır'],
    ],
    appleLink: 'Apple cihazlar için .mobileconfig profili',
    backLink: 'Ana sayfaya dön',
  } : {
    title: 'Android Setup Guide',
    subtitle: 'Private and secure DNS with DNS-over-HTTPS',
    methodTitle: 'Setup Methods',
    method1Title: 'Method 1: Intra App (Recommended)',
    method1Desc: 'Free and open-source app by Google Jigsaw.',
    method1Steps: [
      'Download <strong>Intra</strong> from Google Play Store',
      'Open the app and go to <strong>"Choose your DNS server"</strong>',
      'Select <strong>"Custom server URL"</strong>',
      'Paste the following URL:',
      'Tap <strong>"Start"</strong> — you\'re done!',
    ],
    method2Title: 'Method 2: Nebulo App',
    method2Desc: 'Powerful tool for advanced DNS management.',
    method2Steps: [
      'Download <strong>Nebulo</strong> from Google Play Store',
      'Open the app → <strong>Settings</strong> → <strong>DNS Server</strong>',
      'Tap <strong>"Add"</strong> → Select <strong>"DoH"</strong>',
      'Enter the following URL:',
      'Save and activate',
    ],
    method3Title: 'Method 3: Manual (Android 9+)',
    method3Desc: 'Android\'s built-in Private DNS only supports DNS-over-TLS (DoT). For DoH, we recommend using one of the apps above.',
    dnsStampTitle: 'DNS Stamp',
    dnsStampDesc: 'For dnscrypt-proxy, DNSCloak, or other stamp-compatible apps:',
    jsonConfigTitle: 'JSON Config',
    jsonConfigDesc: 'For programmatic use or automation:',
    downloadBtn: 'Download JSON Config',
    copyBtn: 'Copy',
    copiedMsg: 'Copied!',
    features: [
      ['Ad Blocking', 'Ads and trackers are automatically blocked'],
      ['DNS Encryption', 'All queries encrypted via HTTPS'],
      ['Zero Logging', 'Your DNS queries are not recorded'],
      ['Fast Cache', 'Repeated queries answered instantly'],
    ],
    appleLink: '.mobileconfig profile for Apple devices',
    backLink: 'Back to home',
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UnfilteredHub — ${t.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0f;--bg2:#12121a;--bg3:#1a1a2e;
  --accent:#6c63ff;--accent2:#4ecdc4;--green:#22c55e;
  --text:#e0e0e0;--text2:#a0a0b0;--radius:12px;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.7}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

.container{max-width:800px;margin:0 auto;padding:2rem 1.5rem}

.header{text-align:center;margin-bottom:3rem}
.header h1{font-size:1.8rem;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:0.5rem}
.header .android-icon{font-size:3rem;margin-bottom:1rem}
.header p{color:var(--text2);font-size:1rem}

.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:3rem}
.feature{background:var(--bg2);border:1px solid rgba(108,99,255,0.1);border-radius:var(--radius);padding:1.2rem;text-align:center}
.feature-title{font-weight:600;font-size:0.9rem;margin-bottom:0.3rem}
.feature-desc{font-size:0.8rem;color:var(--text2)}

.method{background:var(--bg2);border:1px solid rgba(108,99,255,0.1);border-radius:var(--radius);padding:1.5rem;margin-bottom:1.5rem}
.method-title{font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem}
.method-title .num{background:var(--accent);color:#fff;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0}
.method-desc{color:var(--text2);font-size:0.9rem;margin-bottom:1rem}
.steps{counter-reset:step;list-style:none;padding:0}
.steps li{counter-increment:step;padding:0.5rem 0 0.5rem 2.5rem;position:relative;font-size:0.95rem}
.steps li::before{content:counter(step);position:absolute;left:0;top:0.5rem;background:var(--bg3);color:var(--accent);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600}

.url-box{background:var(--bg);border:1px solid rgba(108,99,255,0.3);border-radius:8px;padding:0.8rem 1rem;font-family:'Courier New',monospace;font-size:0.85rem;margin:0.8rem 0;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;word-break:break-all}
.url-box code{flex:1;color:var(--accent2)}
.copy-btn{background:var(--accent);color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;font-weight:600}
.copy-btn:hover{opacity:0.85}
.copy-btn.copied{background:var(--green)}

.stamp-box{background:var(--bg);border:1px solid rgba(78,205,196,0.3);border-radius:8px;padding:0.8rem 1rem;font-family:'Courier New',monospace;font-size:0.75rem;margin:0.8rem 0;word-break:break-all;color:var(--accent2)}

.section{margin-bottom:2rem}
.section-title{font-size:1rem;font-weight:600;margin-bottom:0.5rem}
.section-desc{font-size:0.85rem;color:var(--text2);margin-bottom:0.5rem}

.btn{display:inline-block;padding:0.6rem 1.5rem;border-radius:8px;font-size:0.9rem;font-weight:600;border:none;cursor:pointer;transition:all 0.2s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:#8b5cf6;text-decoration:none}
.btn-outline{background:transparent;border:1px solid var(--accent);color:var(--accent)}
.btn-outline:hover{background:rgba(108,99,255,0.1);text-decoration:none}

.note{background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.2);border-radius:8px;padding:1rem;font-size:0.85rem;color:#eab308;margin:1rem 0}

.links{text-align:center;margin-top:3rem;display:flex;flex-direction:column;gap:0.8rem;align-items:center}

@media(max-width:600px){
  .container{padding:1rem}
  .url-box{flex-direction:column;align-items:stretch}
  .copy-btn{text-align:center}
}
</style>
</head>
<body>
<div class="container">

<div class="header">
  <div class="android-icon">&#129302;</div>
  <h1>${t.title}</h1>
  <p>${t.subtitle}</p>
</div>

<div class="features">
  ${t.features.map(([title, desc]: string[]) => `<div class="feature"><div class="feature-title">${title}</div><div class="feature-desc">${desc}</div></div>`).join('')}
</div>

<h2 style="font-size:1.2rem;margin-bottom:1.5rem">${t.methodTitle}</h2>

<div class="method">
  <div class="method-title"><span class="num">1</span> ${t.method1Title}</div>
  <div class="method-desc">${t.method1Desc}</div>
  <ol class="steps">
    <li>${t.method1Steps[0]}</li>
    <li>${t.method1Steps[1]}</li>
    <li>${t.method1Steps[2]}</li>
    <li>${t.method1Steps[3]}
      <div class="url-box"><code id="dohUrl1">${escapeHtml(dohUrl)}</code><button class="copy-btn" onclick="copyText('dohUrl1',this)">${t.copyBtn}</button></div>
    </li>
    <li>${t.method1Steps[4]}</li>
  </ol>
</div>

<div class="method">
  <div class="method-title"><span class="num">2</span> ${t.method2Title}</div>
  <div class="method-desc">${t.method2Desc}</div>
  <ol class="steps">
    <li>${t.method2Steps[0]}</li>
    <li>${t.method2Steps[1]}</li>
    <li>${t.method2Steps[2]}</li>
    <li>${t.method2Steps[3]}
      <div class="url-box"><code id="dohUrl2">${escapeHtml(dohUrl)}</code><button class="copy-btn" onclick="copyText('dohUrl2',this)">${t.copyBtn}</button></div>
    </li>
    <li>${t.method2Steps[4]}</li>
  </ol>
</div>

<div class="method">
  <div class="method-title"><span class="num">3</span> ${t.method3Title}</div>
  <div class="note">${t.method3Desc}</div>
</div>

<div class="section">
  <div class="section-title">${t.dnsStampTitle}</div>
  <div class="section-desc">${t.dnsStampDesc}</div>
  <div class="stamp-box" id="dnsStamp">${escapeHtml(stamp)}</div>
  <button class="copy-btn" onclick="copyText('dnsStamp',this)" style="margin-top:0.5rem">${t.copyBtn}</button>
</div>

<div class="section">
  <div class="section-title">${t.jsonConfigTitle}</div>
  <div class="section-desc">${t.jsonConfigDesc}</div>
  <a href="/android-config?domain=${encodeURIComponent(domain)}" class="btn btn-primary" download="unfilteredhub-doh.json">${t.downloadBtn}</a>
</div>

<div class="links">
  <a href="/apple-profile?domain=${encodeURIComponent(domain)}" class="btn btn-outline">${t.appleLink}</a>
  <a href="/">${t.backLink}</a>
</div>

</div>

<script>
function copyText(id, btn) {
  const el = document.getElementById(id);
  const text = el.textContent || el.innerText;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '${t.copiedMsg}';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '${t.copyBtn}'; btn.classList.remove('copied'); }, 2000);
  });
}
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
