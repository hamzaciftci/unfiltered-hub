/**
 * UnfilteredHub — Setup Wizard
 * Interactive step-by-step guide for non-technical users.
 *
 * Steps:
 *   1. Enter/auto-detect Worker domain
 *   2. Select device (iOS, Android, Windows, Chrome, Firefox)
 *   3. Get DoH URL, QR code, profile links, test connection
 *
 * Fully client-side except the /dns-query test fetch.
 * QR code rendered with a pure-JS encoder (no CDN).
 */

import { escHtml, type Lang } from './utils';

const t = {
  tr: {
    title: 'Kurulum Sihirbazi',
    step1Title: 'Sunucu Adresi',
    step1Desc: 'Worker domain adresinizi girin veya otomatik algilayin.',
    domainLabel: 'Worker Domain',
    domainPlaceholder: 'ornek: my-worker.workers.dev',
    autoDetect: 'Otomatik Algila',
    step2Title: 'Cihaz Secin',
    step2Desc: 'DNS ayarlarini yapmak istediginiz cihazi secin.',
    step3Title: 'Kurulumu Tamamla',
    step3Desc: 'Asagidaki talimatlari takip edin.',
    dohUrl: 'DoH URL',
    copy: 'Kopyala',
    copied: 'Kopyalandi!',
    qrTitle: 'QR Kod',
    qrDesc: 'Telefonunuzla tarayin',
    testBtn: 'Baglantiyi Test Et',
    testing: 'Test ediliyor...',
    testSuccess: 'Basarili!',
    testFail: 'Baglanti basarisiz',
    resolver: 'Resolver',
    cache: 'Cache',
    abuseFlag: 'Guvenlik',
    responseTime: 'Yanit Suresi',
    downloadProfile: 'Profil Indir',
    viewGuide: 'Kurulum Rehberi',
    downloadConfig: 'Config Indir',
    prev: 'Geri',
    next: 'Ileri',
    back: 'Ana Sayfa',
    ios: 'iOS',
    android: 'Android',
    windows: 'Windows 11',
    chrome: 'Chrome / Edge',
    firefox: 'Firefox',
    iosInstructions: [
      'Asagidaki "Profil Indir" butonuna basin.',
      'Ayarlar > Genel > VPN ve Cihaz Yonetimi\'ne gidin.',
      'Indirilen profili yukleyin ve onaylayin.',
      'DNS sorgulariniz artik sifreli!',
    ],
    androidInstructions: [
      'Ayarlar > Ag ve Internet > Ozel DNS\'e gidin.',
      'Ozel DNS saglayici ana bilgisayar adi\'ni secin.',
      'Asagidaki domain\'i yapisirin (sadece host, https:// olmadan):',
      'Kaydedin. DNS sorgulariniz artik sifreli!',
    ],
    windowsInstructions: [
      'Ayarlar > Ag ve Internet > Wi-Fi (veya Ethernet) > Donanim ozellikleri\'ne gidin.',
      'DNS sunucu atamasi\'nda Duzenle\'ye tiklayin.',
      'Manuel\'i secin, HTTPS uzerinden DNS\'i acin.',
      'Asagidaki DoH URL\'yi yapisirin:',
    ],
    chromeInstructions: [
      'chrome://settings/security adresine gidin.',
      '"Guvenli DNS kullan" secenegini acin.',
      '"Ozel" secenegini secin.',
      'Asagidaki URL\'yi girin:',
    ],
    firefoxInstructions: [
      'about:preferences#general adresine gidin.',
      'Sayfanin en altina inin, Ag Ayarlari > Ayarlar\'a tiklayin.',
      '"HTTPS uzerinden DNS\'i Etkinlestir" kutusunu isaretleyin.',
      'Ozel\'i secin ve asagidaki URL\'yi girin:',
    ],
  },
  en: {
    title: 'Setup Wizard',
    step1Title: 'Server Address',
    step1Desc: 'Enter your Worker domain or auto-detect it.',
    domainLabel: 'Worker Domain',
    domainPlaceholder: 'e.g. my-worker.workers.dev',
    autoDetect: 'Auto-Detect',
    step2Title: 'Select Device',
    step2Desc: 'Choose the device you want to configure.',
    step3Title: 'Complete Setup',
    step3Desc: 'Follow the instructions below.',
    dohUrl: 'DoH URL',
    copy: 'Copy',
    copied: 'Copied!',
    qrTitle: 'QR Code',
    qrDesc: 'Scan with your phone',
    testBtn: 'Test Connection',
    testing: 'Testing...',
    testSuccess: 'Success!',
    testFail: 'Connection failed',
    resolver: 'Resolver',
    cache: 'Cache',
    abuseFlag: 'Security',
    responseTime: 'Response Time',
    downloadProfile: 'Download Profile',
    viewGuide: 'Setup Guide',
    downloadConfig: 'Download Config',
    prev: 'Back',
    next: 'Next',
    back: 'Home',
    ios: 'iOS',
    android: 'Android',
    windows: 'Windows 11',
    chrome: 'Chrome / Edge',
    firefox: 'Firefox',
    iosInstructions: [
      'Tap the "Download Profile" button below.',
      'Go to Settings > General > VPN & Device Management.',
      'Install and confirm the downloaded profile.',
      'Your DNS queries are now encrypted!',
    ],
    androidInstructions: [
      'Go to Settings > Network & Internet > Private DNS.',
      'Select "Private DNS provider hostname".',
      'Paste the domain below (host only, no https://):',
      'Save. Your DNS queries are now encrypted!',
    ],
    windowsInstructions: [
      'Go to Settings > Network & Internet > Wi-Fi (or Ethernet) > Hardware properties.',
      'Click Edit on DNS server assignment.',
      'Select Manual, enable DNS over HTTPS.',
      'Paste the DoH URL below:',
    ],
    chromeInstructions: [
      'Go to chrome://settings/security.',
      'Enable "Use secure DNS".',
      'Select "Custom".',
      'Enter the URL below:',
    ],
    firefoxInstructions: [
      'Go to about:preferences#general.',
      'Scroll to the bottom, click Network Settings > Settings.',
      'Check "Enable DNS over HTTPS".',
      'Select Custom and enter the URL below:',
    ],
  },
};

