@AGENTS.md

---

# Apsiyon Marketing Automation Center — Project Instructions

> **ZORUNLU:** Her sohbet başında bu dosyayı **ve** `DEVLOG.md` dosyasını oku.
> `DEVLOG.md`'deki son girişleri kontrol etmeden kod yazma.
> Geliştirme tamamlandığında `DEVLOG.md`'e yeni giriş ekle ve 7 günden eski kayıtları sil.

---

## Proje Özeti

Apsiyon için dahili Marketing Automation Center. Satış & reklam verisi analizi,
blog/içerik keşfi ve (yakında) sosyal medya yorum yönetimini tek çatı altında toplar.

**URL:** Vercel üzerinde deploy edilir (otomatik, `main` branch'e push yeterli).  
**Repo:** `mahmudfiloglu-aps/leed-reveeal`  
**Branch:** `main` — doğrudan push, PR yok.

---

## Tech Stack

| Katman | Teknoloji | Versiyon |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| UI | React | 19.2.4 |
| Stil | Tailwind CSS | v4 |
| Dil | TypeScript | ^5 |
| Veritabanı | Neon Postgres (serverless) | `@neondatabase/serverless ^1.1.0` |
| Auth | JWT (`jose`) + bcryptjs | — |
| AI — sınıflandırma | Google Gemini via Vertex AI | `@google/genai ^2.6.0` |
| CSV parse | PapaParse | ^5.5.3 |
| Excel export | xlsx, file-saver | — |
| Icons | lucide-react | ^1.16.0 |

---

## Dış Servisler & Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | Neon Postgres bağlantı string'i |
| `JWT_SECRET` | Oturum imzalama anahtarı |
| `GOOGLE_CLOUD_PROJECT` | Vertex AI proje ID |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI bölgesi (varsayılan: `us-central1`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | JSON string veya dosya yolu (Vertex AI kimlik) |
| `GEMINI_CLASSIFICATION_MODEL` | Varsayılan: `gemini-2.5-flash` |

Vertex AI kimlik bilgisi JSON string olarak env'e verilebilir (`{...}` ile başlıyorsa parse edilir).

---

## Veritabanı — Tablo Özeti

```
users               id, email, name, password_hash, role, created_at
sessions            id, user_id, token, created_at, expires_at
permissions         id, user_id, module, is_enabled
analyses            id, user_id, file_name, filtered_count, total_count, result_json, created_at
quality_analyses    id, user_id, file_name, total_count, result_json, created_at
report_projects     id, name, created_by, created_at
report_files        id, project_id, file_type, file_name, file_data, is_previous
ad_reports          id, project_id, report_json, created_at
keywords            id, user_id, keyword, created_at
analytics           id, user_id, data_json, created_at
blog_settings       key, value, updated_at
blog_posts          id, url, slug, title, auto_keywords[], manual_keywords[], last_synced, created_at
```

Tablo oluşturma: `lib/db.ts` içindeki `create*Tables()` fonksiyonları ilk erişimde çalışır.

---

## Dosya Yapısı

```
app/
  page.tsx                  → Lead Analizi (ana sayfa)
  quality/                  → Lead Kalitesi
  reports/                  → Reklam Raporları (Google + Meta)
  analytics/                → Analitik
  blog-tools/               → Blog Bulucu (3 sekme)
  keywords/                 → Negatif Kelimeler
  settings/                 → Ayarlar
  admin/                    → Kullanıcı & izin yönetimi
  sign-in/ sign-up/         → Auth sayfaları
  api/
    analyze/                → Lead AI analizi
    blog-recommend/         → YouTube → blog önerisi (Gemini)
    blog-search/            → Hızlı keyword arama (lokal)
    blog-posts/             → Blog CRUD + /sync (sitemap parse)
    blog-settings/          → Sitemap URL ayarı
    ad-reports/             → Reklam raporu kaydet/getir
    report-projects/        → Proje CRUD
    analyses/               → Lead analiz geçmişi
    quality-analyses/       → Kalite analiz geçmişi
    admin/users|permissions → Kullanıcı & izin yönetimi
    keywords/               → Negatif kelime CRUD
    analytics/              → Analitik veri
    auth/                   → Login/logout/me

components/
  Sidebar.tsx               → Navigasyon (collapsible sections)
  ApsiyonLogo.tsx           → SVG logo bileşeni (#00A5DF)
  AppShell.tsx              → Layout wrapper (sidebar + içerik)

lib/
  db.ts                     → Neon SQL helpers + tüm DB fonksiyonları
  auth.ts                   → JWT session yönetimi
  analyzeLeads.ts           → Lead AI analiz mantığı
  buildPrompt.ts            → Lead analiz prompt'u
  buildQualityPrompt.ts     → Kalite analiz prompt'u
  parseLeads.ts             → CSV/Excel parse
  APSIYON_REFERENCE.md      → AI için Apsiyon ürün referansı
```

---

## Roller & İzinler

| Rol | Yetki |
|---|---|
| `super_admin` | Her şey + kullanıcı rolü değiştirme |
| `admin` | Modül izinleri düzenleme + blog sync |
| `viewer` | İzin verilen modülleri görüntüleme |

Modül anahtarları: `lead_analysis`, `lead_quality`, `analytics`, `keywords`,
`ad_reports`, `blog_tools`, `settings`

---

## Sidebar Navigasyon Yapısı

```
Performance Marketing  → Lead Analizi, Lead Kalitesi, Reklam Raporları, Analitik
Content & SEO          → Blog Bulucu, Negatif Kelimeler
Social Media           → Yorum & Yanıt (yakında)
Sistem                 → Ayarlar, Yönetim
```

Her section tıklanarak açılıp kapatılabilir. Brand rengi: `#00A5DF`.

---

## Blog Bulucu — Çalışma Mantığı

1. **Admin** → Admin Paneli → Sitemap URL yaz → Kaydet
2. **Admin** → Blog Yönetimi sekmesi → "Senkronize Et" → sitemap parse → `blog_posts` tablosu dolar
3. **Kullanıcı** → YouTube Blog Bulucu → video başlığı + açıklama → lokal skor → Gemini AI → 3-5 blog önerisi
4. Eğer 60+ puan yoksa → "Öneri başlıklar" kartı gösterilir
5. Sonuçlar 24 saat `localStorage` cache'de tutulur

Lokal skor ağırlıkları: manual keyword=4, auto keyword=3, title=2, slug=1  
Türkçe normalizasyon: `normTR()` (ğ→g, ü→u, ş→s, ı→i, ö→o, ç→c) her iki tarafta da uygulanır.  
Gemini zaman aşımı: 25 sn (`Promise.race`), `maxDuration = 60` (Vercel).

---

## Önemli Konvansiyonlar

- **Commit** her zaman MCP (`mcp__github__push_files`) ile yapılır — local git proxy güvenilmez (503 verir).
- `git config user.email noreply@anthropic.com && git config user.name Claude` her oturumda ayarlanmalı.
- Yorum ekleme — sadece "neden" açıksa yorum yaz, "ne yaptığını" değil.
- `??` yerine `||` kullan — sıfır değerlerin fallback'i geçememesi sorun çıkardı.
- Tüm para/rakam kolonları `pickCol()` ile esnek başlık eşlemesiyle okunur.
