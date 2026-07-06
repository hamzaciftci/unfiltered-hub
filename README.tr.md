# UnfilteredHub

> **[English documentation / Ingilizce dokumantasyon: README.md](README.md)**

Cloudflare Workers uzerinde calisan, kendi kendine barindirabileceginiz bir DNS-over-HTTPS (DoH) proxy'si. DNS sorgularinizi sifreler, reklam ve izleyicileri engeller, DNS cozumlemesi uzerinde tam kontrol saglar.

## Ne Yapar

UnfilteredHub, cihazlariniz ile ust DNS saglayicilari arasinda bir katman olarak calisir. Cihazinizdan gelen her DNS sorgusu HTTPS uzerinden sizin Cloudflare Worker'iniza ulasir. Worker, sorguyu uc ust DNS saglayicisindan birine (Cloudflare, Google, Quad9) ileterek cozumler, reklam/izleyici engellemesi uygular, sonucu onbellege alir ve sifrelenmis olarak geri dondurur.

- RFC 8484 uzerinden DNS sorgularini kabul eder (JSON ve wireformat, GET ve POST)
- Yaklasik 300 gomulu reklam/izleyici/zararli yazilim alan adini engeller, KV ile genisletilebilir
- Cloudflare Cache API kullanarak yanitlari onbellege alir, ust DNS saglayicisinin TTL degerlerini dikkate alir
- Adaptif gecikme puanlamasi ile en hizli ust DNS cozumleyiciyi secer
- DNS kotuye kullanimina karsi koruma saglar (hiz sinirlandirma, DGA algilama, tehlikeli sorgu engelleme)
- Cloudflare'in uctan uca aginda calisir (300'den fazla konum, ucretsiz katman)

## Ne YAPMAZ

- **Anonimlik saglamaz.** Worker'iniz kendi Cloudflare hesabinizda calisir. Cloudflare sorgularinizi gorebilir. Bu sistem, cihaziniz ile Worker arasindaki baglantiyi sifreleyerek ISS/ag duzeyinde DNS izlemeyi engeller.
- **Bireysel sorgulari kaydetmez.** KV yapilandirilmissa gunluk toplu sayaclar (toplam, engellenen, onbellekten sunulan) saklanir. Alan adina veya IP adresine ozel sorgu kaydi tutulmaz.
- **Icerik filtrelemez.** Engelleme listesi reklam, izleme ve zararli yazilim altyapisini hedefler. Web sitesi kategorilerini engellemez.
- **VPN yerine gecmez.** DNS sifreleme, hangi alan adlarini arayip sorguladiginizi gizler. ISS'niz, DNS cozumlemesinden sonra baglandiginiz IP adreslerini hala gorebilir.
- **Kesintisiz calisma garantisi vermez.** Cloudflare Workers'in kullanilabilirligine ve uc ust DNS cozumleyicisine baglidir.

## Ozellikler

