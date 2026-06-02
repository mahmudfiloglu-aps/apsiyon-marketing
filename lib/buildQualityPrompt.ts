import type { LeadRow } from '@/types/lead'

export function buildQualityPrompt(lead: LeadRow, services: string[]): string {
  return `Sen Apsiyon'un lead kalite değerlendirme uzmanısın.

Bu leadin satış potansiyelini ve kalitesini değerlendir. Mevcut CRM durumu ne olursa olsun (Uygun Bulunmadı, Devam Eden, vb.) — sana verilen bilgilere göre bağımsız karar ver.

Apsiyon ürünleri: Site Yönetim Yazılımı, PTS (Plaka Tanıma), QR/Kartlı Geçiş, Kazan Otomasyonu, ADA Dijital Asistan, Tur Kontrol, Saha Mobil Uygulaması.

Hedef kitle: Site yöneticisi, apartman yöneticisi, yönetim şirketi, büyük rezidans.

Değerlendirme kriterleri:
- Hedef kitleye uygunluk (yönetici mi? doğru sektörde mi?)
- Satışçı notu kalitesi (iletişim gerçekleşti mi? bilgi var mı?)
- Ürün uyumu (başvuru kampanyası ile gerçek ihtiyaç örtüşüyor mu?)
- Satış fırsatı gücü (ihtiyaç netliği, bütçe, zamanlama)

━━━ LEAD BİLGİLERİ ━━━
Başvuru Kampanyası: ${lead['Başvuru Kampanyası'] || '—'}
Hesap Tipi: ${lead['Hesap Tipi'] || '—'}
Kayıt Tipi: ${lead['Kayıt Tipi'] || '—'}
Mevcut Durum: ${lead['Durum Detayı'] || lead['Durumu'] || '—'}
Olumsuzluk Nedeni: ${lead['Olumsuzluk Nedeni'] || '—'}
Son Aktivite: ${lead['Son Aktivite Başlığı'] || '—'}
Satışçı Notu: "${lead['Son Aktivite Açıklaması'] || '—'}"
━━━━━━━━━━━━━━━━━━━━━

TIER TANIMI:
- "Sıcak" (8-10): Net ihtiyaç, doğru hedef kitle, güçlü satış fırsatı
- "İlgili" (6-7): İhtiyaç var ama zamanlama/bütçe/bilgi eksik
- "Soğuk" (4-5): Zayıf sinyal, belirsiz ihtiyaç veya yanlış zamanlama
- "Uygunsuz" (1-3): Hedef kitle dışı, yanlış kayıt veya hiç potansiyel yok

Yanıtını SADECE şu JSON formatında ver, başka hiçbir şey yazma:
{
  "qualityScore": 1-10,
  "tier": "Sıcak" | "İlgili" | "Soğuk" | "Uygunsuz",
  "reason": "max 2 cümle Türkçe gerekçe",
  "matchedServices": [${services.map((s) => `"${s}"`).join(', ')}]
}
Not: matchedServices sadece bu listeden seçilecek: ${services.map((s) => `"${s}"`).join(', ')}`
}
