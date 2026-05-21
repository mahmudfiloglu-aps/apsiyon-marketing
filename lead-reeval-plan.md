# 🎯 Lead Yeniden Değerlendirme Sistemi — Proje Planı

## Proje Özeti

CRM'den (Dynamics 365) export edilen lead verilerini (CSV/XLSX) AI ile analiz ederek yanlış sınıflandırılmış "Uygun Bulunmadı" lead'leri tespit eden ve raporlayan web uygulaması.

---

## Gerçek Veri Yapısı (Lead___Firma_Detay.xlsx)

Dosya **11.269 satır**, tek sheet: `Export`

### Kolon Listesi (41 kolon)

| # | Kolon Adı | Açıklama | AI İçin Önemi |
|---|---|---|---|
| 1 | Yıl | Kayıt yılı | — |
| 2 | Ay | Kayıt ayı | — |
| 3 | Tarih | Tarih (serial) | — |
| 4 | Saat | Saat | — |
| 5 | Sahibi | Atanan kullanıcı | — |
| 6 | Kayıt Tipi | `Lead` / `Account` | Filtre: sadece `Lead` |
| 7 | **Durumu** | Ana durum alanı | ⭐ **Ana filtre kolonu** |
| 8 | **Durum Detayı** | Alt durum | ⭐ Ek filtre |
| 9 | Hesap Tipi | Müşteri segmenti | Bağlam |
| 10 | Hesap Adı | Site/şirket adı | — |
| 11 | Satış Kampanyası | Kampanya adı | — |
| 12 | Başvuru Kanal Grubu | Ads / Organic / Offline | — |
| 13 | Başvuru Kanalı | Facebook / Google vb. | — |
| 14 | Başvuru Aracı | FormAds / CPC vb. | — |
| 15 | Başvuru Kampanyası | Kampanya kodu | ⭐ Hizmet ipucu |
| 16 | İlgili Kişi | Müşteri adı | — |
| 17 | İlgili Kişi E-Posta | E-posta | — |
| 18 | İlgili Kişi - GSM | Telefon | — |
| 19 | Son Başvuru Kaynağı | Başvuru kaynağı | Bağlam |
| 20 | Şehir | Şehir | — |
| 21 | İlçe | İlçe | — |
| 22 | **Olumsuzluk Nedeni** | Olumsuzluk sebebi | ⭐ AI değerlendirme |
| 23 | Son Aktivite Tarihi | Son aktivite tarihi | — |
| 24 | Son Aktivite Tipi | Görev / Telefon görüşmesi vb. | Bağlam |
| 25 | Son Aktivite Türü | Arama / Randevu vb. | Bağlam |
| 26 | Son Aktivite Başlığı | Aktivite başlığı | ⭐ Ek bağlam |
| 27 | **Son Aktivite Açıklaması** | Satışçı notu | ⭐⭐ **Ana AI girdi kolonu** |
| 28 | B. Bölüm | Birim sayısı | Bağlam |
| 29 | ID | CRM kayıt ID | Export'ta kullan |
| 30 | Sözleşme ID | — | — |
| 31 | Sözleşme No | — | — |
| 32 | Satış Temsilcisi | — | — |
| 33 | Eski Sözleşme Mi? | — | — |
| 34 | Kazanım Tipi | — | — |
| 35 | Cari Tipi | — | — |
| 36 | Cari Adı | — | — |
| 37 | Site Adı | — | — |
| 38 | Cari Şehir | — | — |
| 39 | Site B. Bölüm | — | — |
| 40 | Ürün Grubu | — | — |
| 41 | Ürün Adı | — | — |

---

## Filtreleme Mantığı

### AI'ya gönderilecek satırlar (AND koşulu):

```
Kayıt Tipi = "Lead"
VE
Durumu = "Uygun Bulunmadı"
```

### Durumu değerleri (gerçek veriden):
- `Aç` → işleme alma
- `Etkin` → işleme alma
- `Uygun Bulundu` → işleme alma
- **`Uygun Bulunmadı`** → ✅ AI analizi yapılacak
- `Etkin Değil` → işleme alma

### Durum Detayı — Olumsuz kategoriler (gerçek veriden):

| Durum Detayı | AI Stratejisi |
|---|---|
| `Alakasız` | ⭐ Yüksek öncelik — nota bak, gerçekten alakasız mı? |
| `Bilgi verildi` | Orta — dönüş bekleniyor olabilir |
| `Kiralama istemiyor` | Orta — farklı paket sunulabilir mi? |
| `Kat Maliki` | Orta — segment uyumsuzluğu ama ilgi var |
| `Ulaşılamadı` | Düşük — teknik sorun, içerik ilgisiz olabilir |
| `İletişim Bilgisi Yok / Eksik / Hatalı` | Düşük — teknik sorun |
| `Teknolojiye Uzak` | Orta — notta ipucu var mı? |
| `İhtiyacı Yok` | ⭐ Yüksek öncelik — gerçekten mi yok? |
| `Datayı Kendi Bünyesinde İstiyor` | Orta |
| `Mükerrer Kayıt` | Düşük — zaten başka kayıt var |
| `Firma Faaliyette Değil` | Düşük |

