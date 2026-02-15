# UnfilteredHub — Tam Kullanım Kılavuzu

## Bu Nedir?

UnfilteredHub, **kendi DNS-over-HTTPS (DoH) sunucunuzu** Cloudflare Workers üzerinde çalıştırmanızı sağlayan açık kaynaklı bir projedir. DNS sorgularınızı HTTPS ile şifreleyerek internet servis sağlayıcınızın (ISP) hangi sitelere girdiğinizi görmesini engeller.

Kısaca: İnternette hangi siteye girdiğinizi kimse göremez.

---

## Ne İşe Yarar?

### 1. DNS Sorgularını Şifreler

Normal internet kullanımında DNS sorguları düz metin olarak gönderilir. Bu, ISP'nizin (Türk Telekom, Vodafone, Turkcell vb.) hangi sitelere girdiğinizi görebilmesi ve hatta engelleyebilmesi anlamına gelir.

UnfilteredHub tüm DNS sorgularınızı HTTPS üzerinden şifreler. ISP'niz yalnızca Cloudflare'e giden şifreli trafik görür — hangi siteye girdiğinizi göremez.

**Akış:**
```
Cihazınız → HTTPS şifreli → Cloudflare Worker'ınız → DNS Sunucusu → Yanıt
```

ISP'niz yalnızca "Cloudflare'e bağlanıyor" bilgisini görür. "google.com açmak istiyor" bilgisini göremez.

### 2. Reklamları ve İzleyicileri Engeller

İçerisinde 380'den fazla reklam ve izleyici domain'i gömülü olarak gelir. Bu domain'ler sorgulandığında otomatik olarak engellenir (NXDOMAIN döner).

**Engellenen kategoriler:**
- Google Ads, DoubleClick, AdSense
- Facebook/Meta reklam ve izleme pikselleri
- Google Analytics, Tag Manager
- Amazon reklam sistemi
- Microsoft/Bing reklamları ve telemetri
- Twitter/X, TikTok analitik
- Criteo, Taboola, Outbrain (içerik reklamları)
- Hotjar, FullStory (oturum kayıt)
- Mixpanel, Segment, Amplitude (analitik)
- Popup ve yönlendirme ağları
- Türk reklam ağları
- Mobil reklam SDK'ları (Adjust, AppsFlyer)
- Kripto madencilik scriptleri
- Bilinen zararlı domain'ler
- Smart TV ve IoT telemetri

Ek olarak, Cloudflare KV ile kendi özel engel listenizi oluşturabilirsiniz.

### 3. DNS Yanıtlarını Önbelleğe Alır

Aynı domain'e yapılan tekrarlayan DNS sorguları önbellekten (cache) anında yanıtlanır. Bu sayede:
- DNS çözümleme süresi azalır (daha hızlı internet)
- Upstream DNS sunucularına istek azalır
- Cloudflare Workers kotası daha verimli kullanılır

**Önbellek ayarları:**
- Minimum TTL: 60 saniye
- Maksimum TTL: 1 saat
- Varsayılan TTL: 5 dakika
- Upstream DNS yanıtındaki TTL değerine göre otomatik ayarlanır

### 4. Birden Fazla DNS Sunucusu ile Çalışır

3 farklı DNS sunucusu arasında otomatik failover yapar:

| Öncelik | Sunucu | Adres |
|---------|--------|-------|
| 1 | Cloudflare DNS | 1.1.1.1 |
| 2 | Google DNS | 8.8.8.8 |
| 3 | Quad9 DNS | 9.9.9.9 |

Cloudflare yanıt vermezse otomatik olarak Google'a, o da vermezse Quad9'a geçer. Her deneme 3 saniye timeout ile sınırlıdır. Hangi sunucunun yanıtladığı `X-Resolver` başlığında görülebilir.

Sıralama `UPSTREAM` ortam değişkeni ile değiştirilebilir:
```
UPSTREAM = "google,cloudflare,quad9"
```

### 5. Admin Dashboard Sunar

Web tabanlı admin paneli ile sunucunuzu izleyebilir ve yönetebilirsiniz:

