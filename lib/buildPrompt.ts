import type { LeadRow } from '@/types/lead'

export function buildPrompt(lead: LeadRow, services: string[]): string {
  const serviceList = services.map((s) => `- ${s}`).join('\n')
  return `Sen bir satış kalite kontrol uzmanısın. Şirketin sunduğu hizmetler:
${serviceList}

Aşağıdaki lead CRM'de "Uygun Bulunmadı" olarak kapatılmış. Satışçının notunu ve durum bilgilerini analiz ederek bu kararın doğru olup olmadığını değerlendir.

--- LEAD BİLGİLERİ ---
Hesap Tipi: ${lead['Hesap Tipi'] || '—'}
Durum Detayı: ${lead['Durum Detayı'] || '—'}
Olumsuzluk Nedeni: ${lead['Olumsuzluk Nedeni'] || '—'}
Son Aktivite Başlığı: ${lead['Son Aktivite Başlığı'] || '—'}
Satışçı Notu: "${lead['Son Aktivite Açıklaması'] || '—'}"
---

ÖNEMLİ KURALLAR:
- Kampanya kaynağı (başvuru kampanyası) bir değerlendirme kriteri DEĞİLDİR. Tamamen görmezden gel.
- Karar sadece satışçının notuna, durum detayına ve hesap tipine dayalı olmalıdır.
- Satışçı notunda "yanlış kayıt", "test", "hatalı giriş" gibi ifadeler varsa satışçının kendi kararına güven, "Yanlış Kayıt" seç.
- Site sakini (daire sahibi, kiracı, kat maliki) olan kişiler olumsuz değildir — yöneticiye ulaşmak için bir kanal olabilirler. Bu tür leadleri otomatik olarak çıkarma.

KARAR KRİTERLERİ:

"Yeniden Değerlendir" → Notlarda gerçek bir ihtiyaç, ilgi sinyali veya gelecek dönem fırsatı var. Örnek: "şu an bütçe yok ama ileri dönemde", "rakibi kullanıyor ama memnun değil", "yöneticiye bağlayacak".

"Yanlış Kayıt" → Satışçı kendisi yanlış/test/hatalı kayıt demiş; veya lead açıkça bir satış fırsatı değil (bireysel kişi, alakasız sektör, çift kayıt).

"Yetersiz Not" → Satışçının notu çok kısa veya anlamsız (tek kelime, sadece isim, "—", boş, "aradım", "mesaj bıraktım" gibi) — mevcut bilgiyle doğru karar vermek imkânsız.

"Belirsiz" → Not var, okunabilir ama ihtiyacın hizmetlerimizle örtüşüp örtüşmediği net değil.

"Check Pass" → Olumsuzluk kararı doğru ve gerekçeli. Gerçek bir ihtiyaç yok, hizmetlerimizle örtüşme yok. Aksiyon gerekmez.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir şey yazma:
{
  "suggestedStatus": "Yeniden Değerlendir" | "Yanlış Kayıt" | "Yetersiz Not" | "Belirsiz" | "Check Pass",
  "confidence": "Yüksek" | "Orta" | "Düşük",
  "reason": "max 2 cümle, Türkçe açıklama",
  "matchedServices": ["eşleşen hizmet adı varsa, yoksa boş array"]
}`
}