---

## AI Analiz Prompt Şablonu

```
Sen bir satış kalite kontrol uzmanısın. Şirketin sunduğu hizmetler:
{{SERVICE_LIST}}

Aşağıdaki lead "Uygun Bulunmadı" olarak işaretlenmiş.

Başvuru Kampanyası: {{Başvuru Kampanyası}}
Son Aktivite Başlığı: {{Son Aktivite Başlığı}}
Satışçı Notu: "{{Son Aktivite Açıklaması}}"
Durum Detayı: {{Durum Detayı}}
Hesap Tipi: {{Hesap Tipi}}

Görev:
1. Nottan ve kampanya bilgisinden gerçek ihtiyacı anla.
2. Bu ihtiyaç hizmetlerimizden biriyle örtüşüyor mu?
3. Eğer örtüşüyorsa lead yanlış etiketlenmiş demektir.

Yanıtını SADECE şu JSON formatında ver:
{
  "suggestedStatus": "Yeniden Değerlendir" | "Onayla Olumsuz" | "Belirsiz",
  "confidence": "Yüksek" | "Orta" | "Düşük",
  "reason": "max 2 cümle açıklama",
  "matchedServices": ["eşleşen hizmet adı"]
}
```

### Kampanya kodlarından hizmet tespiti (ek bağlam):
Dosyada kampanya kodları güçlü ipuçları içeriyor:
- `_PTS_` → Plaka Tanıma Sistemi
- `_GW_` → Genel (Apsiyon yazılım)
- `_TurKontrolSistemi` → Tur Kontrol
- `_KazanOtomasyon` → Kazan Otomasyon
- `_QR_` → QR Kod sistemi

---

## Veri Modeli

### Giriş

```ts
type LeadRow = {
  // Kimlik
  ID: string                         // Kolon 29
  'İlgili Kişi': string
  'Hesap Adı': string
  'Satış Temsilcisi': string
  Şehir: string

  // Filtre alanları
  'Kayıt Tipi': 'Lead' | 'Account'
  Durumu: 'Uygun Bulunmadı' | string
  'Durum Detayı': string
  'Olumsuzluk Nedeni': string

  // AI girdileri
  'Son Aktivite Açıklaması': string  // ⭐ Ana not kolonu
  'Son Aktivite Başlığı': string
  'Başvuru Kampanyası': string       // Hizmet ipucu
  'Hesap Tipi': string

  [key: string]: string              // Diğer kolonlar export'ta taşınır
}
```

### AI Çıktısı

```ts
type AnalysisResult = {
  leadId: string                     // ID kolonu
  originalStatus: 'Uygun Bulunmadı'
  originalDetail: string             // Durum Detayı
  suggestedStatus: 'Yeniden Değerlendir' | 'Onayla Olumsuz' | 'Belirsiz'
  confidence: 'Yüksek' | 'Orta' | 'Düşük'
  reason: string
  matchedServices: string[]
}
```

---

## Mimari

```
[Kullanıcı]
    │
    ▼
[Next.js Frontend — Vercel]
    │  XLSX yükleme (Lead___Firma_Detay.xlsx formatı)
    │  Hizmet listesi girişi
    │  Filtre: Kayıt Tipi=Lead + Durumu=Uygun Bulunmadı
    ▼
[Next.js API Route — /api/analyze]
    │  Batch: 5 paralel istek
    │  Kolon: Son Aktivite Açıklaması + Başvuru Kampanyası
    ▼
[Anthropic Claude API — claude-sonnet-4-20250514]
    │
    ▼
[Sonuç Tablosu]
    │  🟢 Yeniden Değerlendir
    │  🔴 Onayla Olumsuz  
    │  🟡 Belirsiz
    ▼
[XLSX Export — orijinal + 4 yeni kolon]
```

---

## Tech Stack

| Katman | Teknoloji | Neden |
|---|---|---|
| Frontend + API | Next.js 14 (App Router) | Vercel'de ücretsiz, API routes dahil |
| UI | Tailwind CSS + shadcn/ui | Hızlı geliştirme |
| Dosya okuma | `xlsx` (SheetJS) | CSV ve XLSX aynı kütüphane |
| AI | Anthropic Claude API | Türkçe not okuma, düşük maliyet |
| Export | `xlsx` + `file-saver` | Düzeltilmiş tabloyu XLSX indir |
| Host | **Vercel** (ücretsiz tier) | Next.js için en doğal seçim |