- **İstatistik kartları:** Bugünkü toplam sorgu, engellenen, önbellekten yanıtlanan
- **7 günlük grafik:** Günlük sorgu trendleri (bar chart)
- **Resolver durumu:** Hangi DNS sunucularının aktif olduğu
- **Engel listesi yönetimi:** Domain ekleme/silme, listeleme
- **Otomatik yenileme:** 30 saniyede bir güncellenir

Erişim: `https://worker-adresiniz/admin/dashboard?key=API_KEY`

### 6. Tüm Cihazları Destekler

| Platform | Yöntem | Endpoint |
|----------|--------|----------|
| iPhone / iPad / Mac | .mobileconfig profili | `/apple-profile?domain=...` |
| Android | Kurulum rehberi + JSON config + DNS Stamp | `/android?domain=...` |
| Windows 11 | Yerleşik DoH ayarları | Manuel yapılandırma |
| Chrome / Edge | Tarayıcı güvenli DNS | Manuel yapılandırma |
| Firefox | DoH ayarları | Manuel yapılandırma |

---

## Ne Yapmaz?

### 1. VPN Değildir

UnfilteredHub bir VPN değildir. Yalnızca DNS sorgularını şifreler. Web trafiğinizin kendisini (hangi sayfayı açtığınız, ne indirdiğiniz) şifrelemez. Zaten çoğu web sitesi HTTPS kullanır, ancak ISP'niz hangi IP adreslerine bağlandığınızı görebilir.

**DNS şifreleme gizler:** Hangi domain'i sorguladığınızı
**DNS şifreleme gizlemez:** Hangi IP'ye bağlandığınızı, ne kadar trafik oluşturduğunuzu, bağlantı zamanlarını

Tam gizlilik için VPN + DoH kombinasyonu önerilir.

### 2. IP Adresinizi Gizlemez

Ziyaret ettiğiniz web siteleri gerçek IP adresinizi görür. UnfilteredHub yalnızca DNS katmanında çalışır, IP maskeleme yapmaz.

### 3. Tüm Reklamları Engellemez

DNS tabanlı reklam engelleme, yalnızca ayrı domain'lerden yüklenen reklamları engeller. Aynı domain üzerinden sunulan reklamları (örneğin YouTube'un kendi reklam sistemi) engelleyemez.

**Engelleyebildiği:** `ads.doubleclick.net`, `tracking.facebook.com` gibi ayrı domain'ler
**Engelleyemediği:** `youtube.com/ads`, `instagram.com` içi reklamlar

Daha kapsamlı reklam engelleme için tarayıcı eklentisi (uBlock Origin gibi) ile birlikte kullanılması önerilir.

### 4. DNS-over-TLS (DoT) Desteklemez

Cloudflare Workers HTTPS üzerinden çalıştığı için yalnızca DNS-over-HTTPS (DoH) destekler. DNS-over-TLS (DoT, port 853) desteklenmez.

Bu, Android'in yerleşik "Özel DNS" özelliğinin (DoT kullanan) doğrudan kullanılamaması anlamına gelir. Android'de DoH için Intra veya Nebulo gibi uygulamalar gerekir.

### 5. Sınırsız İstek Sunmaz

Cloudflare Workers ücretsiz plan limitleri:
- **Günlük:** 100.000 istek
- **Aylık:** ~1.000.000 istek (aşılırsa Workers çalışmayı durdurur)

Ortalama bir kullanıcı günde yaklaşık 5.000-10.000 DNS sorgusu yapar. Bu, ücretsiz planın 10-20 cihaz için yeterli olması anlamına gelir.

Daha fazla cihaz veya yoğun kullanım için Cloudflare Workers Paid plan ($5/ay, 10M istek) geçilebilir.

### 6. Uçtan Uca Anonimlik Sağlamaz

DNS sorgularınız Cloudflare'in altyapısından geçer. Cloudflare teknik olarak sorguları görebilir (ancak politikaları gereği kaydetmez). Ayrıca upstream DNS sunucuları (Google DNS, Quad9) da sorguları görür.

Tam anonimlik için Tor ağı gibi çözümler gerekir.

### 7. Mevcut DNS Engellerini Kaldırmaz

Eğer ISP'niz belirli IP adreslerini engelliyorsa (IP bazlı engelleme), DNS şifreleme bu engeli kaldırmaz. DNS şifreleme yalnızca DNS bazlı engelleri aşar.

