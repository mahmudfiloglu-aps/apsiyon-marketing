# Development Log

> **Kural:** Yeni giriş eklenirken **7 günden eski** kayıtlar silinir.
> Her geliştirme sonunda buraya bir giriş ekle.
>
> Format:
> ```
> ## YYYY-MM-DD — Başlık
> **Dosyalar:** `path/to/file.tsx`, `path/to/other.ts`
> **Değişiklik:** Ne yapıldı, neden yapıldı.
> **Dikkat:** Bilinen kısıtlamalar, edge case'ler, bağımlılıklar.
> ```

---

## 2026-06-04 — Şifremi Unuttum / Şifre Sıfırlama akışı

**Dosyalar:** `lib/db.ts`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts`  
**Değişiklik:** Şifre sıfırlama akışı eklendi. `password_reset_tokens` tablosu DB'ye eklendi. Kullanıcı e-postasını girince 1 saatlik token üretilip Resend API ile sıfırlama maili gönderiliyor. Giriş sayfasına "Şifremi unuttum" linki eklendi.  
**Dikkat:** `RESEND_API_KEY` env değişkeni Vercel'e eklenmelidir. `RESEND_FROM_EMAIL` opsiyoneldir (varsayılan: `noreply@apsiyon.com`) — bu adresin Resend'de domain doğrulaması yapılmış olması gerekir. Geliştirmede `NEXT_PUBLIC_APP_URL` yoksa `host` header'ından URL türetilir.

---

## 2026-06-04 — Sidebar: collapsible sections + kompakt boyutlar

**Dosyalar:** `components/Sidebar.tsx`  
**Değişiklik:** Her section başlığı (Performance Marketing, Content & SEO vb.) tıklanabilir toggle buton oldu. ▲▼ göstergesi eklendi. Nav item'ları küçültüldü: `text-xs`, `py-1.5`, `rounded-md`. Sidebar genişliği `w-64` → `w-60`.  
**Dikkat:** Section açık/kapalı durumu sadece client state'te tutuluyor, sayfa yenilenince sıfırlanıyor.

---

## 2026-06-04 — Apsiyon Marketing Automation Center rebrand

**Dosyalar:** `components/Sidebar.tsx`, `components/ApsiyonLogo.tsx` (yeni), `app/layout.tsx`  
**Değişiklik:** Uygulama adı "Apsiyon Marketing Automation Center" olarak güncellendi. Apsiyon SVG logosu bileşen olarak eklendi. Sidebar marketing odaklı 4 section'a bölündü: Performance Marketing, Content & SEO, Social Media (Yakında), Sistem. "Yorum & Yanıt" placeholder olarak eklendi.  
**Dikkat:** Brand rengi `#00A5DF` — Tailwind'de `text-[#00A5DF]` / `border-[#00A5DF]` ile kullanılıyor.

---

## 2026-06-04 — Blog Bulucu: 3 sekme + içerik başlık önerileri

**Dosyalar:** `app/blog-tools/BlogToolsClient.tsx`, `app/api/blog-recommend/route.ts`, `app/api/blog-search/route.ts` (yeni)  
**Değişiklik:** Blog araçları 3 sekmeye ayrıldı: YouTube Blog Bulucu / İçerik Bulucu / Blog Yönetimi. Yeni `/api/blog-search` endpoint'i eklendi (AI yok, hızlı lokal keyword arama). 60+ puan bulunamazsa içerik başlık önerileri gösteriliyor (violet kart + Kopyala butonları). Sidebar adı "Blog Bulucu" oldu.  
**Dikkat:** İçerik Bulucu 400ms debounce ile otomatik arama yapıyor.

---

## 2026-06-03 — 24 saatlik localStorage cache + eşleşme detayları

**Dosyalar:** `app/blog-tools/BlogToolsClient.tsx`  
**Değişiklik:** YouTube Blog Bulucu sonuçları 24 saat localStorage'da cache'leniyor. Cache'in ne zaman kaydedildiği `💾 HH:MM` badge'i ile gösteriliyor, × ile temizlenebiliyor. Her öneri kartında eşleşme nedenleri breakdown'ı eklendi: ★ mavi=manual, ● yeşil=auto, ○ gri=title.  
**Dikkat:** Cache anahtarı `blog_yt_cache`. Sekme değişimi artık sonuçları sıfırlamıyor.

---

## 2026-06-03 — Blog eşleştirme mantığı iyileştirmesi

**Dosyalar:** `app/api/blog-recommend/route.ts`  
**Değişiklik:** Türkçe karakter normalizasyonu (`normTR`) slug ve query'nin her iki tarafında da uygulanıyor. Prefix tabanlı `tokensMatch()` ile Türkçe çekim eklerinin üstesinden geliniyor (min 4 karakter). Boş durum UI'ı geliştirildi.  
**Dikkat:** "yönetim" → "yonetim" dönüşümü sayesinde slug'larla eşleşiyor.

---

## 2026-06-03 — Blog önerisi 504 timeout fix

**Dosyalar:** `app/api/blog-recommend/route.ts`  
**Değişiklik:** Gemini API 30+ saniye sürebiliyordu. `maxDuration = 60` eklendi, `Promise.race` ile 25 sn timeout konuldu. Lokal scoring her zaman önce çalışıyor, AI opsiyonel olarak üstüne biniyor. Timeout'ta lokal fallback sonuçlar döndürülüyor.

---

## 2026-06-02 — Blog Bulucu sistemi (v1)

**Dosyalar:** `lib/db.ts`, `app/api/blog-settings/route.ts`, `app/api/blog-posts/route.ts`, `app/api/blog-posts/[id]/route.ts`, `app/api/blog-posts/sync/route.ts`, `app/api/blog-recommend/route.ts`, `app/blog-tools/page.tsx`, `app/blog-tools/BlogToolsClient.tsx`, `app/admin/AdminClient.tsx`  
**Değişiklik:** Sitemap URL → slug parse → keyword extraction → DB → AI öneri akışı oluşturuldu. Admin panele sitemap URL alanı eklendi. Blog yönetimi tablosu (manuel keyword düzenleme + sync). Gemini ile YouTube video → blog önerisi.  
**Dikkat:** `blog_settings` ve `blog_posts` tabloları ilk çalıştırmada otomatik oluşturuluyor.

---

## 2026-06-01 — Maliyet Raporu Google + Meta birleşik görünüm

**Dosyalar:** `app/reports/ReportsClient.tsx`  
**Değişiklik:** Maliyet Raporu sekmesi hem Google hem Meta maliyetlerini gösteriyor. `buildSummaryTotals` TOPLAM satır tespiti ile double-counting düzeltildi. `pickCol()` helper ile esnek kolon eşlemesi eklendi. Google CSV'deki `--` aggregate satırları filtrelendi.  
**Dikkat:** Sıfır değerlerin fallback'i için `??` değil `||` kullanılıyor.
