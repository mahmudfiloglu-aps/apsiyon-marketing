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

## 2026-06-08 — Gündem & İçerik Önerileri modülü

**Dosyalar:** `app/api/agenda/route.ts`, `app/agenda/page.tsx`, `app/agenda/AgendaClient.tsx`, `components/Sidebar.tsx`, `lib/db.ts`  
**Değişiklik:** Google News RSS'ten emlak/konut/site yönetimi haberleri çekiliyor, Gemini ile Apsiyon odaklı blog + LinkedIn içerik önerileri üretiliyor. Öncelik (Yüksek/Orta/Düşük) ve içerik türü (Blog/Sosyal) etiketleri gösteriliyor. 6 saatlik localStorage cache. Sidebar Content & SEO'ya eklendi. ALL_MODULES'e 'agenda' ve 'blog_tools' eklendi.  
**Dikkat:** 3 farklı RSS sorgusu paralel çekilir, ilk 20 haber Gemini'ye gönderilir. Google News RSS IP bazlı rate-limit uygulayabilir; Vercel serverless ortamında sorun çıkarsa `NEXT_PUBLIC_APP_URL` env'ini doğru set etmek gerekir.

---

## 2026-06-08 — Şifremi Unuttum / Şifre Sıfırlama akışı

**Dosyalar:** `lib/db.ts`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts`, `middleware.ts`  
**Değişiklik:** Şifre sıfırlama akışı eklendi. `password_reset_tokens` tablosu DB'ye eklendi. Kullanıcı e-postasını girince 1 saatlik token üretilip Resend API ile sıfırlama maili gönderiliyor. Giriş sayfasına "Şifremi unuttum" linki eklendi. Middleware'e public route olarak eklendi.  
**Dikkat:** `RESEND_API_KEY` env değişkeni Vercel'e eklenmelidir. `RESEND_FROM_EMAIL` opsiyoneldir — bu adresin Resend'de domain doğrulaması yapılmış olması gerekir.

---

## 2026-06-04 — Sidebar: collapsible sections + kompakt boyutlar

**Dosyalar:** `components/Sidebar.tsx`  
**Değişiklik:** Her section başlığı tıklanabilir toggle buton oldu. Nav item'ları küçültüldü.

---

## 2026-06-04 — Blog Bulucu: 3 sekme + içerik başlık önerileri

**Dosyalar:** `app/blog-tools/BlogToolsClient.tsx`, `app/api/blog-recommend/route.ts`, `app/api/blog-search/route.ts`  
**Değişiklik:** Blog araçları 3 sekmeye ayrıldı. Yeni `/api/blog-search` endpoint'i eklendi.

---

## 2026-06-03 — Blog eşleştirme Türkçe normalizasyon + 504 timeout fix

**Dosyalar:** `app/api/blog-recommend/route.ts`  
**Değişiklik:** normTR + tokensMatch iyileştirmesi. maxDuration=60, Promise.race ile 25sn timeout.

---

## 2026-06-01 — Maliyet Raporu Google + Meta birleşik görünüm

**Dosyalar:** `app/reports/ReportsClient.tsx`  
**Değişiklik:** Maliyet Raporu hem Google hem Meta gösteriyor. pickCol() helper eklendi.