**Aşabildiği:** DNS manipülasyonu ile yapılan engellemeler (domain bazlı)
**Aşamadığı:** IP bazlı engellemeler, DPI (Deep Packet Inspection) ile yapılan engellemeler

### 8. Lokal DNS Cache Yönetimi Yapmaz

Önbellek Cloudflare'in edge sunucularında tutulur. Cihazınızdaki yerel DNS önbelleğini yönetmez veya değiştirmez.

### 9. DNSSEC Doğrulaması Yapmaz

UnfilteredHub upstream DNS sunucusunun DNSSEC doğrulamasına güvenir. Kendi başına ek DNSSEC doğrulaması yapmaz. Cloudflare DNS (1.1.1.1) ve Quad9 zaten DNSSEC doğrulaması yapar.

---

## Nasıl Kullanılır?

### Adım 1: Gereksinimler

- **Node.js 18+** yüklü olmalı
- **Cloudflare hesabı** (ücretsiz) açılmalı
- Terminal / komut satırı kullanılmalı

### Adım 2: Projeyi İndir ve Kur

```bash
git clone <repo-url>
cd unfilteredhub-doh
npm install
```

### Adım 3: Cloudflare'e Giriş Yap

```bash
npx wrangler login
```

Tarayıcınız açılır, Cloudflare hesabınızla giriş yapın.

### Adım 4: Admin API Key Ayarla

Production için (güvenli):
```bash
npx wrangler secret put ADMIN_KEY
# Güçlü bir key girin (örnek: openssl rand -hex 32)
```

Lokal geliştirme için `wrangler.toml` içindeki `[vars]` bölümü kullanılabilir.

### Adım 5: Deploy Et

```bash
npm run deploy
```

Bu komut sunucunuzu Cloudflare Workers'a yükler. Çıktıda Worker URL'iniz görünür:
```
https://unfilteredhub-doh.HESABINIZ.workers.dev
```

### Adım 6: Test Et

```bash
# Sağlık kontrolü
curl https://unfilteredhub-doh.HESABINIZ.workers.dev/health

# DNS sorgusu
curl "https://unfilteredhub-doh.HESABINIZ.workers.dev/dns-query?name=example.com&type=A"

# Engellenen domain testi
curl "https://unfilteredhub-doh.HESABINIZ.workers.dev/dns-query?name=ads.doubleclick.net&type=A"
# Sonuç: Status 3 (NXDOMAIN) — engellendi
```

### Adım 7: Cihazlarınızı Yapılandırın

#### iPhone / iPad / Mac
1. Tarayıcıda Worker URL'inize gidin
2. "Cihaz Ayarları" → "iPhone / iPad / Mac" sekmesine tıklayın
3. Worker domain'inizi girin, "Profil Oluştur ve İndir" butonuna basın
4. İndirilen `.mobileconfig` dosyasını açın
5. Ayarlar → Genel → VPN ve Cihaz Yönetimi → Profili yükleyin

#### Android
1. Tarayıcıda `https://worker-adresiniz/android?domain=worker-adresiniz` adresine gidin
2. Rehberdeki adımları takip edin
3. Önerilen yöntem: **Intra** uygulamasını indirin, DoH URL'inizi girin
4. Alternatif: **Nebulo** uygulaması

#### Windows 11
1. Ayarlar → Ağ ve İnternet → Wi-Fi (veya Ethernet)
2. "DNS sunucusu ataması" → Düzenle
3. Manuel → DNS-over-HTTPS → URL alanına:
   ```
   https://unfilteredhub-doh.HESABINIZ.workers.dev/dns-query
   ```

#### Chrome / Edge
1. Ayarlar → Gizlilik ve Güvenlik → Güvenlik
2. "Güvenli DNS kullan" → Açık
3. "Özel" seçeneğini seçin
4. URL girin:
   ```
   https://unfilteredhub-doh.HESABINIZ.workers.dev/dns-query
   ```

#### Firefox
1. Ayarlar → Gizlilik ve Güvenlik
2. "DNS over HTTPS" bölümü → "Özel"
3. URL girin:
   ```
   https://unfilteredhub-doh.HESABINIZ.workers.dev/dns-query
   ```

---

## Endpoint Tablosu

Sunucunuzdaki tüm endpoint'ler:

| Endpoint | Yöntem | Auth | Açıklama |
|----------|--------|------|----------|
| `/` | GET | Yok | Ana sayfa (landing page), TR/EN destekli |
| `/health` | GET | Yok | Sunucu durumu, aktif resolver listesi |
| `/dns-query?name=X&type=A` | GET | Yok | DNS sorgusu (JSON format) |
| `/dns-query?dns=BASE64` | GET | Yok | DNS sorgusu (wireformat, RFC 8484) |
| `/dns-query` | POST | Yok | DNS sorgusu (binary wireformat) |
| `/apple-profile?domain=X` | GET | Yok | iOS/macOS .mobileconfig profili indir |
| `/android?domain=X` | GET | Yok | Android kurulum rehberi sayfası |
| `/android-config?domain=X` | GET | Yok | Android JSON config + DNS Stamp indir |
| `/admin/dashboard?key=X` | GET | API Key | Admin panel (web UI) |
| `/admin/stats` | GET | API Key | İstatistikler (JSON) |
| `/admin/blocklist` | GET | API Key | Engel listesi görüntüle (sayfalı) |
| `/admin/blocklist` | POST | API Key | Domain ekle `{"domains":["x.com"]}` |
| `/admin/blocklist` | DELETE | API Key | Domain sil `{"domains":["x.com"]}` |

**Auth Yöntemi:** `X-API-Key` header veya `?key=` query parametresi

---

## İsteğe Bağlı: KV Blocklist (Özel Engel Listesi)

Gömülü 380+ domain'e ek olarak kendi engel listenizi oluşturabilirsiniz.

### KV Namespace Oluşturma

```bash
npx wrangler kv namespace create BLOCKLIST
```

Dönen ID'yi `wrangler.toml`'a ekleyin:
```toml
[[kv_namespaces]]
binding = "BLOCKLIST"
id = "DONEN_ID"
```

Tekrar deploy edin:
```bash
npm run deploy
```

### Domain Ekleme (API ile)

```bash
curl -X POST "https://worker-adresiniz/admin/blocklist" \
  -H "X-API-Key: ADMIN_KEY_INIZ" \
  -H "Content-Type: application/json" \
  -d '{"domains": ["reklam-sitesi.com", "izleyici.net"]}'
```

### Domain Silme

```bash
curl -X DELETE "https://worker-adresiniz/admin/blocklist" \
  -H "X-API-Key: ADMIN_KEY_INIZ" \
  -H "Content-Type: application/json" \
  -d '{"domains": ["reklam-sitesi.com"]}'
```

### Dashboard'dan Yönetim

`/admin/dashboard?key=ADMIN_KEY_INIZ` adresinden web arayüzü ile domain ekleyebilir/silebilirsiniz.

---

## Dosya Yapısı

```
unfilteredhub-doh/
├── src/
│   ├── index.ts            # Ana router — tüm endpoint yönlendirmesi
│   ├── resolver.ts         # Multi-upstream DNS çözümleme + failover
│   ├── blocker.ts          # DNS engelleme motoru
│   ├── blocklist.ts        # Gömülü engel listesi (380+ domain)
│   ├── cache.ts            # DNS yanıt önbelleği (Cache API)
│   ├── stats.ts            # Sorgu istatistikleri (KV sayaçları)
│   ├── admin.ts            # Admin API endpoint'leri
│   ├── dashboard.ts        # Admin web paneli (HTML/CSS/JS)
│   ├── landing.ts          # Herkese açık landing page
│   ├── apple-profile.ts    # iOS/macOS .mobileconfig üretici
│   └── android-profile.ts  # Android rehber + config + DNS Stamp
├── wrangler.toml           # Cloudflare Workers yapılandırması
├── package.json            # Proje bağımlılıkları
├── tsconfig.json           # TypeScript ayarları
└── .dev.vars               # Lokal geliştirme secret'ları (git'e eklenmez)
```

---

## Teknik Detaylar

### Desteklenen DNS Protokolleri

| Protokol | Format | Content-Type |
|----------|--------|-------------|
| JSON (RFC 8427) | `?name=example.com&type=A` | `application/dns-json` |
| Wireformat GET (RFC 8484) | `?dns=BASE64URL` | `application/dns-message` |
| Wireformat POST (RFC 8484) | Binary body | `application/dns-message` |

### Yanıt Başlıkları

