'use client'

import type { AnalyzedLead } from '@/types/lead'

const STATUS_BG: Record<string, string> = {
  'Yeniden Değerlendir': 'bg-green-50 border-green-200',
  'Yanlış Kayıt': 'bg-orange-50 border-orange-200',
  'Yetersiz Not': 'bg-purple-50 border-purple-200',
  Belirsiz: 'bg-yellow-50 border-yellow-200',
  'Check Pass': 'bg-gray-50 border-gray-200',
}

const STATUS_ICON: Record<string, string> = {
  'Yeniden Değerlendir': '🟢',
  'Yanlış Kayıt': '🗑️',
  'Yetersiz Not': '📝',
  Belirsiz: '🟡',
  'Check Pass': '✅',
}

const CONF_STYLE: Record<string, string> = {
  Yüksek: 'text-green-700 bg-green-100',
  Orta: 'text-yellow-700 bg-yellow-100',
  Düşük: 'text-gray-600 bg-gray-100',
}

interface Props {
  item: AnalyzedLead
  decision?: 'confirmed' | 'rejected'
  onConfirm: () => void
  onReject: () => void
}

export default function LeadCard({ item, decision, onConfirm, onReject }: Props) {
  const { lead, analysisResult, analysisError } = item
  const status = analysisResult?.suggestedStatus
  const cardBg = status ? STATUS_BG[status] : 'bg-gray-50 border-gray-200'

  return (
    <div
      className={`border rounded-2xl p-5 transition-all ${cardBg} ${
        decision === 'confirmed'
          ? 'ring-2 ring-green-400'
          : decision === 'rejected'
            ? 'ring-2 ring-red-400 opacity-60'
            : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">
            {lead['İlgili Kişi'] || '—'}
          </h3>
          <p className="text-sm text-gray-500">
            {lead['Hesap Adı'] || '—'} · {lead['Şehir'] || ''}
          </p>
        </div>
        {status && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-medium whitespace-nowrap">
              {STATUS_ICON[status]} {status}
            </span>
            {analysisResult?.confidence && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONF_STYLE[analysisResult.confidence]}`}
              >
                {analysisResult.confidence}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-1.5 mb-3 text-xs text-gray-500">
        <div>
          <span className="font-medium text-gray-600">Kayıt Tipi: </span>
          {lead['Kayıt Tipi'] || lead['Hesap Tipi'] || '—'}
        </div>
        <div>
          <span className="font-medium text-gray-600">Temsilci: </span>
          {lead['Satış Temsilcisi'] || '—'}
        </div>
        <div>
          <span className="font-medium text-gray-600">Durum: </span>
          {lead['Durum Detayı'] || '—'}
        </div>
        <div>
          <span className="font-medium text-gray-600">Son Aktivite: </span>
          {lead['Son Aktivite Başlığı'] || '—'}
        </div>
        {lead['Başvuru Kampanyası'] && (
          <div className="col-span-2">
            <span className="font-medium text-gray-600">Kampanya: </span>
            <span className="text-blue-600">{lead['Başvuru Kampanyası']}</span>
          </div>
        )}
      </div>

      {/* Sales note */}
      {lead['Son Aktivite Açıklaması'] && (
        <div className="bg-white/70 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-gray-400 font-medium mb-1">Satışçı Notu</p>
          <p className="text-sm text-gray-700 line-clamp-3">
            {lead['Son Aktivite Açıklaması']}
          </p>
        </div>
      )}

      {/* AI result */}
      {analysisResult && (
        <div className="bg-white/70 rounded-lg px-3 py-2 mb-4">
          <p className="text-xs text-gray-400 font-medium mb-1">AI Analizi</p>
          <p className="text-sm text-gray-700">{analysisResult.reason}</p>
          {analysisResult.matchedServices.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {analysisResult.matchedServices.map((s, i) => (
                <span
                  key={i}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {analysisError && (
        <p className="text-xs text-red-500 mb-4 bg-red-50 px-2 py-1 rounded">
          Analiz hatası: {analysisError}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            decision === 'confirmed'
              ? 'bg-green-500 text-white'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          ✓ AI Doğru
        </button>
        <button
          onClick={onReject}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            decision === 'rejected'
              ? 'bg-red-500 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          ✗ AI Hatalı
        </button>
      </div>
    </div>
  )
}
