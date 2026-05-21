import type { LeadRow } from '@/types/lead'

export function buildPrompt(lead: LeadRow, services: string[]): string {
  const serviceList = services.map((s) => `- ${s}`).join('\n')
  return `Sen bir satış kalite kontrol uzmanısın. Şirketin sunduğu hizmetler:
${serviceList}

Aşağıdaki lead "Uygun Bulunmadı" olarak işaretlenmiş.

Başvuru Kampanyası: ${lead['Başvuru Kampanyası'] || '—'}
Son Aktivite Başlığı: ${lead['Son Aktivite Başlığı'] || '—'}
Satışçı Notu: "${lead['Son Aktivite Açıklaması'] || '—'}"
Durum Detayı: ${lead['Durum Detayı'] || '—'}
Hesap Tipi: ${lead['Hesap Tipi'] || '—'}

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
}`
}