export function generateSetupPage(lang: Lang, requestHost: string): string {
  const l = t[lang];

  // Prepare instruction arrays as JS-safe JSON
  const instructionsMap = JSON.stringify({
    ios: l.iosInstructions,
    android: l.androidInstructions,
    windows: l.windowsInstructions,
    chrome: l.chromeInstructions,
    firefox: l.firefoxInstructions,
  });

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UnfilteredHub — ${escHtml(l.title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.wizard{max-width:560px;width:100%}
.steps-bar{display:flex;justify-content:center;gap:8px;margin-bottom:28px}
.step-dot{width:10px;height:10px;border-radius:50%;background:#333;transition:all .3s}
.step-dot.active{background:#2979ff;transform:scale(1.3)}
.step-dot.done{background:#00c853}
.card{background:#141414;border:1px solid #222;border-radius:16px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
h1{font-size:1.3rem;color:#fff;margin-bottom:4px;text-align:center}
.desc{text-align:center;color:#888;font-size:.85rem;margin-bottom:24px}
label{display:block;font-size:.8rem;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
.input-row{display:flex;gap:8px;margin-bottom:20px}
.input-row input{flex:1;padding:10px 12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:.9rem;outline:none;transition:border .2s}
.input-row input:focus{border-color:#2979ff}
.btn{padding:10px 20px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#ccc;font-size:.85rem;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:6px}
.btn:hover{background:#252525;border-color:#444;color:#fff}
.btn-primary{background:#2979ff;border-color:#2979ff;color:#fff}
.btn-primary:hover{background:#1565c0}
.btn-success{background:#00c853;border-color:#00c853;color:#fff}
.btn-success:hover{background:#00a844}
.devices{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px}
@media(max-width:400px){.devices{grid-template-columns:1fr}}
.device{padding:16px;background:#1a1a1a;border:2px solid #252525;border-radius:12px;cursor:pointer;text-align:center;transition:all .2s}
.device:hover{border-color:#444}
.device.selected{border-color:#2979ff;background:#1a2a4a}
.device-icon{font-size:1.6rem;margin-bottom:4px}
.device-name{font-size:.85rem;color:#ccc}
.nav{display:flex;justify-content:space-between;margin-top:24px}
.url-box{background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.url-box .url{flex:1;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:.82rem;color:#2979ff;word-break:break-all}
.url-box .copy-btn{background:none;border:1px solid #444;color:#888;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:.75rem;transition:all .2s;white-space:nowrap}
.url-box .copy-btn:hover{color:#fff;border-color:#666}
.url-box .copy-btn.ok{color:#00c853;border-color:#00c853}
.qr-section{text-align:center;margin:20px 0;padding:20px;background:#fff;border-radius:12px;display:inline-block}
.qr-wrap{display:flex;justify-content:center}
canvas#qrCanvas{image-rendering:pixelated}
.qr-label{font-size:.75rem;color:#666;margin-top:8px}
.instructions{margin:16px 0}
.instructions ol{padding-left:20px;list-style:decimal}
.instructions li{padding:6px 0;font-size:.85rem;color:#ccc;line-height:1.5}
.host-display{background:#0a0a0a;border:1px solid #333;border-radius:6px;padding:6px 10px;font-family:monospace;font-size:.82rem;color:#ff9800;display:inline-block;margin:4px 0}
.profile-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.profile-actions .btn{flex:1;justify-content:center;min-width:120px}
.test-section{margin-top:20px;padding:16px;background:#0d0d0d;border:1px solid #222;border-radius:10px}
.test-result{margin-top:12px;display:none}
.test-row{display:flex;justify-content:space-between;padding:6px 0;font-size:.82rem;border-bottom:1px solid #1a1a1a}
.test-row:last-child{border-bottom:none}
.test-row .tl{color:#888}
.test-row .tv{color:#fff;font-weight:500}
.test-ok{display:flex;align-items:center;gap:8px;color:#00c853;font-weight:600;font-size:.9rem;margin-bottom:8px}
.test-fail{color:#f44336;font-weight:600;font-size:.9rem;margin-bottom:8px}
.footer{text-align:center;margin-top:24px}
.footer a{color:#555;text-decoration:none;font-size:.8rem;transition:color .2s}
.footer a:hover{color:#aaa}
.hidden{display:none!important}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid #444;border-top-color:#2979ff;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wizard">
  <div class="steps-bar">
    <div class="step-dot active" id="dot0"></div>
    <div class="step-dot" id="dot1"></div>
    <div class="step-dot" id="dot2"></div>
  </div>

  <!-- Step 1: Domain -->
  <div class="card" id="step0">
    <h1>${escHtml(l.step1Title)}</h1>
    <p class="desc">${escHtml(l.step1Desc)}</p>
    <label>${escHtml(l.domainLabel)}</label>
    <div class="input-row">
      <input type="text" id="domainInput" placeholder="${escHtml(l.domainPlaceholder)}" />
      <button class="btn" onclick="autoDetect()">${escHtml(l.autoDetect)}</button>
    </div>
    <div class="nav">
      <span></span>
      <button class="btn btn-primary" onclick="goStep(1)">${escHtml(l.next)}</button>
    </div>
  </div>

  <!-- Step 2: Device -->
  <div class="card hidden" id="step1">
    <h1>${escHtml(l.step2Title)}</h1>
    <p class="desc">${escHtml(l.step2Desc)}</p>
    <div class="devices">
      <div class="device" onclick="selectDevice('ios')" id="dev-ios">
        <div class="device-icon">\uD83D\uDCF1</div>
        <div class="device-name">${escHtml(l.ios)}</div>
      </div>
      <div class="device" onclick="selectDevice('android')" id="dev-android">
        <div class="device-icon">\uD83E\uDD16</div>
        <div class="device-name">${escHtml(l.android)}</div>
      </div>
      <div class="device" onclick="selectDevice('windows')" id="dev-windows">
        <div class="device-icon">\uD83D\uDDA5\uFE0F</div>
        <div class="device-name">${escHtml(l.windows)}</div>
      </div>
      <div class="device" onclick="selectDevice('chrome')" id="dev-chrome">
        <div class="device-icon">\uD83C\uDF10</div>
        <div class="device-name">${escHtml(l.chrome)}</div>
      </div>
      <div class="device" onclick="selectDevice('firefox')" id="dev-firefox">
        <div class="device-icon">\uD83E\uDD8A</div>
        <div class="device-name">${escHtml(l.firefox)}</div>
      </div>
    </div>
    <div class="nav">
      <button class="btn" onclick="goStep(0)">${escHtml(l.prev)}</button>
      <button class="btn btn-primary" onclick="goStep(2)" id="nextStep2">${escHtml(l.next)}</button>
    </div>
  </div>

  <!-- Step 3: Instructions -->
  <div class="card hidden" id="step2">
    <h1>${escHtml(l.step3Title)}</h1>
    <p class="desc">${escHtml(l.step3Desc)}</p>

    <label>${escHtml(l.dohUrl)}</label>
    <div class="url-box">
      <span class="url" id="dohUrlDisplay"></span>
      <button class="copy-btn" onclick="copyUrl(this)">${escHtml(l.copy)}</button>
    </div>

    <div class="qr-wrap">
      <div class="qr-section">
        <canvas id="qrCanvas" width="200" height="200"></canvas>
        <div class="qr-label">${escHtml(l.qrDesc)}</div>
      </div>
    </div>

    <div class="instructions" id="instructionsList"></div>

    <div id="hostDisplay" class="hidden" style="margin:8px 0">
      <div class="host-display" id="hostOnlyDisplay"></div>
    </div>

    <div class="profile-actions" id="profileActions"></div>

    <div class="test-section">
      <button class="btn btn-primary" onclick="testConnection()" id="testBtn" style="width:100%;justify-content:center">
        ${escHtml(l.testBtn)}
      </button>
      <div class="test-result" id="testResult"></div>
    </div>

    <div class="nav">
      <button class="btn" onclick="goStep(1)">${escHtml(l.prev)}</button>
      <span></span>
    </div>
  </div>

  <div class="footer">
    <a href="/">${escHtml(l.back)}</a>
  </div>
</div>

<script>
// ── State ──
let currentStep = 0;
let selectedDevice = null;
const lang = '${lang}';
const hostHint = '${escHtml(requestHost)}';
const INSTRUCTIONS = ${instructionsMap};
const L = {
  copy:'${escHtml(l.copy)}',copied:'${escHtml(l.copied)}',
  testBtn:'${escHtml(l.testBtn)}',testing:'${escHtml(l.testing)}',
  testSuccess:'${escHtml(l.testSuccess)}',testFail:'${escHtml(l.testFail)}',
  resolver:'${escHtml(l.resolver)}',cache:'${escHtml(l.cache)}',
  abuseFlag:'${escHtml(l.abuseFlag)}',responseTime:'${escHtml(l.responseTime)}',
  downloadProfile:'${escHtml(l.downloadProfile)}',viewGuide:'${escHtml(l.viewGuide)}',
  downloadConfig:'${escHtml(l.downloadConfig)}',
};

// ── Init ──
if(hostHint && hostHint!=='127.0.0.1:8787' && hostHint!=='localhost:8787'){
  document.getElementById('domainInput').value = hostHint;
}

// ── Navigation ──
function goStep(n){
  if(n===1){
    const d=getDomain();
    if(!d){document.getElementById('domainInput').focus();return;}
  }
  if(n===2){
    if(!selectedDevice)return;
    renderStep3();
  }
  document.getElementById('step'+currentStep).classList.add('hidden');
  document.getElementById('step'+n).classList.remove('hidden');
  document.getElementById('dot'+currentStep).classList.remove('active');
  if(n>currentStep)document.getElementById('dot'+currentStep).classList.add('done');
  document.getElementById('dot'+n).classList.add('active');
  currentStep=n;
}

function getDomain(){
  return document.getElementById('domainInput').value.trim().replace(/^https?:\\/\\//,'').replace(/\\/.*$/,'');
}

function autoDetect(){
  document.getElementById('domainInput').value = location.host;
}

// ── Device selection ──
function selectDevice(dev){
  document.querySelectorAll('.device').forEach(d=>d.classList.remove('selected'));
  document.getElementById('dev-'+dev).classList.add('selected');
  selectedDevice=dev;
}

// ── Step 3 render ──
function renderStep3(){
  const domain=getDomain();
  const dohUrl='https://'+domain+'/dns-query';
  document.getElementById('dohUrlDisplay').textContent=dohUrl;
  renderQR(dohUrl);
  // Instructions
  const steps=INSTRUCTIONS[selectedDevice]||[];
  let html='<ol>';
  steps.forEach(s=>{html+='<li>'+escHtml(s)+'</li>';});
  html+='</ol>';
  document.getElementById('instructionsList').innerHTML=html;
  // Host-only display for Android
  const hostEl=document.getElementById('hostDisplay');
  const hostOnly=document.getElementById('hostOnlyDisplay');
  if(selectedDevice==='android'){
    hostEl.classList.remove('hidden');
    hostOnly.textContent=domain;
  }else{
    hostEl.classList.add('hidden');
  }
  // Profile action buttons
  let actions='';
  if(selectedDevice==='ios'){
    actions='<a class="btn btn-success" href="/apple-profile?domain='+encodeURIComponent(domain)+'" target="_blank">'+L.downloadProfile+'</a>';
  }else if(selectedDevice==='android'){
    actions='<a class="btn btn-primary" href="/android?domain='+encodeURIComponent(domain)+'&lang='+lang+'" target="_blank">'+L.viewGuide+'</a>';
    actions+='<a class="btn" href="/android-config?domain='+encodeURIComponent(domain)+'" target="_blank">'+L.downloadConfig+'</a>';
  }
  document.getElementById('profileActions').innerHTML=actions;
  // Reset test
  document.getElementById('testResult').style.display='none';
}

function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function copyUrl(btn){
  const url=document.getElementById('dohUrlDisplay').textContent;
  navigator.clipboard.writeText(url).then(()=>{
    btn.textContent=L.copied;btn.classList.add('ok');
    setTimeout(()=>{btn.textContent=L.copy;btn.classList.remove('ok');},1500);
  });
}

// ── Test Connection ──
async function testConnection(){
  const domain=getDomain();
  const btn=document.getElementById('testBtn');
  const result=document.getElementById('testResult');
  btn.innerHTML='<span class="spinner"></span> '+L.testing;
  btn.disabled=true;
  result.style.display='none';
  const url='https://'+domain+'/dns-query?name=example.com&type=A';
  const start=performance.now();
  try{
    const res=await fetch(url);
    const elapsed=Math.round(performance.now()-start);
    const resolver=res.headers.get('X-Resolver')||'—';
    const cache=res.headers.get('X-Cache')||'—';
    const abuse=res.headers.get('X-Abuse-Flag')||'clean';
    if(res.ok){
      result.innerHTML=
        '<div class="test-ok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00c853" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg> '+L.testSuccess+'</div>'+
        '<div class="test-row"><span class="tl">'+L.resolver+'</span><span class="tv">'+escHtml(resolver)+'</span></div>'+
        '<div class="test-row"><span class="tl">'+L.cache+'</span><span class="tv">'+escHtml(cache)+'</span></div>'+
        '<div class="test-row"><span class="tl">'+L.abuseFlag+'</span><span class="tv">'+escHtml(abuse)+'</span></div>'+
        '<div class="test-row"><span class="tl">'+L.responseTime+'</span><span class="tv">'+elapsed+' ms</span></div>';
    }else{
      result.innerHTML='<div class="test-fail">'+L.testFail+' (HTTP '+res.status+')</div>';
    }
  }catch(e){
    result.innerHTML='<div class="test-fail">'+L.testFail+'</div>';
  }
  result.style.display='block';
  btn.innerHTML=L.testBtn;
  btn.disabled=false;
}

// ── QR Code Generator (pure JS, no dependencies) ──
// Minimal QR encoder: byte mode, EC level L, versions 1-10
function renderQR(text){
  const canvas=document.getElementById('qrCanvas');
  const ctx=canvas.getContext('2d');
  try{
    const modules=generateQR(text);
    const size=modules.length;
    const scale=Math.floor(180/size);
    const total=size*scale;
    canvas.width=total+20;
    canvas.height=total+20;
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#000';
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        if(modules[y][x])ctx.fillRect(10+x*scale,10+y*scale,scale,scale);
      }
    }
  }catch(e){
    canvas.width=200;canvas.height=60;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,200,60);
    ctx.fillStyle='#999';ctx.font='12px sans-serif';
    ctx.textAlign='center';ctx.fillText('QR generation failed',100,35);
  }
}

function generateQR(text){
  const data=new TextEncoder().encode(text);
  const len=data.length;
  // Version selection (EC level L, byte mode)
  const caps=[0,17,32,53,78,106,134,154,192,230,271];
  let ver=1;
  for(let v=1;v<=10;v++){if(caps[v]>=len){ver=v;break;}}
  if(caps[ver]<len)ver=10;
  const size=ver*4+17;
  // Total data codewords and EC codewords per block (Level L)
  const ecInfo=[
    null,
    {total:26,ec:7,blocks:1},{total:44,ec:10,blocks:1},{total:70,ec:15,blocks:1},
    {total:100,ec:20,blocks:1},{total:134,ec:26,blocks:1},{total:172,ec:18,blocks:2},
    {total:196,ec:20,blocks:2},{total:242,ec:24,blocks:2},{total:292,ec:30,blocks:2},
    {total:346,ec:18,blocks:2},
  ];
  const info=ecInfo[ver];
  const totalCodewords=info.total;
  const ecPerBlock=info.ec;
  const numBlocks=info.blocks;
  const dataCodewords=totalCodewords-ecPerBlock*numBlocks;
  // Encode data (byte mode indicator=0100)
  const bits=[];
  function pushBits(val,count){for(let i=count-1;i>=0;i--)bits.push((val>>i)&1);}
  pushBits(4,4); // Mode: byte
  pushBits(len,ver<=9?8:16); // Character count
  for(const b of data)pushBits(b,8);
  // Terminator
  const capacity=dataCodewords*8;
  const termLen=Math.min(4,capacity-bits.length);
  pushBits(0,termLen);
  // Pad to byte boundary
  while(bits.length%8!==0)bits.push(0);
  // Pad codewords
  const pads=[0xEC,0x11];let pi=0;
  while(bits.length<capacity){pushBits(pads[pi],8);pi^=1;}
  // Convert to bytes
  const codewords=[];
  for(let i=0;i<bits.length;i+=8){
    codewords.push((bits[i]<<7)|(bits[i+1]<<6)|(bits[i+2]<<5)|(bits[i+3]<<4)|(bits[i+4]<<3)|(bits[i+5]<<2)|(bits[i+6]<<1)|bits[i+7]);
  }
  // Reed-Solomon error correction
  const dcPerBlock=Math.floor(dataCodewords/numBlocks);
  const remainder=dataCodewords%numBlocks;
  const allBlocks=[];
  let offset=0;
  for(let b=0;b<numBlocks;b++){
    const count=dcPerBlock+(b<remainder?1:0);
    const block=codewords.slice(offset,offset+count);
    offset+=count;
    const ec=rsEncode(block,ecPerBlock);
    allBlocks.push({data:block,ec:ec});
  }
  // Interleave
  const final=[];
  const maxDc=dcPerBlock+(remainder>0?1:0);
  for(let i=0;i<maxDc;i++)for(const bl of allBlocks)if(i<bl.data.length)final.push(bl.data[i]);
  for(let i=0;i<ecPerBlock;i++)for(const bl of allBlocks)final.push(bl.ec[i]);
  // Build matrix
  const grid=Array.from({length:size},()=>Array(size).fill(null));
  const reserved=Array.from({length:size},()=>Array(size).fill(false));
  // Finder patterns
  function finderPattern(r,c){
    for(let dr=-1;dr<=7;dr++)for(let dc=-1;dc<=7;dc++){
      const rr=r+dr,cc=c+dc;
      if(rr<0||rr>=size||cc<0||cc>=size)continue;
      const outer=dr===-1||dr===7||dc===-1||dc===7;
      const ring=dr===0||dr===6||dc===0||dc===6;
      const inner=dr>=2&&dr<=4&&dc>=2&&dc<=4;
      grid[rr][cc]=outer?0:(ring||inner)?1:0;
      reserved[rr][cc]=true;
    }
  }
  finderPattern(0,0);finderPattern(0,size-7);finderPattern(size-7,0);
  // Timing patterns
  for(let i=8;i<size-8;i++){
    grid[6][i]=i%2===0?1:0;reserved[6][i]=true;
    grid[i][6]=i%2===0?1:0;reserved[i][6]=true;
  }
  // Alignment patterns (versions 2+)
  if(ver>=2){
    const positions=alignmentPositions(ver);
    for(const r of positions)for(const c of positions){
      if(reserved[r][c])continue;
      for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
        const m=Math.abs(dr)===2||Math.abs(dc)===2?1:((dr===0&&dc===0)?1:0);
        grid[r+dr][c+dc]=m;reserved[r+dr][c+dc]=true;
      }
    }
  }
  // Dark module
  grid[size-8][8]=1;reserved[size-8][8]=true;
  // Reserve format info areas
  for(let i=0;i<9;i++){
    if(i<size){reserved[8][i]=true;reserved[i][8]=true;}
  }
  for(let i=0;i<8;i++){
    reserved[8][size-1-i]=true;reserved[size-1-i][8]=true;
  }
  // Place data
  let bitIdx=0;
  const dataBits=[];
  for(const b of final)for(let i=7;i>=0;i--)dataBits.push((b>>i)&1);
  // Remainder bits
  const remBits=[0,0,7,7,7,7,7,0,0,0,0][ver]||0;
  for(let i=0;i<remBits;i++)dataBits.push(0);
  let col=size-1;
  let upward=true;
  while(col>=0){
    if(col===6)col--;
    for(let row=0;row<size;row++){
      const r=upward?size-1-row:row;
      for(let dc=0;dc<=1;dc++){
        const c=col-dc;
        if(c<0||reserved[r][c])continue;
        grid[r][c]=bitIdx<dataBits.length?dataBits[bitIdx]:0;
        bitIdx++;
      }
    }
    upward=!upward;
    col-=2;
  }
  // Masking (try all 8, pick best)
  let bestMask=0,bestPenalty=Infinity;
  for(let m=0;m<8;m++){
    const masked=applyMask(grid,reserved,m,size);
    applyFormatInfo(masked,reserved,m,size);
    const pen=penalty(masked,size);
    if(pen<bestPenalty){bestPenalty=pen;bestMask=m;}
  }
  const result=applyMask(grid,reserved,bestMask,size);
  applyFormatInfo(result,reserved,bestMask,size);
  return result;
}

function applyMask(grid,reserved,mask,size){
  const out=grid.map(r=>[...r]);
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    if(reserved[r][c])continue;
    let flip=false;
    switch(mask){
      case 0:flip=(r+c)%2===0;break;
      case 1:flip=r%2===0;break;
      case 2:flip=c%3===0;break;
      case 3:flip=(r+c)%3===0;break;
      case 4:flip=(Math.floor(r/2)+Math.floor(c/3))%2===0;break;
      case 5:flip=(r*c)%2+(r*c)%3===0;break;
      case 6:flip=((r*c)%2+(r*c)%3)%2===0;break;
      case 7:flip=((r+c)%2+(r*c)%3)%2===0;break;
    }
    if(flip)out[r][c]^=1;
  }
  return out;
}

function applyFormatInfo(grid,reserved,mask,size){
  // Format info: EC level L = 01, mask pattern 3 bits
  const formatBits=getFormatBits(1,mask); // ecLevel L=1
  // Place around finders
  const positions=[
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
  ];
  for(let i=0;i<15;i++){
    const bit=formatBits[i];
    const [r,c]=positions[i];
    grid[r][c]=bit;
  }
  // Second copy
  for(let i=0;i<7;i++)grid[size-1-i][8]=formatBits[i];
  for(let i=7;i<15;i++)grid[8][size-15+i]=formatBits[i];
}

function getFormatBits(ecLevel,mask){
  // Pre-computed format strings for EC level L (binary 01)
  const table=[
    [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0],
    [1,1,1,0,0,1,0,1,1,1,1,0,0,1,1],
    [1,1,1,1,1,0,1,1,0,1,0,1,0,1,0],
    [1,1,1,1,0,0,0,1,0,0,1,1,1,0,1],
    [1,1,0,0,1,1,0,0,0,1,0,1,1,1,1],
    [1,1,0,0,0,1,1,0,0,0,1,1,0,0,0],
    [1,1,0,1,1,0,0,0,1,0,0,0,0,0,1],
    [1,1,0,1,0,0,1,0,1,1,1,0,1,1,0],
  ];
  return table[mask];
}

function penalty(grid,size){
  let score=0;
  // Rule 1: runs of same color
  for(let r=0;r<size;r++){let run=1;for(let c=1;c<size;c++){if(grid[r][c]===grid[r][c-1])run++;else{if(run>=5)score+=run-2;run=1;}}if(run>=5)score+=run-2;}
  for(let c=0;c<size;c++){let run=1;for(let r=1;r<size;r++){if(grid[r][c]===grid[r-1][c])run++;else{if(run>=5)score+=run-2;run=1;}}if(run>=5)score+=run-2;}
  // Rule 2: 2x2 blocks
  for(let r=0;r<size-1;r++)for(let c=0;c<size-1;c++){const v=grid[r][c];if(v===grid[r][c+1]&&v===grid[r+1][c]&&v===grid[r+1][c+1])score+=3;}
  // Rule 4: balance
  let dark=0;for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(grid[r][c])dark++;
  const pct=dark*100/(size*size);
  const prev=Math.floor(pct/5)*5;
  const next=prev+5;
  score+=Math.min(Math.abs(prev-50)/5,Math.abs(next-50)/5)*10;
  return score;
}

function alignmentPositions(ver){
  if(ver===1)return[];
  const table=[null,null,[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  return table[ver]||[];
}

// Reed-Solomon over GF(256)
const GF_EXP=new Uint8Array(512);
const GF_LOG=new Uint8Array(256);
(function(){
  let x=1;
  for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x<<=1;if(x>=256)x^=0x11d;}
  for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];
})();
function gfMul(a,b){if(a===0||b===0)return 0;return GF_EXP[GF_LOG[a]+GF_LOG[b]];}
function rsEncode(data,ecCount){
  const gen=rsGeneratorPoly(ecCount);
  const result=new Uint8Array(ecCount);
  for(const b of data){
    const lead=b^result[0];
    for(let i=0;i<ecCount-1;i++)result[i]=result[i+1]^gfMul(gen[i],lead);
    result[ecCount-1]=gfMul(gen[ecCount-1],lead);
  }
  return Array.from(result);
}
function rsGeneratorPoly(n){
  let poly=[1];
  for(let i=0;i<n;i++){
    const next=new Uint8Array(poly.length+1);
    for(let j=0;j<poly.length;j++){
      next[j]^=gfMul(poly[j],GF_EXP[i]);
      next[j+1]^=poly[j];
    }
    poly=next;
  }
  return poly.slice(0,n);
}
</script>
</body>
</html>`;
}
