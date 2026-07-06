# unfilteredhub-doh — Detayli Teknik Dokumantasyon

Bu dokuman, unfilteredhub-doh projesinin tum teknik detaylarini, kaynak kod yapisini, her modulun isleyisini ve gelismis yapilandirma seceneklerini kapsar.

---

## Icerik

- [Genel Bakis](#genel-bakis)
- [Kaynak Kod Yapisi](#kaynak-kod-yapisi)
- [Modul Detaylari](#modul-detaylari)
  - [index.ts — Ana Router](#indexts--ana-router)
  - [blocker.ts — DNS Engelleme Motoru](#blockerts--dns-engelleme-motoru)
  - [blocklist.ts — Gomulu Blocklist](#blocklistts--gomulu-blocklist)
  - [cache.ts — DNS Onbellek Katmani](#cachets--dns-onbellek-katmani)
  - [stats.ts — Istatistik Sayaclari](#statsts--istatistik-sayaclari)
  - [admin.ts — Admin API](#admints--admin-api)
  - [landing.ts — Landing Page](#landingts--landing-page)
  - [apple-profile.ts — Apple Profil Olusturucu](#apple-profilets--apple-profil-olusturucu)
- [DNS Protokolu Detaylari](#dns-protokolu-detaylari)
- [Blocklist Sistemi](#blocklist-sistemi)
- [Cache Mekanizmasi](#cache-mekanizmasi)
- [Istatistik Sistemi](#istatistik-sistemi)
- [Guvenlik Modeli](#guvenlik-modeli)
- [Performans Notlari](#performans-notlari)
- [Hata Ayiklama](#hata-ayiklama)
- [Bilinen Sinirlamalar](#bilinen-sinirlamalar)

---

## Genel Bakis

unfilteredhub-doh, Cloudflare Workers uzerinde calisan tek dosyadan olusan (bundle) bir DNS-over-HTTPS proxy'sidir. TypeScript ile yazilmistir ve Wrangler CLI ile build/deploy edilir.

**Temel akim:**

1. Istemci HTTPS uzerinden DNS sorgusu gonderir
2. Worker domain'i parse eder
3. Blocklist kontrolu yapar (KV + gomulu liste)
4. Engelleniyorsa NXDOMAIN doner
5. Cache kontrolu yapar
6. Cache varsa cache'den doner
7. Yoksa Cloudflare DNS'e iletir
8. Cevabin cache'ler ve istatistik kaydeder (arka planda)
9. Cevapin istemciye doner

---

## Kaynak Kod Yapisi

```
src/
├── index.ts          # 200 satir — Ana router, DNS proxy, tum modullerin entegrasyonu
├── blocker.ts        # 137 satir — Domain engelleme mantigi, wireformat parser
├── blocklist.ts      # 386 satir — ~300 reklam/tracker domain (Set<string>)
├── cache.ts          # 110 satir — Workers Cache API ile DNS onbellekleme
├── stats.ts          # 108 satir — Gunluk sorgu istatistikleri (KV)
├── admin.ts          # 160 satir — API key ile korunan yonetim endpoint'leri
├── landing.ts        # 437 satir — Bilingual landing page HTML generator
└── apple-profile.ts  #  92 satir — .mobileconfig XML generator
```

**Toplam:** ~1.630 satir TypeScript

---

## Modul Detaylari

### index.ts — Ana Router

**Gorev:** Tum HTTP isteklerini uygun handler'a yonlendirir.

**Env Interface:**
```typescript
interface Env {
  BLOCKLIST?: KVNamespace;  // Opsiyonel KV blocklist
  ADMIN_KEY?: string;       // Admin API key (wrangler secret)
}
```

**Fonksiyon imzasi:**
```typescript
fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>
```

**Route tablosu:**

| Yol | Metod | Handler | Aciklama |
|-----|-------|---------|----------|
| `/` | GET | `generateLandingPage()` | Landing page (TR/EN) |
| `/health` | GET | inline | Saglik kontrolu JSON |
| `/apple-profile` | GET | `generateMobileConfig()` | .mobileconfig indirme |
| `/admin/*` | ALL | `handleAdmin()` | Admin API (auth gerekli) |
| `/dns-query` | GET | DNS handler | JSON veya wireformat sorgu |
| `/dns-query` | POST | DNS handler | Binary DNS sorgu |
| `OPTIONS` | ALL | inline | CORS preflight |

**DNS sorgu akisi (GET JSON):**
1. `isBlocked(name, kv)` — blocklist kontrolu
2. `getCachedResponse(name, type)` — cache kontrolu
3. `fetch(upstream)` — Cloudflare DNS'e ilet
4. `ctx.waitUntil(cacheResponse(...))` — cache'e yaz (arka plan)
5. `ctx.waitUntil(recordQuery(...))` — istatistik kaydet (arka plan)

---

### blocker.ts — DNS Engelleme Motoru

**Exportlar:**

#### `isBlocked(domain, kv?): Promise<boolean>`
- Domain'i normalize eder (lowercase, trailing dot kaldirma)
- Subdomain hierarchy'si uzerinde iterasyon yapar
- Ornek: `ads.track.example.com` icin sirasiyla kontrol eder:
  - `ads.track.example.com`
  - `track.example.com`
  - `example.com`
- Her seviyede once KV, sonra gomulu liste kontrol eder

#### `buildBlockedJsonResponse(): Response`
- DNS JSON formatinda NXDOMAIN (Status: 3) cevabi olusturur
- `"Comment": "Blocked by UnfilteredHub"` iceririr

#### `buildBlockedWireResponse(queryBuffer): Response`
- DNS wireformat'ta NXDOMAIN cevabi olusturur
- Query ID'yi korur (byte 0-1)
- QR=1, RD=1, RA=1, RCODE=3 bayraklari set eder
- ANCOUNT, NSCOUNT, ARCOUNT = 0

#### `parseDomainFromWire(buffer): string | null`
- DNS wireformat'tan domain adi parse eder
- Header'i atlar (12 byte)
- Label-length encoding cozumler: `[len][chars][len][chars]...[0]`
- Compression pointer'lari handle eder
- Hatali buffer'larda `null` doner

---

### blocklist.ts — Gomulu Blocklist

**Export:** `CORE_BLOCKLIST: Set<string>` (~300 domain)

**Kategoriler:**
- Google Ads / DoubleClick (15 domain)
- Google Analytics / Tag Manager (6)
- Facebook / Meta (7)
- Amazon Ads (6)
- Microsoft / Bing Telemetry (18)
- Twitter / X (4)
- TikTok (4)
- Criteo, Taboola, Outbrain (13)
- AppNexus / Xandr (4)
- Yahoo / Adobe / DoubleVerify (11)
- Tracking / Fingerprinting (16)
- Hotjar / FullStory / Session Replay (6)
- Mixpanel / Segment / Amplitude (7)
- Diger reklam aglari (40+)
- Popup / redirect aglari (10)
- Turk reklam aglari (4)
- Data broker'lar (8)
- Mobil reklam SDK'lari (11)
- Telemetri / crash reporting (10)
- Sosyal widget tracking (10)
- Video reklamlar (4)
- E-posta tracking (3)
- Kripto madencileri (7)
- SmartTV / IoT telemetri (7)

---

### cache.ts — DNS Onbellek Katmani

**Mekanizma:** Cloudflare Workers Cache API (ucretsiz, KV degil)

**Sabitler:**
- `MIN_TTL`: 60 saniye
- `MAX_TTL`: 3600 saniye (1 saat)
- `DEFAULT_TTL`: 300 saniye (5 dakika)

**Cache key formati:**
```
https://dns-cache.unfilteredhub.com/{domain}/{TYPE}
```

#### `getCachedResponse(domain, type): Promise<Response | null>`
- `caches.default.match(key)` ile cache'ten okur
- Varsa `X-Cache: HIT` header'i ekler
- Cache API kullanilamazsa (lokal dev) sessizce `null` doner

#### `cacheResponse(domain, type, response, body): Promise<void>`
- `extractTTL()` ile DNS cevabindan TTL cikarir
- `Cache-Control: s-maxage={ttl}` header'i ile cache'e yazar
- `X-Cache: MISS` ve `X-Cache-TTL` header'lari ekler

#### `extractTTL(body): number`
- JSON DNS cevabindaki Answer, Authority, Additional section'larindan minimum TTL bulur
- MIN_TTL ve MAX_TTL arasinda clamp eder

---

### stats.ts — Istatistik Sayaclari

**Sampling mekanizmasi:**
- Her istek icin KV yazma yapmak free tier limitini asar
- `SAMPLE_RATE = 10`: Her 10. istekte bir KV'ye yazar
- Yazarken sayaclari x10 arttirir (yakinsama)
- In-memory `requestCounter` izole basina calisir

**KV key formati:**
```
stats:YYYY-MM-DD
```

**KV value (JSON):**
```json
{ "total": 1250, "blocked": 340, "cached": 580, "date": "2026-02-13" }
```

**Expiration:** 48 saat (otomatik temizlik)

#### `recordQuery(kv, opts): Promise<void>`
- `ctx.waitUntil()` ile cagirilir (non-blocking)
- Sampling kontrolu yapar
- Mevcut stats'i okur, gunceller, geri yazar

#### `getStats(kv, date?): Promise<DailyStats | null>`
- Belirli bir gunun istatistiklerini doner

#### `getWeeklyStats(kv, days): Promise<DailyStats[]>`
- Son N gunun istatistiklerini doner

---

### admin.ts — Admin API

**Kimlik dogrulama:** `X-API-Key` header'i `env.ADMIN_KEY` ile eslesmelidir.

#### `GET /admin/stats`
Cevap yapisi:
```json
{
  "blocklist": { "coreSize": 298, "kvSize": 85432, "kvAvailable": true },
  "queries": {
    "today": { "total": 0, "blocked": 0, "cached": 0, "date": "..." },
    "weekly": [...]
  }
}
```

#### `GET /admin/blocklist?cursor=xxx&limit=100`
- KV'deki domainleri paginate eder
- Maksimum limit: 1000
- `cursor` ve `complete` alanlari ile pagination

#### `POST /admin/blocklist`
- Body: `{ "domains": ["..."] }`
- Domainleri normalize eder (lowercase, trim, trailing dot)
- Tek seferde maksimum 25 domain yazar

#### `DELETE /admin/blocklist`
- Body: `{ "domains": ["..."] }`
- Belirtilen domainleri KV'den siler

---

### landing.ts — Landing Page

- `generateLandingPage(lang: 'tr' | 'en'): string` fonksiyonu
- Inline CSS (harici bagimlillik yok)
- Koyu tema, gradient arka plan, responsive
- Intersection Observer ile scroll animasyonlari
- Tab sistemi ile cihaz ayarlari (iOS, Android, Windows, Chrome, Firefox)
- Apple profil indirme formu (`/apple-profile` endpoint'ine yonlendirir)

---

### apple-profile.ts — Apple Profil Olusturucu

- `generateMobileConfig(domain: string): string` fonksiyonu
- Apple Configuration Profile XML (plist) formati
- `com.apple.dnsSettings.managed` payload tipi
- OnDemandRules: her zaman Connect
- Deterministic UUID: domain'den hash ile uretilir (ayni domain = ayni UUID)
- XML escape fonksiyonu ile guvenli output

---

## DNS Protokolu Detaylari

### Desteklenen Formatlar

1. **JSON (application/dns-json)**: `GET /dns-query?name=x&type=A`
2. **Wireformat GET (application/dns-message)**: `GET /dns-query?dns=base64url`
3. **Wireformat POST (application/dns-message)**: `POST /dns-query` + binary body

### Wireformat Yapisi (RFC 1035)

```
Header (12 byte):
  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
  |                    ID (16 bit)                    |
  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
  |QR|  Opcode |AA|TC|RD|RA|   Z    |    RCODE      |
  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
  |                  QDCOUNT (16 bit)                 |
  |                  ANCOUNT (16 bit)                 |
  |                  NSCOUNT (16 bit)                 |
  |                  ARCOUNT (16 bit)                 |
  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+

Question Section (byte 12+):
  [length][label][length][label]...[0][QTYPE][QCLASS]
```

### NXDOMAIN Response

Engellenen domainler icin:
- QR = 1 (response)
- RD = 1 (recursion desired)
- RA = 1 (recursion available)
- RCODE = 3 (NXDOMAIN)
- ANCOUNT = 0, NSCOUNT = 0, ARCOUNT = 0

---

## Blocklist Sistemi

### Hybrid Mimari

```
DNS Sorgusu
    |
    v
┌──────────────┐     ┌──────────────┐
│  KV Extended  │────>│  Gomulu Core │
│  List (80K+)  │     │  List (~300) │
│  (opsiyonel)  │     │  (her zaman) │
└──────────────┘     └──────────────┘
    |                     |
    v                     v
  Engelle              Engelle
    veya                veya
  Sonraki             Gecir
  seviye
```

### Subdomain Eslesmesi

`tracker.ads.example.com` sorgusu icin kontrol sirasi:
1. `tracker.ads.example.com` — KV + core
2. `ads.example.com` — KV + core
3. `example.com` — KV + core

### Import Kaynaklari

- **Steven Black Unified Hosts**: ~80.000 domain (hosts formati)
- **AdGuard DNS Filter**: ~50.000 domain (adblock formati)
- Toplam: ~100.000+ benzersiz domain

---

## Cache Mekanizmasi

### Cache API vs KV

| Ozellik | Cache API | KV |
|---------|-----------|-----|
| Maliyet | Ucretsiz | Ucretsiz (limitli) |
| Okuma hizi | <1ms | ~10ms |
| Yazma limiti | Yok | 1000/gun |
| TTL kontrolu | Otomatik | Manuel |
| Global dagilim | CDN POP'lari | Eventually consistent |

Cache API, DNS onbellekleme icin ideal secimdir.

### TTL Hiyerarsisi

1. DNS cevabindaki minimum TTL okunur
2. MIN_TTL (60s) altindaysa 60s'ye yuvarlanir
3. MAX_TTL (3600s) ustundeyse 3600s'ye yuvarlanir
4. TTL bulunamazsa DEFAULT_TTL (300s) kullanilir

---

## Istatistik Sistemi

### Tamponlama (Buffering) Algoritmasi

```
// Bellekte biriktir (kesin sayim, ornekleme yok)
buffer.total++;
if (blocked) buffer.blocked++;
if (cached) buffer.cached++;

// KV'ye en fazla 5 dakikada bir yaz (read-modify-write)
if (Date.now() - lastFlush >= 5 dk) flushStats(kv);
```

**Neden tamponlama?**
- KV free tier: 1000 yazma/gun
- Sorgu basina yazma: tek bir telefon bile limiti saatler icinde tuketir
- Tamponlama ile: isolate basina en fazla ~288 yazma/gun — sorgu hacminden bagimsiz
- Sayimlar kesindir; flush'tan once olen isolate yalnizca kendi tamponunu kaybeder (hafif eksik sayim olabilir, fazla sayim asla)

### Veri Saklama

- KV key: `stats:2026-02-13`
- Expiration: 8 gun (7 gunluk dashboard grafigi tam kalir)
- `/admin/stats` son 7 gunu gosterir (eksik gunler icin sifir doner)

---

## Guvenlik Modeli

### DNS Trafigi
- Istemci <-> Worker: HTTPS (TLS 1.3)
- Worker <-> Cloudflare DNS: HTTPS
- Uçtan uca sifreleme

### Admin API
- `X-API-Key` header ile basit ama etkili kimlik dogrulama
- Key, `wrangler secret` ile saklanir (koda yazilmaz)
- Key olmadan tum `/admin/*` endpoint'leri 401 doner

### Veri Gizliligi
- Hicbir DNS sorgusu loglanmaz
- Istatistikler yalnizca toplam sayilardir (hangi domain sorgulandigi kaydedilmez)
- Worker tamamen kullanicinin kendi Cloudflare hesabinda calisir

---

## Performans Notlari

### Ortalama Yanit Sureleri

| Senaryo | Yaklasik Sure |
|---------|---------------|
| Engellenen domain | ~2-5ms |
| Cache HIT | ~2-5ms |
| Cache MISS (upstream) | ~50-200ms |
| Landing page | ~2-5ms |
| Admin stats | ~10-50ms (KV okuma) |

### Optimizasyonlar

1. **ctx.waitUntil()**: Cache yazma ve istatistik kaydi response'u beklemez
2. **Set<string>**: O(1) lookup ile gomulu blocklist kontrolu
3. **Cache API**: CDN POP seviyesinde cache, upstream'e gitmeden cevap
4. **Minimal wireformat response**: Engellenen sorgular icin sorgunun kendisi kopyalanir ve bayraklar degistirilir

---

## Hata Ayiklama

### Yaygin Sorunlar

**"Missing dns or name parameter" (400)**
- `/dns-query` endpoint'ine `name` veya `dns` parametresi gonderilmeli

**"Unauthorized" (401)**
- Admin endpoint'leri icin `X-API-Key` header'i eksik veya yanlis
- `npx wrangler secret put ADMIN_KEY` ile key tanimlayin

**"KV not configured" (503)**
- KV namespace olusturulup `wrangler.toml`'a eklenmemis
- `npx wrangler kv namespace create BLOCKLIST` calistirin

**Cache calismiyor (lokal dev)**
- Workers Cache API lokal gelistirme ortaminda sinirlidir
- Production'da otomatik calisir

### Debug Headerlari

| Header | Aciklama |
|--------|----------|
| `X-Cache: HIT` | Cevap cache'den geldi |
| `X-Cache: MISS` | Cevap upstream'den geldi |
| `X-Cache-TTL: 300` | Cache TTL suresi (saniye) |

---

## Bilinen Sinirlamalar

1. **DoT destegi yok**: Cloudflare Workers yalnizca HTTP/HTTPS destekler, TCP/TLS (port 853) desteklemez. Android Private DNS (DoT) dogrudan kullanilamaz.

2. **EDNS Client Subnet yok**: Istemci IP'si upstream'e iletilmez. CDN optimizasyonu etkilenebilir.

3. **KV eventual consistency**: KV yazmalari tum POP'lara aninda yansimaz (~60s gecikme). Admin API ile eklenen domainler aninda engellenmeyebilir.

4. **Sampling hassasiyeti**: Istatistikler yaklasik degerlerdir (x10 carpan). Dusuk trafikli saatlerde sapma olabilir.

5. **Worker CPU limiti (10ms free tier)**: Cok buyuk blocklist'ler CPU limitini zorlayabilir. Gomulu liste + KV hybrid yaklasim bu sorunu azaltir.

6. **Rate limiting yok**: Kotu niyetli kullanim icin rate limiting mevcut degildir. Cloudflare'in kendi DDoS korumasina guvenilir.
