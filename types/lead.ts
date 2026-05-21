export type LeadRow = {
  ID: string
  'İlgili Kişi': string
  'Hesap Adı': string
  'Satış Temsilcisi': string
  Şehir: string
  'Kayıt Tipi': string
  Durumu: string
  'Durum Detayı': string
  'Olumsuzluk Nedeni': string
  'Son Aktivite Açıklaması': string
  'Son Aktivite Başlığı': string
  'Başvuru Kampanyası': string
  'Hesap Tipi': string
  [key: string]: string
}

export type AnalysisResult = {
  leadId: string
  originalStatus: 'Uygun Bulunmadı'
  originalDetail: string
  suggestedStatus: 'Yeniden Değerlendir' | 'Onayla Olumsuz' | 'Belirsiz'
  confidence: 'Yüksek' | 'Orta' | 'Düşük'
  reason: string
  matchedServices: string[]
}

export type AnalyzedLead = {
  lead: LeadRow
  analysisResult?: AnalysisResult
  analysisError?: string
}
