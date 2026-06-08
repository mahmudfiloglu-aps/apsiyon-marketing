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

## 2026-06-04 — Şifremi Unuttum / Şifre Sıfırlama akışı

**Dosyalar:** `lib/db.ts`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts`  
**Değişiklik:** Şifre sıfırlama akışı eklendi. `password_reset_tokens` tablosu DB'ye eklendi. Kullanıcı e-postasını girince 1 saatlik token üretilip Resend API ile sıfırlama maili gönderiliyor. Giriş sayfasına "Şifremi unuttum" linki eklendi.  
**Dikkat:** `RESEND_API_KEY` env değişkeni Vercel'e eklenmelidir. `RESEND_FROM_EMAIL` opsiyoneldir (varsayılan: `noreply@apsiyon.com`) — bu adresin Resend'de domain doğrulaması yapılmış olması gerekir.

---

## 2026-06-04 — Admin panel şifre yenileme (super admin)

**Dosyalar:** `app/admin/AdminClient.tsx`, `app/api/admin/users/route.ts`, `lib/db.ts`  
**Değişiklik:** Super admin kullanıcı tablosunda her satıra "Şifre Yenile" butonu eklendi. Modal ile yeni şifre belirleniyor, bcrypt ile hash'leniyor.

---

## 2026-06-04 — Sidebar: collapsible sections + kompakt boyutlar

**Dosyalar:** `components/Sidebar.tsx`  
**Değişiklik:** Her section başlığı tıklanabilir toggle buton oldu. ▲▼ göstergesi eklendi. Nav item'ları küçültüldü. Sidebar genişliği `w-64` → `w-60`.

---

## 2026-06-04 — Apsiyon Marketing Automation Center rebrand

**Dosyalar:** `components/Sidebar.tsx`, `components/ApsiyonLogo.tsx`, `app/layout.tsx`  
**Değişiklik:** Uygulama yeniden markalandı. Sidebar 4 marketing section'a bölündü.

---

## 2026-06-04 — Blog Bulucu: 3 sekme + içerik başlık önerileri

**Dosyalar:** `app/blog-tools/BlogToolsClient.tsx`, `app/api/blog-recommend/route.ts`, `app/api/blog-search/route.ts`  
**Değişiklik:** 3 sekme: YouTube Blog Bulucu / İçerik Bulucu / Blog Yönetimi. 60+ puan bulunamazsa başlık önerileri gösteriliyor.

---

## 2026-06-03 — 24 saatlik localStorage cache + eşleşme detayları

**Dosyalar:** `app/blog-tools/BlogToolsClient.tsx`  
**Değişiklik:** YouTube sonuçları 24 saat cache'leniyor. Eşleşme nedenleri breakdown'ı eklendi.

---

## 2026-06-03 — Blog önerisi 504 timeout fix

**Dosyalar:** `app/api/blog-recommend/route.ts`  
**Değişiklik:** `maxDuration=60`, `Promise.race` 25s timeout, lokal fallback.

---

## 2026-06-02 — Blog Bulucu sistemi (v1)

**Dosyalar:** `lib/db.ts`, `app/api/blog-*`, `app/blog-tools/*`, `app/admin/AdminClient.tsx`  
**Değişiklik:** Sitemap → slug → keyword → DB → AI öneri akışı.

---

## 2026-06-01 — Maliyet Raporu Google + Meta birleşik görünüm

**Dosyalar:** `app/reports/ReportsClient.tsx`  
**Değişiklik:** TOPLAM satır double-counting düzeltildi, `pickCol()` eklendi.
