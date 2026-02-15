# Güvenlik Politikası | Security Policy

## 🇹🇷 Türkçe

### Desteklenen Sürümler

| Sürüm | Destek Durumu |
|--------|---------------|
| Son dağıtım (main branch) | Aktif destek |
| Eski commit'ler | Destek dışı |

Bu proje Cloudflare Workers üzerinde çalışan tek-sürümlü bir uygulamadır. Her zaman `main` branch'teki en güncel kodu dağıtmanızı öneriyoruz.

### Güvenlik Açığı Bildirme

Bir güvenlik açığı keşfettiyseniz, **lütfen public issue açmayın**. Bunun yerine:

1. **E-posta** ile bildirin (proje sahibinin iletişim bilgilerine GitHub profilinden ulaşabilirsiniz)
2. Veya GitHub'ın **Security Advisories** özelliğini kullanın:
   - Repository → Security → Advisories → "New draft security advisory"

#### Raporunuza dahil edin:

- Açığın açıklaması
- Tekrarlama adımları
- Potansiyel etki
- (Varsa) önerilen düzeltme

#### Yanıt süresi:

- **İlk yanıt:** 48 saat içinde
- **Durum güncellemesi:** 7 gün içinde
- **Düzeltme:** Ciddiyete bağlı olarak 7-30 gün

### Güvenlik Mimarisi

#### DNS Gizliliği

UnfilteredHub, DNS gizliliğini şu şekilde korur:

| Özellik | Açıklama |
|---------|----------|
| **HTTPS şifrelemesi** | Tüm DNS sorguları TLS üzerinden iletilir |
| **Sıfır loglama** | DNS sorguları kalıcı olarak kaydedilmez |
| **Sampling istatistikler** | Yalnızca toplu sayaçlar tutulur (hangi domain sorgulandığı değil) |
| **Edge işleme** | Veriler Cloudflare edge'de işlenir, merkezi sunucuya gitmez |

#### Saldırı Yüzeyi Analizi

```
İnternet → Cloudflare Edge → Workers Runtime → unfilteredhub-doh
                                                    │
                                                    ├── Landing Page (statik HTML)
                                                    ├── DNS Proxy (upstream: 1.1.1.1)
                                                    ├── Blocklist (okuma)
                                                    ├── Cache (okuma/yazma)
                                                    ├── Stats (KV yazma)
                                                    └── Admin API (auth gerekli)
```

#### Kimlik Doğrulama

| Endpoint | Kimlik Doğrulama | Yöntem |
|----------|-------------------|--------|
| `GET /` | Yok (public) | — |
| `GET /health` | Yok (public) | — |
| `GET /apple-profile` | Yok (public) | — |
| `GET/POST /dns-query` | Yok (public) | — |
| `/admin/*` | Gerekli | `X-API-Key` header |

#### Admin API Güvenliği

- API key `ADMIN_KEY` secret olarak saklanır (Wrangler secrets)
- Kod içinde hiçbir yerde hardcoded değildir
- Her admin isteğinde header kontrolü yapılır
- Eşleşmeyen key → `401 Unauthorized`

#### Girdi Doğrulama

| Girdi | Doğrulama |
|-------|-----------|
| DNS domain (JSON) | URL parametresinden parse, upstream'e geçirilir |
| DNS query (wireformat) | Binary format, label-length encoding ile parse edilir |
| Admin domain ekleme | `toLowerCase()`, `trim()`, trailing dot temizleme, `.` kontrolü |
| Apple profil domain | XML escape (`&`, `<`, `>`, `"`, `'`) |
| Cursor/limit parametreleri | Sayısal parse, max limit uygulanır |

### Bilinen Güvenlik Konuları

#### DNS Amplification Koruması

- Workers, gelen isteklerin gerçek IP'sini göremez (Cloudflare proxy)
- Cloudflare'in kendi DDoS koruması aktiftir
- Workers rate limiting, Cloudflare tarafından yönetilir

#### Cache Poisoning