---

## Dosya Yapısı

```
lead-reeval/
├── app/
│   ├── page.tsx                  # Ana sayfa (upload + hizmet config)
│   ├── results/page.tsx          # Sonuç tablosu
│   └── api/
│       └── analyze/route.ts      # AI analiz endpoint'i
├── components/
│   ├── FileUploader.tsx          # XLSX yükleme
│   ├── ServiceConfig.tsx         # Hizmet listesi formu
│   ├── ResultsTable.tsx          # Yeniden değerlendirme tablosu
│   └── ExportButton.tsx          # XLSX export
├── lib/
│   ├── parseLeads.ts             # XLSX → JSON, sadece Uygun Bulunmadı + Lead
│   ├── buildPrompt.ts            # Her lead için AI prompt
│   └── analyzeLeads.ts           # Batch API + rate limiting
├── types/lead.ts
├── .env.local                    # ANTHROPIC_API_KEY
└── vercel.json
```

---

## Uygulama Akışı

### Adım 1 — Hizmet Tanımlama
Kullanıcı satılan hizmetleri girer (örnek):
```
- Plaka Tanıma Sistemi (PTS) Kiralama
- Apsiyon Site Yönetim Yazılımı
- Tur Kontrol Sistemi
- QR Kod Geçiş Sistemi
- Kazan Otomasyon Sistemi
- Saha Mobil Uygulaması
```

### Adım 2 — Dosya Yükleme
`Lead___Firma_Detay.xlsx` yüklenir. Kolon mapping otomatik (sabit format).

### Adım 3 — Otomatik Filtreleme
```
Kayıt Tipi = "Lead" VE Durumu = "Uygun Bulunmadı"
```
Örnek: 11.269 satırdan tahminen 500–1500 lead analiz edilir.

### Adım 4 — AI Analizi
Her lead için `Son Aktivite Açıklaması` + `Başvuru Kampanyası` + `Durum Detayı` Claude'a gönderilir.

### Adım 5 — Sonuç Tablosu

| İlgili Kişi | Hesap Adı | Durum Detayı | Satışçı Notu (özet) | AI Öneri | Güven | Açıklama |
|---|---|---|---|---|---|---|
| Ali Bey | Albayrak Apt. | Kiralama istemiyor | pts için kayıt... | 🟢 Yeniden Değerlendir | Yüksek | PTS ilgisi var |
| Orhan | Mega Su | Alakasız | kat maliki hatalı form | 🔴 Onayla Olumsuz | Yüksek | Gerçekten alakasız |

### Adım 6 — Export
Orijinal 41 kolon + 4 yeni kolon:
```
AI_Öneri | AI_Güven | AI_Açıklama | AI_EşleşenHizmet
```

---

## Deployment

```bash
npx create-next-app@latest lead-reeval --typescript --tailwind --app
cd lead-reeval
npm install xlsx file-saver @anthropic-ai/sdk

# .env.local
ANTHROPIC_API_KEY=sk-ant-...

vercel deploy
```

**Vercel Free Tier:** 60s function timeout → ~50-60 lead/istek.
Daha fazlası için frontend-side batching (100'er gruplar halinde).

---

## Maliyet Tahmini

| Senaryo | Lead Sayısı | Tahmini Token | Maliyet |
|---|---|---|---|
| Günlük batch | ~200 | ~100K | ~$0.30 |
| Haftalık batch | ~1.000 | ~500K | ~$1.50 |
| Aylık tam export | ~5.000 | ~2.5M | ~$7.50 |

---

## Geliştirme Yol Haritası

### MVP (2-3 gün)
- [ ] Next.js kurulumu + Vercel deploy
- [ ] XLSX parse (sabit kolon formatı)
- [ ] Hizmet tanımlama formu
- [ ] AI analiz API route (batch, 5 paralel)
- [ ] Sonuç tablosu (filtreli/sıralanabilir)
- [ ] XLSX export (orijinal + AI kolonları)

### V2
- [ ] Durum Detayı'na göre öncelik sıralaması
- [ ] Kampanya kodundan otomatik hizmet eşleştirme
- [ ] Satış temsilcisine göre gruplama
- [ ] "Kurtarılan lead" sayısı dashboard'u

---

## Güvenlik

- `ANTHROPIC_API_KEY` sadece server-side API route'da — frontend'e expose edilmez
- Yüklenen dosya memory'de işlenir, diske yazılmaz
- Vercel environment variable olarak saklanır
