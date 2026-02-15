/**
 * UnfilteredHub — Landing Page Generator
 * Modern, dark-themed, responsive landing page with TR/EN support
 */

import { generateImpactWidgetHtml, generateImpactWidgetCss, generateImpactWidgetJs } from './impactWidget';
import type { Lang } from './utils';

const t = {
  tr: {
    title: 'UnfilteredHub',
    heroTitle: 'İnternetiniz, Sizin Kurallarınız.',
    heroDesc: 'DNS şifreleme teknolojisiyle internetinizi özgür hale getirin. Kendi DoH sunucunuzu saniyeler içinde kurun — tamamen ücretsiz.',
    ctaSetup: 'Kendi Sunucunu Kur',
    ctaHow: 'Nasıl Çalışır?',
    featEncTitle: 'DNS Şifreleme',
    featEncDesc: 'Tüm DNS sorgularınız HTTPS ile şifrelenir. ISP\'niz hangi sitelere girdiğinizi göremez.',
    featPrivTitle: 'Tam Gizlilik',
    featPrivDesc: 'Hiçbir log tutulmaz. Sunucu tamamen sizin kontrolünüzde çalışır.',
    featSpeedTitle: 'Yüksek Hız',
    featSpeedDesc: 'Cloudflare\'in küresel ağı sayesinde DNS sorguları milisaniyeler içinde çözümlenir.',
    featFreeTitle: 'Tamamen Ücretsiz',
    featFreeDesc: 'Cloudflare Workers ücretsiz planıyla aylık 1.000.000 istek. Çoğu kullanıcıya fazlasıyla yeter.',
    setupTitle: 'Kurulum',
    step1Title: 'Gereksinimler',
    step1Desc: 'Node.js 18+ yükleyin ve ücretsiz bir Cloudflare hesabı açın.',
    step2Title: 'Projeyi Kur',
    step2Desc: 'Depoyu indirin, bağımlılıkları yükleyin ve Cloudflare\'e giriş yapın.',
    step3Title: 'Deploy Et',
    step3Desc: 'Tek komutla sunucunuz hazır. Worker URL\'inizi cihazlarınıza girin.',
    devicesTitle: 'Cihaz Ayarları',
    iosTitle: 'iPhone / iPad / Mac',
    iosDesc: 'Aşağıdaki butona tıklayarak .mobileconfig profilini indirin ve cihazınıza yükleyin. Ayarlar → Genel → VPN ve Cihaz Yönetimi → Profili yükleyin.',
    iosDownload: 'Profili İndir',
    androidTitle: 'Android 9+',
    androidDesc: 'Android cihazınızda DoH kullanmak için bir DNS uygulaması gerekir. Aşağıda domain\'inizi girerek detaylı kurulum rehberine ulaşabilirsiniz.',
    androidGuideBtn: 'Kurulum Rehberini Aç',
    windowsTitle: 'Windows 11',
    windowsDesc: 'Ayarlar → Ağ ve İnternet → Wi-Fi / Ethernet → DNS sunucusu → Düzenle → Manuel → DNS-over-HTTPS → DoH URL\'inizi girin.',
    chromeTitle: 'Chrome / Edge',
    chromeDesc: 'Ayarlar → Gizlilik ve Güvenlik → Güvenlik → "Güvenli DNS kullan" → Özel → DoH URL\'inizi girin.',
    firefoxTitle: 'Firefox',
    firefoxDesc: 'Ayarlar → Gizlilik ve Güvenlik → DNS over HTTPS → Özel → URL\'inizi girin.',
    footerText: 'Dijital özgürlük herkesin hakkıdır.',
    footerGithub: 'GitHub',
    langSwitch: 'EN',
    howTitle: 'Nasıl Çalışır?',
    howDesc: 'DNS sorgularınız şifrelenerek Cloudflare\'in güvenli DNS sunucularına iletilir. ISP\'niz yalnızca şifreli HTTPS trafiği görür — hangi sitelere girdiğinizi göremez.',
    howFlow: 'Cihazınız → HTTPS → Worker\'ınız → Cloudflare DNS → İnternet',
    profileFormLabel: 'Worker Domain\'iniz:',
    profileFormPlaceholder: 'unfilteredhub-doh.hesabiniz.workers.dev',
    profileFormButton: 'Profil Oluştur ve İndir',
  },
  en: {
    title: 'UnfilteredHub',
    heroTitle: 'Your Internet, Your Rules.',
    heroDesc: 'Make your internet free and unfiltered with DNS encryption technology. Set up your own DoH server in seconds — completely free.',
    ctaSetup: 'Set Up Your Server',
    ctaHow: 'How It Works?',
    featEncTitle: 'DNS Encryption',
    featEncDesc: 'All your DNS queries are encrypted via HTTPS. Your ISP cannot see which sites you visit.',
    featPrivTitle: 'Full Privacy',
    featPrivDesc: 'No logs are kept. The server runs entirely under your control.',
    featSpeedTitle: 'High Speed',
    featSpeedDesc: 'DNS queries are resolved in milliseconds thanks to Cloudflare\'s global network.',
    featFreeTitle: 'Completely Free',
    featFreeDesc: 'Cloudflare Workers free plan offers 1,000,000 requests per month. More than enough for most users.',
    setupTitle: 'Setup',
    step1Title: 'Requirements',
    step1Desc: 'Install Node.js 18+ and create a free Cloudflare account.',
    step2Title: 'Install Project',
    step2Desc: 'Clone the repo, install dependencies, and log in to Cloudflare.',
    step3Title: 'Deploy',
    step3Desc: 'Your server is ready with a single command. Enter your Worker URL on your devices.',
    devicesTitle: 'Device Setup',
    iosTitle: 'iPhone / iPad / Mac',
    iosDesc: 'Click the button below to download the .mobileconfig profile and install it on your device. Settings → General → VPN & Device Management → Install the profile.',
    iosDownload: 'Download Profile',
    androidTitle: 'Android 9+',
    androidDesc: 'Android devices need a DNS app for DoH. Enter your domain below to access the detailed setup guide.',
    androidGuideBtn: 'Open Setup Guide',
    windowsTitle: 'Windows 11',
    windowsDesc: 'Settings → Network & Internet → Wi-Fi / Ethernet → DNS server → Edit → Manual → DNS-over-HTTPS → Enter your DoH URL.',
    chromeTitle: 'Chrome / Edge',
    chromeDesc: 'Settings → Privacy and Security → Security → "Use secure DNS" → Custom → Enter your DoH URL.',
    firefoxTitle: 'Firefox',
    firefoxDesc: 'Settings → Privacy & Security → DNS over HTTPS → Custom → Enter your URL.',
    footerText: 'Digital freedom is everyone\'s right.',
    footerGithub: 'GitHub',
    langSwitch: 'TR',
    howTitle: 'How It Works?',
    howDesc: 'Your DNS queries are encrypted and forwarded to Cloudflare\'s secure DNS servers. Your ISP only sees encrypted HTTPS traffic — they cannot see which sites you visit.',
    howFlow: 'Your Device → HTTPS → Your Worker → Cloudflare DNS → Internet',
    profileFormLabel: 'Your Worker Domain:',
    profileFormPlaceholder: 'unfilteredhub-doh.youraccount.workers.dev',
    profileFormButton: 'Generate & Download Profile',
  },
};

