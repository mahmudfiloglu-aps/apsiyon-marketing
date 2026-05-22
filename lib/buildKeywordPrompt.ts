export function buildKeywordPrompt(terms: string[]): string {
  const termList = terms.map((t, i) => `${i + 1}. "${t}"`).join('\n')

  return `Sen Apsiyon şirketinin Google Ads uzmanısın. Apsiyon, apartman/site/rezidans yöneticilerine yönelik B2B SaaS + donanım platformudur.

APSIYON ÜRÜNLERİ VE HEDEF KİTLE:
- Site Yönetim Yazılımı → aidat takibi, muhasebe, kat maliki yönetimi
- Plaka Tanıma Sistemi → sitelerde otopark erişim kontrolü
- QR Kod Geçiş Sistemi → bina giriş/çıkış kontrolü
- Tur Kontrol Sistemi → güvenlik personeli tur takibi
- Kazan Otomasyon → merkezi ısıtma yönetimi
- Saha Mobil Uygulaması → saha personeli operasyon yönetimi

HEDEF KİTLE: Site yöneticisi, apartman yöneticisi, yönetim şirketi, kat malikleri kurulu.
COĞRAFYA: Türkiye, Türkçe konuşan kullanıcılar.

Aşağıdaki Google Ads arama terimlerini 3 kategoriye ayır:

"Alakalı" → Potansiyel müşterimiz bu terimi aramış olabilir. Ürünlerimizle veya hedef kitleyle örtüşüyor.
Örnekler: "site yönetim programı", "apartman aidat takibi", "plaka tanıma sistemi kiralama"

"Negatif" → Bu terimi arayanlar bizim müşterimiz değil, tıklama boşa gider.
Örnekler: "kiralık daire", "satılık arsa", "bireysel alarm sistemi", "araç plakası sorgula", "plaka sorgulama tc", "konut kredisi"

"İncelenmeli" → Belirsiz, ürünlerimizle bağlantılı olabilir ama emin değil.

ARAMA TERİMLERİ:
${termList}

Yanıtını SADECE şu JSON array formatında ver, başka hiçbir şey yazma:
[
  { "i": 1, "category": "Alakalı" | "Negatif" | "İncelenmeli" },
  { "i": 2, "category": "..." },
  ...
]`
}
