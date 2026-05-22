'use client'

import { useMemo, useState } from 'react'
import type { AnalyzedLead } from '@/types/lead'

interface Props {
  leads: AnalyzedLead[]
  decisions: Record<string, 'confirmed' | 'rejected'>
}

export default function EmailComposer({ leads, decisions }: Props) {
  const [recipientName, setRecipientName] = useState('')
  const [copied, setCopied] = useState(false)

  const confirmedLeads = useMemo(
    () => leads.filter(({ lead }) => decisions[lead['ID']] === 'confirmed'),
    [leads, decisions]
  )

  const decidedCount = Object.keys(decisions).length

  const emailBody = useMemo(() => {
    const name = recipientName.trim() || '[İsim]'
    const date = new Date().toLocaleDateString('tr-TR')

    const lines = confirmedLeads.map(({ lead, analysisResult }) =>
      [
        `• CRM ID: ${lead['ID']}`,
        `  Kişi: ${lead['İlgili Kişi']} — ${lead['Hesap Adı']} (${lead['Şehir'] || '—'})`,
        `  Mevcut Durum Detayı: ${lead['Durum Detayı']}`,
        `  Satış Temsilcisi: ${lead['Satış Temsilcisi'] || '—'}`,
        `  AI Gerekçe: ${analysisResult?.reason || '—'}`,
        `  Eşleşen Hizmet: ${analysisResult?.matchedServices?.join(', ') || '—'}`,
        `  Yapılacak: "Durumu" alanını "Uygun Bulunmadı"dan "Aktif"e alın ve satış ekibine aktarın.`,
      ].join('\n')
    )

    return `Merhaba ${name},

${date} tarihinde yapılan lead analizi sonucunda aşağıdaki kayıtların Dynamics 365 CRM'de güncellenmesi gerektiği tespit edilmiştir.

━━━━━━━━━━━━━━━━━━━━━━━━
GÜNCELLENMESİ GEREKEN LEAD'LER (${confirmedLeads.length} kayıt)
━━━━━━━━━━━━━━━━━━━━━━━━

${lines.length > 0 ? lines.join('\n\n') : 'Henüz onaylanmış lead bulunmamaktadır.'}

━━━━━━━━━━━━━━━━━━━━━━━━
ÖZET
• Toplam incelenen: ${leads.length} lead
• AI doğru (güncellenecek): ${confirmedLeads.length} lead
• AI hatalı (değişiklik yok): ${leads.filter(({ lead }) => decisions[lead['ID']] === 'rejected').length} lead
• Henüz değerlendirilmedi: ${leads.length - decidedCount} lead

Saygılarımla`
  }, [recipientName, confirmedLeads, leads, decisions, decidedCount])

  const handleCopy = () => {
    navigator.clipboard.writeText(emailBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (decidedCount === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">📧 Mail Oluştur</h2>
      <p className="text-sm text-gray-500 mb-5">
        {confirmedLeads.length} lead CRM'de güncelleme gerektirecek.
      </p>

      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Alıcı Adı
        </label>
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="Örn: Ahmet Bey"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-gray-50 rounded-xl p-4 font-mono text-xs text-gray-700 whitespace-pre-wrap max-h-96 overflow-auto mb-4 border border-gray-200 leading-relaxed">
        {emailBody}
      </div>

      <button
        onClick={handleCopy}
        className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {copied ? '✓ Kopyalandı!' : '📋 Panoya Kopyala'}
      </button>
    </div>
  )
}