Her DNS yanıtında şu özel başlıklar bulunur:

| Başlık | Açıklama | Örnek |
|--------|----------|-------|
| `X-Resolver` | Yanıtı veren upstream sunucu | `Cloudflare`, `Google`, `Quad9` |
| `X-Cache` | Önbellek durumu | `HIT` veya `MISS` |
| `Access-Control-Allow-Origin` | CORS izni | `*` |

### İstatistik Sampling

KV yazma limiti nedeniyle istatistikler örnekleme ile kaydedilir:
- Her 10 istekten 1'i KV'ye yazılır
- Sayaçlar 10x çarpanı ile hesaplanır
- KV kayıtları 48 saat sonra otomatik silinir (expirationTtl)
- `ctx.waitUntil()` ile non-blocking — yanıt gecikmesi olmaz

### DNS Stamp Formatı

Android uygulamalar için üretilen DNS Stamp:
```
sdns://AgcAAAAAAAAAAAAQdGVzdC53b3JrZXJzLmRldgovZG5zLXF1ZXJ5
```

Format: `sdns://` + Base64url kodlanmış binary:
- Byte 0: Protokol (0x02 = DoH)
- Byte 1-8: Özellikler (DNSSEC + NoLog + NoFilter)
- LP hostname: Worker domain'i
- LP path: `/dns-query`

---

## Güvenlik

### Kimlik Doğrulama

| Endpoint Grubu | Kimlik Doğrulama |
|----------------|-----------------|
| Genel (/, /health, /dns-query, profiller) | Yok — herkese açık |
| Admin (/admin/*) | API Key zorunlu |

Admin API key'i `X-API-Key` header veya `?key=` query parametresi ile gönderilir.

### Öneriler

1. **Güçlü ADMIN_KEY kullanın** — En az 32 karakter, rastgele:
   ```bash
   openssl rand -hex 32
   ```

2. **wrangler.toml'a production secret yazmayın** — `wrangler secret put ADMIN_KEY` kullanın

3. **`.dev.vars` dosyasını commit etmeyin** — `.gitignore`'da olmalı

4. **Cloudflare proxy'sini aktif tutun** — Özel domain kullanıyorsanız

---

## Sık Sorulan Sorular

**S: Ücretsiz mi?**
C: Evet. Cloudflare Workers ücretsiz planı ile aylık ~1M istek. Çoğu bireysel kullanıcı için yeterli.

**S: Hızımı etkiler mi?**
C: Genellikle hızlandırır. Cloudflare'in küresel ağı sayesinde DNS çözümleme süresi azalır. Önbellek sayesinde tekrarlayan sorgular anında yanıtlanır.

**S: ISP'im bunu engelleyebilir mi?**
C: Teorik olarak, ISP Cloudflare Workers IP'lerini engelleyebilir. Ancak bu, milyonlarca web sitesini de engellemek anlamına gelir, bu yüzden pratikte olası değildir.

**S: Birden fazla cihazda kullanabilir miyim?**
C: Evet. Aynı Worker URL'ini tüm cihazlarınıza tanımlayabilirsiniz. Ücretsiz plan 10-20 cihaz için yeterlidir.

**S: Yasal mı?**
C: DNS şifreleme tamamen yasaldır. Kendi DNS sunucunuzu kullanmak herhangi bir yasayı ihlal etmez. Şifreleme bir gizlilik hakkıdır.

**S: Cloudflare hesabım olmadan kullanabilir miyim?**
C: Hayır. Sunucu Cloudflare Workers üzerinde çalıştığı için Cloudflare hesabı zorunludur. Hesap açmak ücretsizdir.

**S: Başka birinin kurduğu sunucuyu kullanabilir miyim?**
C: Teknik olarak evet, ancak bu durumda DNS sorgularınızı o kişi görebilir. Gizlilik için kendi sunucunuzu kurmanız önerilir.

**S: Engel listesini nasıl güncellerim?**
C: Gömülü liste projeyle birlikte güncellenir (yeni deploy gerekir). KV engel listesini Admin API veya Dashboard ile dinamik olarak güncelleyebilirsiniz.

**S: DoH URL'm nedir?**
C: Deploy ettikten sonra URL formatı: `https://unfilteredhub-doh.HESABINIZ.workers.dev/dns-query`