export function generateLandingPage(lang: Lang): string {
  const s = t[lang];
  const otherLang = lang === 'tr' ? 'en' : 'tr';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${s.title} — ${s.heroTitle}</title>
<meta name="description" content="${s.heroDesc}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0f;
  --bg2:#12121a;
  --bg3:#1a1a2e;
  --accent:#6c63ff;
  --accent2:#4ecdc4;
  --text:#e0e0e0;
  --text2:#a0a0b0;
  --radius:12px;
}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);
  color:var(--text);
  line-height:1.6;
  overflow-x:hidden;
}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

/* Nav */
.nav{
  position:fixed;top:0;width:100%;z-index:100;
  background:rgba(10,10,15,0.85);
  backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(108,99,255,0.1);
  padding:1rem 2rem;
  display:flex;justify-content:space-between;align-items:center;
}
.nav-logo{font-size:1.2rem;font-weight:700;color:var(--accent)}
.nav-lang{
  background:var(--bg3);border:1px solid rgba(108,99,255,0.3);
  color:var(--text);padding:0.4rem 1rem;border-radius:6px;
  cursor:pointer;font-size:0.85rem;transition:all 0.2s;
}
.nav-lang:hover{background:var(--accent);color:#fff}

/* Hero */
.hero{
  min-height:100vh;
  display:flex;flex-direction:column;justify-content:center;align-items:center;
  text-align:center;padding:6rem 2rem 4rem;
  background:
    radial-gradient(ellipse at 20% 50%,rgba(108,99,255,0.1) 0%,transparent 50%),
    radial-gradient(ellipse at 80% 50%,rgba(78,205,196,0.08) 0%,transparent 50%),
    var(--bg);
}
.hero h1{
  font-size:clamp(2.2rem,5vw,4rem);
  font-weight:800;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
  margin-bottom:1.5rem;
}
.hero p{
  font-size:clamp(1rem,2vw,1.25rem);
  color:var(--text2);max-width:640px;margin-bottom:2.5rem;
}
.hero-buttons{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}
.btn{
  padding:0.85rem 2rem;border-radius:8px;font-size:1rem;font-weight:600;
  cursor:pointer;transition:all 0.3s;border:none;display:inline-block;
}
.btn-primary{
  background:linear-gradient(135deg,var(--accent),#8b5cf6);
  color:#fff;box-shadow:0 4px 20px rgba(108,99,255,0.3);
}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 30px rgba(108,99,255,0.5);text-decoration:none}
.btn-secondary{
  background:transparent;border:1px solid var(--accent);color:var(--accent);
}
.btn-secondary:hover{background:rgba(108,99,255,0.1);text-decoration:none}

/* Sections */
.section{padding:5rem 2rem;max-width:1100px;margin:0 auto}
.section-title{
  text-align:center;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:700;
  margin-bottom:3rem;
}

/* Features */
.features-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem;
}
.feature-card{
  background:var(--bg2);border:1px solid rgba(108,99,255,0.1);
  border-radius:var(--radius);padding:2rem;transition:all 0.3s;
}
.feature-card:hover{
  border-color:rgba(108,99,255,0.3);transform:translateY(-4px);
  box-shadow:0 8px 30px rgba(108,99,255,0.1);
}
.feature-icon{font-size:2rem;margin-bottom:1rem}
.feature-card h3{font-size:1.1rem;margin-bottom:0.5rem;color:var(--accent2)}
.feature-card p{color:var(--text2);font-size:0.9rem}