- Cache key'ler deterministik ve öngörülebilir (`domain/type` formatı)
- Yalnızca upstream Cloudflare DNS (1.1.1.1) yanıtları cache'lenir
- TTL, upstream yanıtından alınır (min 60s, max 3600s)
- Cache, Workers Cache API'de saklanır (dış erişim yok)

#### KV Veri Bütünlüğü

- Blocklist domain'leri KV'de salt okunur değer ("1") ile saklanır
- Admin API ile ekleme/silme, API key gerektirir
- Bulk import scripti, Cloudflare API token gerektirir

### Güvenlik En İyi Uygulamaları

Dağıtım yaparken:

1. **Güçlü ADMIN_KEY kullanın** — En az 32 karakter, rastgele oluşturulmuş
   ```bash
   # Güçlü key oluşturma
   openssl rand -hex 32
   ```

2. **Cloudflare API token'larını minimum yetki ile oluşturun**
   - Import scripti: Yalnızca `Workers KV Storage:Edit`
   - Başka yetki vermeyin

3. **Özel domain kullanıyorsanız** Cloudflare proxy'sini aktif tutun (turuncu bulut)

4. **Secret'ları asla commit etmeyin** — `.dev.vars` dosyasını `.gitignore`'a ekleyin

5. **Düzenli güncelleyin** — Wrangler ve bağımlılıkları güncel tutun

---

## 🇬🇧 English

### Supported Versions

| Version | Support Status |
|---------|---------------|
| Latest deployment (main branch) | Active support |
| Older commits | Unsupported |

This is a single-version application running on Cloudflare Workers. We recommend always deploying the latest code from the `main` branch.

### Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue**. Instead:

1. **Email** the project maintainer (contact info available on their GitHub profile)
2. Or use GitHub's **Security Advisories** feature:
   - Repository → Security → Advisories → "New draft security advisory"

#### Include in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

#### Response timeline:

- **Initial response:** Within 48 hours
- **Status update:** Within 7 days
- **Fix:** 7-30 days depending on severity

### Security Architecture

#### DNS Privacy

UnfilteredHub protects DNS privacy through:

| Feature | Description |
|---------|-------------|
| **HTTPS encryption** | All DNS queries transmitted over TLS |
| **Zero logging** | DNS queries are not permanently recorded |
| **Sampled statistics** | Only aggregate counters are kept (not which domains were queried) |
| **Edge processing** | Data processed at Cloudflare edge, no central server |

#### Authentication

| Endpoint | Authentication | Method |
|----------|---------------|--------|
| `GET /` | None (public) | — |
| `GET /health` | None (public) | — |
| `GET /apple-profile` | None (public) | — |
| `GET/POST /dns-query` | None (public) | — |
| `/admin/*` | Required | `X-API-Key` header |

#### Input Validation

| Input | Validation |
|-------|-----------|
| DNS domain (JSON) | Parsed from URL parameter, forwarded to upstream |
| DNS query (wireformat) | Binary format, parsed via label-length encoding |
| Admin domain addition | `toLowerCase()`, `trim()`, trailing dot removal, `.` check |
| Apple profile domain | XML escape (`&`, `<`, `>`, `"`, `'`) |
| Cursor/limit parameters | Numeric parse, max limit enforced |

### Security Best Practices

When deploying:

1. **Use a strong ADMIN_KEY** — At least 32 characters, randomly generated
   ```bash
   openssl rand -hex 32
   ```

2. **Create Cloudflare API tokens with minimum permissions**
   - Import script: Only `Workers KV Storage:Edit`

3. **If using a custom domain**, keep Cloudflare proxy active (orange cloud)

4. **Never commit secrets** — Add `.dev.vars` to `.gitignore`

5. **Keep dependencies updated** — Regularly update Wrangler and other packages

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| DNS query snooping | HTTPS encryption (DoH) |
| Admin API unauthorized access | API key authentication |
| Cache poisoning | Deterministic cache keys, trusted upstream only |
| DDoS amplification | Cloudflare's built-in DDoS protection |
| XSS in landing page | No user-generated content rendered |
| XML injection in profiles | XML entity escaping |
| KV data tampering | Admin API key required for writes |

---

*This security policy is reviewed and updated as the project evolves.*
