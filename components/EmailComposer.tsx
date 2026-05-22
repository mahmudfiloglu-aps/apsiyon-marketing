'use client'

import { useMemo, useState } from 'react'
import type { AnalyzedLead } from '@/types/lead'

interface Props {
  leads: AnalyzedLead[]
  decisions: Record<string, 'confirmed' | 'rejected'>
}

export default function EmailComposer({ leads, decisions }: Props) {
  const [open, setOpen] = useState(false)
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

  return (
    <>
      {/* Sabit buton — sağ alt */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-2xl shadow-lg hover:bg-blue-700 transition-colors text-sm font-medium"
      >
        📧 Mail Oluştur
        {confirmedLeads.length > 0 && (
          <span className="bg-white text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {confirmedLeads.length}
          </span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">📧 Mail Oluştur</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {decidedCount === 0
                    ? 'Kartlardaki "✓ AI Doğru" butonuna basarak lead\'leri onaylayın'
                    : `${confirmedLeads.length} lead güncellenecek · ${leads.length - decidedCount} kart henüz değerlendirilmedi`}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 flex-1 overflow-auto">
              {decidedCount === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-4xl mb-3">👆</div>
                  <p className="text-sm">Sonuç kartlarında <strong>"✓ AI Doğru"</strong> butonuna basarak<br />CRM'de güncellenecek lead'leri işaretleyin.</p>
                </div>
              ) : (
                <>
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

                  <div className="bg-gray-50 rounded-xl p-4 font-mono text-xs text-gray-700 whitespace-pre-wrap max-h-72 overflow-auto border border-gray-200 leading-relaxed">
                    {emailBody}
                  </div>
                </>
              )}
            </div>

            {decidedCount > 0 && (
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={handleCopy}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? '✓ Kopyalandı!' : '📋 Panoya Kopyala'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
