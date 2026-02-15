# UnfilteredHub'e Katkıda Bulunma Rehberi

UnfilteredHub'e katkıda bulunmak istediğiniz için teşekkür ederiz! Bu rehber, projeye nasıl katkıda bulunabileceğinizi adım adım açıklar.

## İçindekiler

- [Davranış Kuralları](#davranış-kuralları)
- [Nasıl Katkıda Bulunabilirim?](#nasıl-katkıda-bulunabilirim)
  - [Hata Bildirme](#hata-bildirme)
  - [Özellik Önerme](#özellik-önerme)
  - [Kod Katkısı](#kod-katkısı)
  - [Dokümantasyon](#dokümantasyon)
  - [Blocklist Katkısı](#blocklist-katkısı)
- [Geliştirme Ortamı](#geliştirme-ortamı)
- [Kod Standartları](#kod-standartları)
- [Commit Mesajları](#commit-mesajları)
- [Pull Request Süreci](#pull-request-süreci)
- [Proje Mimarisi](#proje-mimarisi)
- [Test Yazma](#test-yazma)
- [Sık Sorulan Sorular](#sık-sorulan-sorular)

---

## Davranış Kuralları

Bu proje, açık ve kapsayıcı bir topluluk oluşturmayı amaçlar. Tüm katılımcılardan beklentimiz:

- **Saygılı olun** — Farklı görüşlere ve deneyimlere saygı gösterin
- **Yapıcı olun** — Eleştirilerinizi yapıcı ve çözüm odaklı tutun
- **Kapsayıcı olun** — Herkesin katılabileceği bir ortam yaratın
- **Sabırlı olun** — Yeni başlayanlar dahil herkese sabırla yaklaşın

Kabul edilemez davranışlar:
- Hakaret, aşağılama veya taciz
- Kişisel saldırılar
- Trolleme veya kasıtlı provokasyon
- Özel bilgilerin izinsiz paylaşılması

Davranış kurallarını ihlal eden kişiler proje sahipleri tarafından uyarılabilir veya projeden çıkarılabilir.

---

## Nasıl Katkıda Bulunabilirim?

### Hata Bildirme

Bir hata bulduğunuzda:

1. **Mevcut issue'ları kontrol edin** — Aynı hata daha önce bildirilmiş olabilir
2. **Yeni issue açın** — Aşağıdaki şablonu kullanın:

```markdown
### Hata Açıklaması
[Hatanın kısa ve net açıklaması]

### Tekrarlama Adımları
1. [İlk adım]
2. [İkinci adım]
3. [Hatanın oluştuğu adım]

### Beklenen Davranış
[Ne olması gerektiği]

### Gerçekleşen Davranış
[Ne olduğu]

### Ortam
- İşletim Sistemi: [örn. Windows 11, macOS 14]
- Tarayıcı: [örn. Chrome 120]
- Node.js Sürümü: [örn. 20.10.0]
- Wrangler Sürümü: [örn. 3.96.0]

### Ek Bilgi
[Ekran görüntüleri, log çıktıları, vb.]
```

#### İyi Bir Hata Raporu İçin İpuçları
- Tekrarlanabilir adımlar yazın
- DNS sorgusu ile ilgiliyse, tam `curl` komutunu paylaşın
- Mümkünse `wrangler dev` log çıktısını ekleyin
- Wireformat sorguları için hex dump paylaşın

### Özellik Önerme

Yeni bir özellik önerirken:

1. **Mevcut issue'ları kontrol edin** — Benzer bir öneri olabilir
2. **Aşağıdaki bilgileri içeren bir issue açın:**

```markdown
### Özellik Açıklaması
[Önerilen özelliğin açıklaması]

### Motivasyon
[Neden bu özelliğe ihtiyaç var?]

### Önerilen Çözüm
[Nasıl uygulanabilir?]

### Alternatifler
[Düşündüğünüz alternatif yaklaşımlar]

### Ek Bağlam
[Referans projeler, RFC'ler, vb.]
```

#### Özellik Önerisi İpuçları
- Cloudflare Workers sınırlamalarını göz önünde bulundurun (CPU, bellek, KV limitleri)
- DNS standartlarına (RFC 8484, RFC 1035) uygunluğu düşünün
- Ücretsiz plan limitlerini aşmayacak çözümler tercih edin
- Gizlilik-öncelikli yaklaşımlar benimseyin

### Kod Katkısı

1. Projeyi fork edin
2. Özellik dalı (feature branch) oluşturun
3. Değişikliklerinizi yapın
4. Test yazın (mümkünse)
5. Pull request açın

Detaylar aşağıdaki bölümlerde.

### Dokümantasyon

Dokümantasyon katkıları her zaman değerlidir:
- Yazım hataları düzeltmeleri
- Açıklama iyileştirmeleri
- Yeni rehberler veya örnekler
- Çeviri katkıları (TR ↔ EN)
- API dokümantasyonu güncellemeleri

### Blocklist Katkısı

Engelleme listesine katkıda bulunabilirsiniz:

#### Core Blocklist'e Ekleme (src/blocklist.ts)
- Yaygın reklam/tracker domainleri
- Doğrulanmış zararlı domainler
- Kripto madencilik domainleri
- İlgili kategoriye uygun şekilde ekleyin

#### Core Blocklist'e EKLENMEMESİ Gerekenler
- Meşru servislerin alt domainleri (örn. `cdn.google.com`)
- Çalışan web sitelerini bozabilecek domainler
- Doğrulanmamış veya geçici domainler
- Kişisel tercihlere dayalı engellemeler

---

## Geliştirme Ortamı

### Gereksinimler

| Araç | Minimum Sürüm | Açıklama |
|------|----------------|----------|
| Node.js | 18.0+ | JavaScript runtime |
| npm | 9.0+ | Paket yöneticisi |
| Wrangler | 3.0+ | Cloudflare Workers CLI |
| Git | 2.30+ | Versiyon kontrolü |
| TypeScript | 5.0+ | (devDependency olarak gelir) |

### Kurulum

```bash
# 1. Projeyi fork edin ve klonlayın
git clone https://github.com/KULLANICIADI/unfilteredhub-doh.git
cd unfilteredhub-doh

# 2. Bağımlılıkları yükleyin
npm install

# 3. Lokal geliştirme sunucusunu başlatın
npm run dev
```

### Geliştirme Sunucusu

```bash
npm run dev
# → Wrangler dev server: http://localhost:8787
```

Lokal sunucuda test:

```bash
# Landing page
curl http://localhost:8787/

# Health check
curl http://localhost:8787/health

# DNS sorgusu (JSON)
curl "http://localhost:8787/dns-query?name=example.com&type=A" \
  -H "Accept: application/dns-json"

# DNS sorgusu (wireformat)
curl -s "https://cloudflare-dns.com/dns-query?name=example.com&type=A" \
  -H "Accept: application/dns-message" | \
  curl -X POST http://localhost:8787/dns-query \
    -H "Content-Type: application/dns-message" \
    --data-binary @-

# Engellenen domain testi
curl "http://localhost:8787/dns-query?name=doubleclick.net&type=A" \
  -H "Accept: application/dns-json"
# → Status: 3 (NXDOMAIN)
```

### Ortam Değişkenleri

Geliştirme için `.dev.vars` dosyası oluşturabilirsiniz:

```ini
ADMIN_KEY=test-key-123
```

> **Not:** `.dev.vars` dosyası `.gitignore`'a eklenmeli ve commit edilmemelidir.

---

## Kod Standartları

### TypeScript

- **Strict mode** — `tsconfig.json`'da `strict: true` aktif
- **ES2022** hedefi — Modern JavaScript özellikleri kullanılabilir
- **Explicit return types** — Public fonksiyonlarda return type belirtin
- **No `any`** — `any` yerine uygun tipler kullanın
- **const tercih edin** — Mümkün olduğunca `const` kullanın

### Kodlama Stili

```typescript
// ✅ İyi
export async function getCachedResponse(
  domain: string,
  type: string,
): Promise<Response | null> {
  const cacheKey = buildCacheKey(domain, type);
  const cache = caches.default;
  return cache.match(cacheKey);
}

// ❌ Kötü
export async function getCachedResponse(domain: any, type: any) {
  var cacheKey = buildCacheKey(domain, type)
  var cache = caches.default
  return cache.match(cacheKey)
}
```

### Dosya Organizasyonu

```
src/
├── index.ts          # Ana router — tüm HTTP isteklerini yönlendirir
├── landing.ts        # Landing page HTML oluşturucusu
├── apple-profile.ts  # .mobileconfig profil oluşturucusu
├── blocker.ts        # DNS engelleme motoru
├── blocklist.ts      # Gömülü core engelleme listesi
├── cache.ts          # DNS cache katmanı (Workers Cache API)
├── stats.ts          # İstatistik sayaçları (KV)
└── admin.ts          # Admin API endpoint'leri
```

### İsimlendirme Kuralları

| Tür | Kural | Örnek |
|-----|-------|-------|
| Dosyalar | kebab-case | `apple-profile.ts` |
| Fonksiyonlar | camelCase | `getCachedResponse()` |
| Sabitler | UPPER_SNAKE_CASE | `CORE_BLOCKLIST` |
| Tipler/Interface'ler | PascalCase | `DailyStats` |
| Değişkenler | camelCase | `kvCount` |

### Import Sırası

```typescript
// 1. External modüller (varsa)
// 2. Internal modüller (proje dosyaları)
// 3. Type imports

import { CORE_BLOCKLIST } from './blocklist';
import { getCachedResponse } from './cache';
import type { Env } from './admin';
```

---

## Commit Mesajları

[Conventional Commits](https://www.conventionalcommits.org/) standardını kullanıyoruz:

### Format

```
<tip>(<kapsam>): <açıklama>

[opsiyonel gövde]

[opsiyonel alt bilgi]
```

### Tipler

| Tip | Açıklama | Örnek |
|-----|----------|-------|
| `feat` | Yeni özellik | `feat(cache): add DNS response caching` |
| `fix` | Hata düzeltmesi | `fix(blocker): handle trailing dot in domains` |
| `docs` | Dokümantasyon | `docs: update API reference` |
| `refactor` | Kod yeniden yapılandırma | `refactor(stats): simplify sampling logic` |
| `perf` | Performans iyileştirmesi | `perf(blocklist): use Set for O(1) lookup` |
| `test` | Test ekleme/düzeltme | `test(blocker): add wireformat parsing tests` |
| `chore` | Bakım işleri | `chore: update wrangler to v3.100` |
| `style` | Kod formatı | `style: fix indentation in landing.ts` |

### Kapsamlar

| Kapsam | Dosya(lar) |
|--------|-----------|
| `router` | `src/index.ts` |
| `landing` | `src/landing.ts` |
| `profile` | `src/apple-profile.ts` |
| `blocker` | `src/blocker.ts` |
| `blocklist` | `src/blocklist.ts` |
| `cache` | `src/cache.ts` |
| `stats` | `src/stats.ts` |
| `admin` | `src/admin.ts` |
| `import` | `scripts/import-blocklist.ts` |

### Örnekler

```bash
# Yeni özellik
git commit -m "feat(blocker): add wildcard pattern matching for domains"

# Hata düzeltmesi
git commit -m "fix(cache): respect minimum TTL of 60 seconds"

# Dokümantasyon
git commit -m "docs: add CONTRIBUTING.md with development guide"

# Birden fazla satır
git commit -m "feat(admin): add bulk domain import endpoint

Add POST /admin/blocklist/bulk endpoint that accepts
up to 1000 domains per request via JSON body.

Closes #42"
```

---

## Pull Request Süreci

### 1. Fork & Branch

```bash
# Fork'u klonlayın
git clone https://github.com/KULLANICIADI/unfilteredhub-doh.git
cd unfilteredhub-doh

# Upstream remote ekleyin
git remote add upstream https://github.com/ANA-REPO/unfilteredhub-doh.git

# Güncel main'den branch oluşturun
git fetch upstream
git checkout -b feature/ozellik-adi upstream/main
```

### 2. Geliştirme

- Küçük, odaklı commit'ler yapın
- Her commit derlenmeli ve çalışmalı
- Commit mesaj standartlarına uyun

### 3. Test

```bash
# TypeScript derleme kontrolü
npx tsc --noEmit

# Lokal geliştirme sunucusu ile test
npm run dev

# Manuel test (ayrı terminalde)
curl "http://localhost:8787/dns-query?name=example.com&type=A" \
  -H "Accept: application/dns-json"

# Engelleme testi
curl "http://localhost:8787/dns-query?name=doubleclick.net&type=A" \
  -H "Accept: application/dns-json"

# Health check
curl http://localhost:8787/health
```

### 4. Pull Request Açma

```bash
# Değişiklikleri push edin
git push origin feature/ozellik-adi
```

GitHub'da PR açarken aşağıdaki şablonu kullanın:

```markdown
## Özet
[Değişikliklerin kısa açıklaması]

## Motivasyon
[Neden bu değişiklik gerekli?]

## Değişiklikler
- [Değişiklik 1]
- [Değişiklik 2]

## Test
- [ ] `npx tsc --noEmit` başarılı
- [ ] `npm run dev` ile lokal test yapıldı
- [ ] DNS sorguları doğru çalışıyor
- [ ] Engelleme sistemi etkilenmiyor
- [ ] Landing page düzgün render ediliyor

## Ekran Görüntüleri (varsa)
[Görsel değişiklikler için]

## İlgili Issue
Closes #XX
```

### 5. Review Süreci

- PR açıldığında proje sahipleri bilgilendirilir
- Reviewer yorumlarına yanıt verin
- Gerekli değişiklikleri yapın
- CI kontrolleri geçmelidir
- En az 1 onay gerekir

### PR Kabul Kriterleri

- [ ] TypeScript derleme hatası yok
- [ ] Mevcut işlevselliği bozmaz
- [ ] Kod standartlarına uygun
- [ ] Commit mesajları kurallara uygun
- [ ] Gerekli dokümantasyon güncellenmiş
- [ ] Cloudflare Workers limitlerine uygun
- [ ] Gizlilik-öncelikli tasarım

---

## Proje Mimarisi

### İstek Akışı

```
HTTP İsteği
    │
    ├─ GET /                → Landing Page (landing.ts)
    ├─ GET /health          → Health Check (index.ts)
    ├─ GET /apple-profile   → .mobileconfig (apple-profile.ts)
    ├─ /admin/*             → Admin API (admin.ts) [Auth gerekli]
    │   ├─ GET  /admin/stats
    │   ├─ GET  /admin/blocklist
    │   ├─ POST /admin/blocklist
    │   └─ DELETE /admin/blocklist
    │
    └─ /dns-query           → DNS İşleme (index.ts)
        │
        ├─ Domain Parse (JSON veya wireformat)
        ├─ Blocklist Kontrolü (blocker.ts + blocklist.ts)
        │   ├─ Core Set (gömülü ~300 domain)
        │   └─ KV Lookup (opsiyonel, subdomain dahil)
        │
        ├─ [Engellendi] → NXDOMAIN Response
        │
        ├─ Cache Kontrolü (cache.ts)
        │   └─ [Cache HIT] → Cached Response
        │
        ├─ Upstream Fetch (cloudflare-dns.com)
        │
        └─ Background (ctx.waitUntil)
            ├─ Cache Yazma (cache.ts)
            └─ Stats Kayıt (stats.ts)
```

### Modül Bağımlılıkları

```
index.ts
├── landing.ts          (bağımsız)
├── apple-profile.ts    (bağımsız)
├── blocker.ts
│   └── blocklist.ts    (CORE_BLOCKLIST Set)
├── cache.ts            (bağımsız)
├── stats.ts            (bağımsız)
└── admin.ts
    ├── blocklist.ts    (CORE_BLOCKLIST_SIZE)
    └── stats.ts        (getStats, getWeeklyStats)
```

### Önemli Tasarım Kararları

1. **Neden Cache API, KV değil?**
   - Cache API ücretsiz ve hızlı (edge cache)
   - KV okuma limiti var (100k/gün free)
   - DNS yanıtları otomatik TTL ile expire olur
   - KV'de TTL yönetimi manuel yapılmak zorunda

2. **Neden Sampling İstatistikler?**
   - KV yazma limiti: 1000/gün (ücretsiz plan)
   - Her 10. istekte 1 yazma → ×10 çarpan ile yaklaşık değer
   - `ctx.waitUntil()` ile response gecikmesi olmaz

3. **Neden Gömülü Blocklist?**
   - KV bağımlılığı olmadan çalışır
   - Sıfır gecikme (bellek içi Set lookup)
   - En yaygın 300 domain her zaman engellenir
   - KV ile genişletilebilir (hybrid yaklaşım)

4. **Neden Wireformat Desteği?**
   - iOS/macOS native DoH istemcileri wireformat kullanır
   - RFC 8484 tam uyumluluk
   - JSON yalnızca tarayıcı ve test amaçlı

---

## Test Yazma

Proje şu anda Cloudflare Workers ortamında lokal test kullanmaktadır. Test eklerken:

### Manuel Test Senaryoları

```bash
# 1. Normal DNS çözümleme
curl "http://localhost:8787/dns-query?name=example.com&type=A" \
  -H "Accept: application/dns-json"
# Beklenen: Status 0, Answer içinde A kaydı

# 2. Engellenen domain
curl "http://localhost:8787/dns-query?name=doubleclick.net&type=A" \
  -H "Accept: application/dns-json"
# Beklenen: Status 3 (NXDOMAIN)

# 3. Subdomain engelleme
curl "http://localhost:8787/dns-query?name=test.doubleclick.net&type=A" \
  -H "Accept: application/dns-json"
# Beklenen: Status 3 (NXDOMAIN)

# 4. Cache kontrolü (aynı sorguyu 2 kez gönder)
curl -v "http://localhost:8787/dns-query?name=cloudflare.com&type=A" \
  -H "Accept: application/dns-json" 2>&1 | grep X-Cache
# 1. sorgu: X-Cache: MISS
# 2. sorgu: X-Cache: HIT

# 5. Apple profil indirme
curl "http://localhost:8787/apple-profile?domain=doh.example.com"
# Beklenen: XML .mobileconfig dosyası

# 6. Admin auth
curl http://localhost:8787/admin/stats
# Beklenen: 401 Unauthorized

# 7. Health check
curl http://localhost:8787/health
# Beklenen: { "status": "ok" }
```

### Otomatik Test Ekleme (Gelecek)

Vitest veya Miniflare tabanlı test altyapısı planlanmaktadır. Katkıda bulunmak isterseniz:

```typescript
// test/blocker.test.ts (örnek yapı)
import { describe, it, expect } from 'vitest';
import { isBlocked } from '../src/blocker';

describe('isBlocked', () => {
  it('should block known ad domains', async () => {
    expect(await isBlocked('doubleclick.net')).toBe(true);
  });

  it('should block subdomains of blocked domains', async () => {
    expect(await isBlocked('ads.doubleclick.net')).toBe(true);
  });

  it('should not block legitimate domains', async () => {
    expect(await isBlocked('example.com')).toBe(false);
  });
});
```

---

## Sık Sorulan Sorular

### Katkı yapmak için Cloudflare hesabı gerekli mi?

Hayır! `npm run dev` ile tüm özellikleri lokal olarak test edebilirsiniz. KV namespace gerektiren özellikler (admin, istatistik) için Cloudflare hesabı gerekir, ancak temel DNS işlevselliği hesap olmadan çalışır.

### TypeScript deneyimim az, yine de katkıda bulunabilir miyim?

Elbette! Dokümantasyon, blocklist katkıları ve hata raporları çok değerlidir. Kod katkısı için mevcut dosyalardaki kalıpları takip edebilirsiniz.

### Blocklist'e domain eklemek istiyorum, nasıl yaparım?

1. `src/blocklist.ts` dosyasını açın
2. İlgili kategoriye domaini ekleyin
3. Domainin meşru servisleri bozmadığını doğrulayın
4. PR açın ve domainin neden engellenmesi gerektiğini açıklayın

### PR'ım ne kadar sürede review edilir?

Genellikle 1-7 gün içinde ilk review yapılır. Acil güvenlik düzeltmeleri daha hızlı ele alınır.

### Büyük bir değişiklik yapmak istiyorum, önce sormalı mıyım?

Evet! Büyük değişiklikler için önce bir issue açarak tartışma başlatın. Bu, hem sizin hem de reviewer'ların zamanından tasarruf sağlar.

---

## Lisans

Bu projeye katkıda bulunarak, katkınızın projenin lisansı altında yayınlanacağını kabul etmiş olursunuz. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

## İletişim

- **GitHub Issues** — Hata bildirimi ve özellik önerileri
- **Pull Requests** — Kod katkıları
- **Discussions** — Genel tartışmalar ve sorular

---

*Bu rehber, projenin büyümesiyle birlikte güncellenecektir. Önerilerinizi bekliyoruz!*