/* How it works */
.how-box{
  background:var(--bg2);border:1px solid rgba(108,99,255,0.1);
  border-radius:var(--radius);padding:2.5rem;text-align:center;max-width:700px;margin:0 auto;
}
.how-box p{color:var(--text2);margin-bottom:1.5rem}
.how-flow{
  font-family:'Courier New',monospace;font-size:clamp(0.8rem,1.5vw,1rem);
  color:var(--accent2);background:var(--bg);
  padding:1rem;border-radius:8px;word-break:break-all;
}

/* Steps */
.steps{display:flex;flex-direction:column;gap:2rem;max-width:700px;margin:0 auto}
.step{
  display:flex;gap:1.5rem;align-items:flex-start;
  background:var(--bg2);border:1px solid rgba(108,99,255,0.1);
  border-radius:var(--radius);padding:1.5rem;
}
.step-num{
  flex-shrink:0;width:40px;height:40px;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-weight:700;font-size:1.1rem;color:#fff;
}
.step h3{font-size:1rem;margin-bottom:0.4rem}
.step p{color:var(--text2);font-size:0.9rem}
.step code{
  display:block;background:var(--bg);padding:0.5rem 0.75rem;
  border-radius:6px;margin-top:0.5rem;font-size:0.85rem;color:var(--accent2);
}