| Kategori | Ozellik | Detaylar |
|----------|---------|----------|
| **DNS Proxy** | RFC 8484 DoH | JSON (`?name=&type=`) ve wireformat (`?dns=`, POST) |
| **DNS Proxy** | Coklu ust DNS yedekleme | Cloudflare DNS, Google DNS, Quad9 — adaptif EMA puanlamasi |
| **DNS Proxy** | DNSSEC gecisi | AD bayragi ust DNS saglayicisidan korunur; DO bayragi iletilir ve onbellek izole edilir |
| **Engelleme** | Gomulu cekirdek engelleme listesi | ~300 alan adi (reklamlar, izleyiciler, zararli yazilimlar, kripto madencileri, telemetri) |
| **Engelleme** | KV snapshot engelleme listesi | Tek anahtarlik snapshot, 5 dakikada bir bellege yuklenir — sorgu basina SIFIR KV okuma |
| **Engelleme** | Allowlist (izin listesi) | `@alanadi` girdileri her zaman cozumlenir, ust alan engelli olsa bile |
| **Engelleme** | Alt alan adi eslestirme | `example.com` listede ise `ads.example.com` da engellenir |
| **Onbellek** | JSON **ve wireformat** | Hem `?name=` hem `?dns=`/POST yollari onbelleklenir (gercek DoH istemcileri wireformat kullanir) |
| **Onbellek** | DNS transaction ID yeniden yazimi | Onbellekten donen wire yanitlar her istemcinin kendi sorgu ID'siyle damgalanir |
| **Onbellek** | TTL ust DNS'ten | Pozitif: 60s-3600s; negatif (NXDOMAIN/NODATA): 30s-300s |
| **Onbellek** | DNSSEC duyarli anahtarlar | `do` ve `cd` bayraklari onbellek anahtarinin parcasi, AD bayragi uyumsuzlugu onlenir |
| **Kotuye Kullanim** | IP bazli hiz sinirlandirma | 200 sorgu/dk, **bellek ici** (sifir KV maliyeti), asimda 5 dakika engelleme |
| **Kotuye Kullanim** | DGA algilama | Shannon entropisi + unlu harf sezgiseli (en soldaki etiket uzerinde) |
| **Kotuye Kullanim** | Tehlikeli tur engelleme | ANY, CHAOS, buyuk TXT sorgusu RCODE=5 ile reddedilir |
| **Istatistikler** | Tamponlanmis gunluk sayaclar | Bellekte kesin sayim, isolate basina en fazla 5 dakikada bir KV'ye yazilir |
| **Arayuz** | Acilis sayfasi | Koyu tema, TR/EN, ozellik vitrinleri, canli etki widget'i |
| **Arayuz** | Kurulum sihirbazi | 3 adimli rehber, QR kodu, cihaz algilama, baglanti testi |
| **Arayuz** | Yonetim paneli | Giris, istatistik kartlari, 7 gunluk grafik, KV engelleme listesi CRUD |
| **Arayuz** | Engelleme listesi goruntuleyici | Sayfalanmis, aranabilir, TXT/JSON olarak disari aktarma |
| **Arayuz** | Seffaflik sayfasi | Herkese acik sistem durumu: cozumleyiciler, puanlar, politikalar, engelleme listesi boyutu |
| **Arayuz** | /whoami tanilama | Hashli istemci kimigi, cozumleyici, onbellek, kotuye kullanim bayragi, ulke |
| **Profiller** | Apple .mobileconfig | iOS/iPadOS/macOS icin tek dokunusla DoH kurulumu |
| **Profiller** | Android rehberi + yapilandirma | DNS damgasi, uygulama yapilandirmalari (Intra, Nebulo), manuel talimatlar |
| **Yonetim** | API anahtar dogrulamasi | X-API-Key basliği, sabit zamanli karsilastirma, istege bagli HMAC-SHA256 |
| **Yonetim** | IP beyaz listesi | Istege bagli ADMIN_ALLOWED_IPS kisitlamasi |
| **Yonetim** | Kaba kuvvet koruması | 5 dakikada 10 basarisiz giris denemesi IP engellemesini tetikler |

## Hizli Baslangic

