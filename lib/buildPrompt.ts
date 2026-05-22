import type { LeadRow } from '@/types/lead'

export function buildPrompt(lead: LeadRow, services: string[]): string {
  const serviceList = services.map((s) => `- ${s}`).join('\n')
  return `Sen bir satış kalite kontrol uzmanısın. Şirketin sunduğu hizmetler:
${serviceList}

Aşağıdaki lead CRM'de "Uygun Bulunmadı" olarak kapatılmış. Görüşme notlarını ve mevcut bilgileri analiz ederek bu kararın doğru olup olmadığını değerlendir.

--- LEAD BİLGİLERİ ---
Başvuru Kampanyası: ${lead['Başvuru Kampanyası'] || '—'}
Hesap Tipi: ${lead['Hesap Tipi'] || '—'}
Durum Detayı: ${lead['Durum Detayı'] || '—'}
Olumsuzluk Nedeni: ${lead['Olumsuzluk Nedeni'] || '—'}
Son Aktivite Başlığı: ${lead['Son Aktivite Başlığı'] || '—'}
Satışçı Notu: "${lead['Son Aktivite Açıklaması'] || '—'}"
---

KARAR KRİTERLERİ:

"Yeniden Değerlendir" → Notlarda gerçek bir ihtiyaç veya ilgi sinyali var, hizmetlerimizden biriyle örtüşüyor, lead yanlış etiketlenmiş olabilir. Örnek: "şu an bütçe yok ama ileri dönemde düşünebiliriz", "rakibi kullanıyor ama memnun değil".

"Yanlış Kayıt" → Kayıt gerçek bir satış fırsatı değil. Şunlardan biri geçerliyse seç:
- Not çok kısa/anlamsız (tek kelime, "test", ".", "-", boş, sadece bir isim)
- Yanlışlıkla oluşturulmuş gibi görünüyor (tekrar kayıt, çift giriş vb.)
- Bireysel kişi, şirket değil (apartman yöneticisi değil, bireysel ev sahibi vb.)
- Faaliyet alanı hizmetlerimizle hiç ilgisiz (restoran, butik, klinik vb.)
- Genel lead kalitesi çok düşük, hiç somut bilgi yok

"Belirsiz" → Not var ama ihtiyacı anlamak için bilgi yetersiz. Takip gerektirebilir.

"Check Pass" → Olumsuzluk kararı doğru ve net. Gerçek bir ihtiyaç yok, hizmetlerimizle örtüşme yok, lead kaliteli ama bize uygun değil. Aksiyon gerekmez.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir şey yazma:
{
  "suggestedStatus": "Yeniden Değerlendir" | "Yanlış Kayıt" | "Belirsiz" | "Check Pass",
  "confidence": "Yüksek" | "Orta" | "Düşük",
  "reason": "max 2 cümle, Türkçe açıklama",
  "matchedServices": ["eşleşen hizmet adı varsa, yoksa boş array"]
}`
}