/* Devices */
.devices{max-width:800px;margin:0 auto}
.tab-buttons{
  display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:2rem;justify-content:center;
}
.tab-btn{
  padding:0.5rem 1.2rem;border-radius:6px;cursor:pointer;
  background:var(--bg2);border:1px solid rgba(108,99,255,0.15);
  color:var(--text2);font-size:0.9rem;transition:all 0.2s;
}
.tab-btn.active,.tab-btn:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.tab-panel{display:none;background:var(--bg2);border-radius:var(--radius);padding:2rem;border:1px solid rgba(108,99,255,0.1)}
.tab-panel.active{display:block}
.tab-panel h3{color:var(--accent2);margin-bottom:0.75rem}
.tab-panel p{color:var(--text2);font-size:0.95rem}

/* Profile form */
.profile-form{margin-top:1.5rem;display:flex;gap:0.5rem;flex-wrap:wrap}
.profile-form input{
  flex:1;min-width:200px;padding:0.6rem 1rem;border-radius:6px;
  border:1px solid rgba(108,99,255,0.3);background:var(--bg);
  color:var(--text);font-size:0.9rem;
}
.profile-form input:focus{outline:none;border-color:var(--accent)}
.profile-form button{
  padding:0.6rem 1.2rem;border-radius:6px;border:none;
  background:var(--accent);color:#fff;font-size:0.9rem;cursor:pointer;
  transition:all 0.2s;
}
.profile-form button:hover{background:#8b5cf6}

/* Footer */
.footer{
  text-align:center;padding:3rem 2rem;
  border-top:1px solid rgba(108,99,255,0.1);color:var(--text2);font-size:0.9rem;
}
.footer a{color:var(--accent)}

/* Scroll animation */
.fade-in{opacity:0;transform:translateY(20px);transition:all 0.6s ease}
.fade-in.visible{opacity:1;transform:translateY(0)}

@media(max-width:600px){
  .nav{padding:0.8rem 1rem}
  .section{padding:3rem 1rem}
  .step{flex-direction:column;align-items:center;text-align:center}
}
${generateImpactWidgetCss()}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-logo">UnfilteredHub</div>
  <a href="?lang=${otherLang}" class="nav-lang">${s.langSwitch}</a>
</nav>

<section class="hero">
  <h1>${s.heroTitle}</h1>
  <p>${s.heroDesc}</p>
  <div class="hero-buttons">
    <a href="#setup" class="btn btn-primary">${s.ctaSetup}</a>
    <a href="#how" class="btn btn-secondary">${s.ctaHow}</a>
  </div>
</section>

${generateImpactWidgetHtml(lang)}

<section class="section" id="features">
  <div class="features-grid">
    <div class="feature-card fade-in">
      <div class="feature-icon">&#x1f512;</div>
      <h3>${s.featEncTitle}</h3>
      <p>${s.featEncDesc}</p>
    </div>
    <div class="feature-card fade-in">
      <div class="feature-icon">&#x1f441;</div>
      <h3>${s.featPrivTitle}</h3>
      <p>${s.featPrivDesc}</p>
    </div>
    <div class="feature-card fade-in">
      <div class="feature-icon">&#x26a1;</div>
      <h3>${s.featSpeedTitle}</h3>
      <p>${s.featSpeedDesc}</p>
    </div>
    <div class="feature-card fade-in">
      <div class="feature-icon">&#x1f381;</div>
      <h3>${s.featFreeTitle}</h3>
      <p>${s.featFreeDesc}</p>
    </div>
  </div>
</section>

<section class="section" id="how">
  <h2 class="section-title">${s.howTitle}</h2>
  <div class="how-box fade-in">
    <p>${s.howDesc}</p>
    <div class="how-flow">${s.howFlow}</div>
  </div>
</section>

<section class="section" id="setup">
  <h2 class="section-title">${s.setupTitle}</h2>
  <div class="steps">
    <div class="step fade-in">
      <div class="step-num">1</div>
      <div>
        <h3>${s.step1Title}</h3>
        <p>${s.step1Desc}</p>
      </div>
    </div>
    <div class="step fade-in">
      <div class="step-num">2</div>
      <div>
        <h3>${s.step2Title}</h3>
        <p>${s.step2Desc}</p>
        <code>npm install &amp;&amp; npx wrangler login</code>
      </div>
    </div>
    <div class="step fade-in">
      <div class="step-num">3</div>
      <div>
        <h3>${s.step3Title}</h3>
        <p>${s.step3Desc}</p>
        <code>npx wrangler deploy</code>
      </div>
    </div>
  </div>
</section>

<section class="section" id="devices">
  <h2 class="section-title">${s.devicesTitle}</h2>
  <div class="devices">
    <div class="tab-buttons">
      <button class="tab-btn active" data-tab="ios">${s.iosTitle}</button>
      <button class="tab-btn" data-tab="android">${s.androidTitle}</button>
      <button class="tab-btn" data-tab="windows">${s.windowsTitle}</button>
      <button class="tab-btn" data-tab="chrome">${s.chromeTitle}</button>
      <button class="tab-btn" data-tab="firefox">${s.firefoxTitle}</button>
    </div>
    <div class="tab-panel active" id="tab-ios">
      <h3>${s.iosTitle}</h3>
      <p>${s.iosDesc}</p>
      <div class="profile-form">
        <input type="text" id="profile-domain" placeholder="${s.profileFormPlaceholder}">
        <button onclick="downloadProfile()">${s.profileFormButton}</button>
      </div>
    </div>
    <div class="tab-panel" id="tab-android">
      <h3>${s.androidTitle}</h3>
      <p>${s.androidDesc}</p>
      <div class="profile-form">
        <input type="text" id="android-domain" placeholder="${s.profileFormPlaceholder}">
        <button onclick="openAndroidGuide()">${s.androidGuideBtn}</button>
      </div>
    </div>
    <div class="tab-panel" id="tab-windows">
      <h3>${s.windowsTitle}</h3>
      <p>${s.windowsDesc}</p>
    </div>
    <div class="tab-panel" id="tab-chrome">
      <h3>${s.chromeTitle}</h3>
      <p>${s.chromeDesc}</p>
    </div>
    <div class="tab-panel" id="tab-firefox">
      <h3>${s.firefoxTitle}</h3>
      <p>${s.firefoxDesc}</p>
    </div>
  </div>
</section>

<footer class="footer">
  <p>${s.footerText}</p>
  <p style="margin-top:0.5rem">
    <a href="https://github.com" target="_blank">${s.footerGithub}</a>
  </p>
</footer>

<script>
// Tabs
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  });
});

// Scroll animations
const obs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')});
},{threshold:0.1});
document.querySelectorAll('.fade-in').forEach(el=>obs.observe(el));

// Profile download
function downloadProfile(){
  const d=document.getElementById('profile-domain').value.trim();
  if(!d){document.getElementById('profile-domain').style.borderColor='#ef4444';return}
  window.location.href='/apple-profile?domain='+encodeURIComponent(d);
}

// Android guide
function openAndroidGuide(){
  const d=document.getElementById('android-domain').value.trim();
  if(!d){document.getElementById('android-domain').style.borderColor='#ef4444';return}
  window.location.href='/android?domain='+encodeURIComponent(d);
}
${generateImpactWidgetJs()}
</script>
</body>
</html>`;
}