**On Kosullar:** Node.js 18+, ucretsiz bir [Cloudflare hesabi](https://dash.cloudflare.com/sign-up).

```bash
# 1. Klonla ve kur
git clone https://github.com/hamzaciftci/unfiltered-hub.git
cd unfiltered-hub && npm install

# 2. Testleri calistir (istege bagli ama onerilir)
npm test

# 3. Cloudflare ile kimlik dogrulamasi yap
npx wrangler login

# 4. Dagit
npx wrangler deploy
```

Worker URL'niz yazdirilacaktir:

```
Published unfilteredhub-doh
  https://unfilteredhub-doh.YOUR-ACCOUNT.workers.dev
```

Test edin:

```bash
curl 'https://unfilteredhub-doh.YOUR-ACCOUNT.workers.dev/dns-query?name=example.com&type=A'
```

**Istege bagli — genisletilmis engelleme listesi ve istatistikler icin KV'yi etkinlestirin:**

```bash
npx wrangler kv namespace create BLOCKLIST
# Donen ID'yi wrangler.toml dosyasindaki [[kv_namespaces]] altina ekleyin
npx wrangler secret put ADMIN_KEY
# Guclu bir anahtar girin (en az 16 karakter — ornegin: openssl rand -hex 32).
# Zayif/varsayilan anahtarlar (test-secret-123, changeme, password vb.)
# runtime'da REDDEDILIR: gercek bir secret ayarlanana kadar admin API
# kapali kalir. ADMIN_KEY'i asla wrangler.toml'a yazmayin.
npx wrangler deploy
```

**Lokal gelistirme secret'lari:** `.dev.vars.example` dosyasini `.dev.vars`
olarak kopyalayin ve `ADMIN_KEY` degerini doldurun. `.dev.vars` git'e
commitlenmez; `wrangler dev` otomatik okur. Production'da her zaman
`wrangler secret put ADMIN_KEY` kullanilir.

## Cloudflare Ucretsiz Katman Butcesi

Bu proje Workers ucretsiz katmanina sigacak sekilde tasarlanmistir:

| Limit (ucretsiz katman) | Butce | Nasil korunuyor |
|---|---|---|
| Gunde 1.000 KV **yazma** | Sadece stats flush | Abuse/rate-limit: 0 yazma (bellek ici). Stats: tamponlu, isolate basina ≤1 yazma / 5 dk (en kotu ~288/gun). Admin islemleri: mutasyon basina 1 yazma. |
| Gunde 100.000 KV **okuma** | Isolate basina 5 dk'da 1 okuma | Engelleme listesi tek snapshot anahtari olarak bellekte tutulur; DNS sorgulari KV'yi hic okumaz. |
| Gunde 100.000 istek | — | Tipik kisisel DoH kullanimi gunde 5-20 bin sorgudur; Cache API tekrarlari emer. |
| Istek basina 10 ms CPU | — | Sicak yol Set aramasi + baslik ayrisimidir. Snapshot ayristirma (~30 bin alan adi) 5 dakikada bir arka planda olur (stale-while-revalidate). Iceri aktarilan snapshot'i ~30 bin girdinin altinda tutun (import scriptindeki `MAX_DOMAINS`). |

Ucretsiz katman icin bilincli odunler:
- Hiz sinirlandirma **isolate basina** calisir: cok sayida PoP'a yayilan bir saldirgan limitin N katini alabilir. Yine de her isolate bagimsiz engeller; eski KV tabanli tasarim da ~60 sn eventual consistency nedeniyle pratikte daha siki degildi.
- Istatistikler **eninde sonunda** yazilir: 5 dakikalik flush'tan once olen isolate o tamponu kaybeder (eksik sayim olabilir, fazla sayim asla).
- Engelleme listesi degisiklikleri tum isolate'lara **5 dakika icinde** yayilir (snapshot TTL); admin istegini isleyen isolate aninda gunceller.

## Guvenlik Modeli

**Tehdit modeli:** Ag duzeyindeki gozlemcilerin (ISS'ler, halka acik Wi-Fi operatorleri) DNS sorgularini duz metin olarak gormesini engellemek.

**Sifrelenen:**
- Cihazdan Worker'a: HTTPS (Cloudflare ucunda TLS 1.3)
- Worker'dan ust DNS saglayicisina: HTTPS (Cloudflare/Google/Quad9 DoH uç noktalari)

**Sifrelenmeyen:**
- Worker calisma baglamı — Cloudflare, sorgulari izolat icerisinde duz metin olarak isler
- Cozumlenen alan adlarinin IP adresleri — DNS cozumlemesinden sonra aga gorunurdur

**Kimlik dogrulama katmanlari (Admin API):**

| Katman | Mekanizma | Amac |
|--------|-----------|------|
| 1 | Hiz sinirlandirma | IP basina 5 dakikada 10 basarisiz dogrulama, 10 dakikada toplam 100 istek |
| 2 | IP beyaz listesi | Istege bagli `ADMIN_ALLOWED_IPS` ortam degiskeni |
| 3 | API anahtari | `X-API-Key` basligi, sabit zamanli karsilastirma |
| 4 | HMAC imzalari | Istege bagli `X-Timestamp` + `X-Signature`, 5 dakikalik tekrar saldirisi penceresi |

Sorgu parametresi ile kimlik dogrulama (`?key=`) erisim kayitlarinda anahtar sizintisini onlemek icin acikca reddedilir.

**KV arizasi davranisi:** Tum DNS-kritik yollar arizaya acik (fail-open) calisir. KV kullanilamazsa, hiz sinirlandirma ve genisletilmis engelleme listesi devre disi kalir ancak DNS cozumlemesi gomulu cekirdek engelleme listesi kullanilarak devam eder.

## Kotuye Kullanim Korumasi

`/dns-query` uç noktasi herkese aciktir. Uc katman kotuye kullanlma karsi koruma saglar:

**Katman 1 — Tehlikeli sorgu engelleme.** ANY sorgulari (yukseltme vektoru), CHAOS sinifi sorgular (bilgi ifşası) ve buyuk TXT sorgulari (>2048 bayt) DNS RCODE=5 (REFUSED) ile reddedilir.

**Katman 2 — DGA algilama.** Alan adi etiketleri bot tarafindan uretilmis oruntulere karsi kontrol edilir:
- 25 karakterden uzun ve sifir unlu harf iceren etiketler
- 10 karakterden uzun ve Shannon entropisi >3.5 olan etiketler

DGA ile isaretlenen sorgular gecis verilir ancak `suspicious` (supheli) olarak isaretlenir. Ilk olusumda engellenmezler.

**Katman 3 — IP bazli hiz sinirlandirma (bellek ici).** Isolate basina sayaclarla uygulanir:
- 200 sorgu/dk kesin sinir — asimda 5 dakikalik IP engellemesi tetiklenir
- 3 supheli sorgu/dk — asimda 5 dakikalik IP engellemesi tetiklenir

Engellenen IP'ler `Retry-After` basligina sahip HTTP 429 yaniti alir.

**Neden KV degil de bellek ici?** Ucretsiz katman gunde yalnizca 1.000 KV
yazmaya izin verir — sorgu basina sayac bunu saatler icinde tuketir ve
korumayi sessizce devre disi birakir. KV ayrica ~60 saniyelik nihai
tutarlilikla calisir; dakika alti pencereleri zaten guvenilmez kilar.
Bellek ici kovalar isolate icinde kesindir, maliyeti sifirdir ve bir
istemci IP'si pratikte ayni PoP'a yonlendirilir. Bellek sinirlidir
(isolate basina 10 bin IP, LRU tahliye).

Tum kotuye kullanim yanitlari DNS REFUSED (RCODE=5) kullanir, NXDOMAIN degil. Boylece istemciler "sorgu reddedildi" ile "alan adi mevcut degil" arasindaki farki ayirt edebilir.

## Seffaflik Felsefesi

UnfilteredHub ic yapisini gizlemek yerine kullanicilara acar.

- `/transparency` — Tum aktif cozumleyicileri, canli puanlarini, kotuye kullanim koruma esiklerini, onbellek politikasini ve engelleme listesi kaynaklarini gosteren herkese acik sayfa. Kimlik dogrulama gerektirmez.
- `/blocklist` — Cekirdek engelleme listesindeki her alan adinin aranabilir, sayfalanmis gorunumu. TXT veya JSON olarak disa aktarilabilir.
- `/whoami` — Hashli istemci kimligi (SHA-256, ilk 12 hex karakter — asla gercek IP degil), aktif cozumleyici, onbellek durumu, kotuye kullanim bayragi ve ulkeyi gosteren baglanti tanilama sayfasi.
- `/api/impact` — Acilis sayfasi widget'i tarafindan kullanilan canli istatistik JSON'u (toplam sorgu, engellenen, onbellek orani, kotuye kullanim onlenen, ortalama gecikme). KV kapali oldugunda sayi uydurmak yerine `available: false` dondurur.
- Her DNS yanitinda `X-Resolver`, `X-Resolver-Score`, `X-Cache`, `X-Abuse-Flag` basliklari bulunur.

Admin API anahtarlari, IP beyaz listeleri ve KV dahili anahtarlari hicbir herkese acik uc noktadan ifsa edilmez.

## Mimari

```
                         ┌─────────────────────────────────────────────┐
                         │            Cloudflare Worker                │
                         │                                             │
  ┌────────┐   HTTPS     │  ┌─────────┐    ┌──────────┐               │
  │ Cihaz  ├────────────►│  │  Router  ├───►│ Kotuye   │               │
  └────────┘             │  │ index.ts │    │ Kull.    │               │
                         │  └────┬────┘    └────┬─────┘               │
                         │       │              │                      │
                         │  ┌────▼────┐    ┌────▼─────┐               │
                         │  │Engelleme│    │ Onbellek │               │
                         │  │Kontrolu │    │ Arama    │               │
                         │  └────┬────┘    └────┬─────┘               │
                         │       │              │                      │
                         │       │         ┌────▼──────────────┐      │
                         │       │         │ Adaptif Cozumleyici│      │
                         │       │         │ (EMA puanlamasi)  │      │
                         │       │         └────┬──────────────┘      │
                         │       │              │                      │
                         └───────┼──────────────┼──────────────────────┘
                                 │              │
                      NXDOMAIN   │              │  HTTPS
                   (engellendi)  │              │
                                 │    ┌─────────▼─────────┐
                                 │    │  Cloudflare DNS    │
                                 │    │  Google DNS        │
                                 │    │  Quad9             │
                                 │    └───────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Yanit akisi:            │
                    │  1. Eng. listesi→NXDOMAIN│
                    │  2. Onbellek → HIT      │
                    │  3. Ust DNS → cozumle   │
                    │  4. Onbellek yaz (arka) │
                    │  5. Istatistik kaydi(ar)│
                    └─────────────────────────┘
```

**Kaynak kodu yapisi:**

```
src/
├── index.ts           Yonlendirici, DNS isleyici orkestrasyonu
├── resolver.ts        Adaptif EMA puanlamali coklu ust DNS cozumleyici
├── blocker.ts         Alan adi eslestirme, NXDOMAIN yanit olusturucular
├── blocklist.ts       Gomulu ~300 alan adili Set
├── abuse.ts           Bellek ici hiz sinirlandirma, DGA algilama, tur engelleme
├── cache.ts           Cache API okuma/yazma (JSON + wireformat, ID yeniden yazimi)
├── dnsWire.ts         DNS wireformat ayristirma/olusturma yardimcilari
├── stats.ts           Tamponlanmis KV sayaclari (5 dakikada bir flush)
├── utils.ts           Paylasilan: escHtml, getClientIp, detectLang, DNS basliklari
├── admin.ts           Admin API yonlendirmesi (istatistikler, engelleme listesi CRUD)
├── adminAuth.ts       Kimlik dogrulama hatti (API anahtari, HMAC, IP beyaz listesi)
├── rateLimiter.ts     Admin kaba kuvvet korumasi
├── dashboard.ts       Yonetim paneli HTML/JS
├── landing.ts         Etki widget'li acilis sayfasi
├── impactWidget.ts    Canli istatistik widget'i (HTML/CSS/JS)
├── whoami.ts          /whoami uc noktasi (JSON + HTML)
├── transparency.ts    /transparency uc noktasi
├── blocklistViewer.ts /blocklist sayfalanmis goruntuleyici
├── setup.ts           QR kod kodlayicili kurulum sihirbazi
├── apple-profile.ts   iOS/macOS .mobileconfig olusturucu
└── android-profile.ts Android rehberi, DNS damgasi, JSON yapilandirmasi
```

## Sinirlamalar

- **Cloudflare Workers ucretsiz katmani**: Gunde 100.000 istek, istek basina 10ms islemci suresi, gunde 1.000 KV yazma. Kisisel kullanim (bir hane) icin yeterlidir. Herkese acik cozumleyici olceginde calismak icin tasarlanmamistir. Her limitin nasil korundugu icin *Cloudflare Ucretsiz Katman Butcesi* bolumune bakin.
- **KV yok = azalan ozellikler**: KV yapilandirilmadan genisletilmis engelleme listesi snapshot'i ve kalici istatistikler devre disi kalir. Hiz sinirlandirma (bellek ici), gomulu cekirdek engelleme listesi, onbellek ve ust DNS cozumlemesi yine de calisir.
- **Hiz sinirlandirma isolate basinadir**: Bellek ici sayaclar tek isolate icinde kesindir ama kuresel paylasilmaz. Dagitik bir saldirgan dakikalik sinirin katlarini alabilir; her isolate yine de bagimsiz engeller.
- **Android Private DNS sinirlamasi**: Android'in yerel Private DNS ozelligi DNS-over-TLS (DoT) kullanir ve Cloudflare Workers bunu sunamaz. Android kullanicilari uygulama duzeyinde DoH (Chrome, Firefox, Intra) veya kurulum sihirbaziyla rehbere basvurmalidir.
- **Manuel onbellek temizleme uc noktasi yoktur**: Onbellekteki DNS kayitlari TTL uzerinden dogal olarak sona erer (pozitif 60s-3600s, negatif 30s-300s). Yeni engellenen alan adlari aninda engellenir (engelleme kontrolu onbellekten once yapilir); engeli kaldirilan alan adlari TTL bitene kadar onbellekten yanit alabilir.
- **Istatistikler hafifce eksik sayabilir**: Sayaclar bellekte tamponlanir ve 5 dakikada bir yazilir; flush'tan once olen isolate tamponunu kaybeder. Bunun disinda sayimlar kesindir (ornekleme yok).
- **Engelleme listesi yayilim gecikmesi**: Snapshot degisiklikleri tum isolate'lara 5 dakikalik TTL icinde ulasir.

## Uretim Kontrol Listesi

Asagidakilerin detayli incelemesi icin [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) dosyasina bakin:

- Worker istek sinirlari ve islemci suresi tahmini
- Her bilesen icin KV ariza davranisi (arizaya acik / arizaya kapali)
- Soguk baslangic etkisi ve bellek kullanimi
- Hiz siniri esik analizi
- DGA yanlis pozitif riski degerlendirmesi
- Onbellek gecersizlestirme uc durumlari
- DNSSEC AD bayragi tutarliligi

## Lisans

[MIT](LICENSE)
