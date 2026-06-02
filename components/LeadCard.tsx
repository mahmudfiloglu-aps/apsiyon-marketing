'use client'

import { useState } from 'react'
import type { AnalyzedLead, SuggestedStatus } from '@/types/lead'

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

const ALL_STATUSES: SuggestedStatus[] = [
  'Yeniden Değerlendir', 'Yanlış Kayıt', 'Yetersiz Not', 'Belirsiz', 'Check Pass',
]

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? 'text-green-700 bg-green-100' :
    score >= 6 ? 'text-blue-700 bg-blue-100' :
    score >= 4 ? 'text-yellow-700 bg-yellow-100' :
    'text-red-700 bg-red-100'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`} title="Lead kalite puanı (1-10)">
      ★ {score}/10
    </span>
  )
}

interface CompanyRecord {
  analysisId: string
  fileName: string
  status: string
  date: string
}

interface Props {
  item: AnalyzedLead
  override?: SuggestedStatus
  decision?: 'confirmed' | 'rejected'
  decisionNote?: string
  isReanalyzing?: boolean
  companyHistory?: CompanyRecord[]
  onConfirm: () => void
  onReject: () => void
  onOverride: (status: SuggestedStatus | undefined) => void
  onReanalyze: () => void
  onDecisionNote: (note: string) => void
}

export default function LeadCard({ item, override, decision, decisionNote, isReanalyzing, companyHistory = [], onConfirm, onReject, onOverride, onReanalyze, onDecisionNote }: Props) {
  const { lead, analysisResult, analysisError } = item
  const [showMove, setShowMove] = useState(false)

  const effectiveStatus = override ?? analysisResult?.suggestedStatus
  const cardBg = effectiveStatus ? STATUS_BG[effectiveStatus] : 'bg-gray-50 border-gray-200'
  const isOverridden = !!override

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
        {effectiveStatus && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1.5">
              {isOverridden && (
                <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                  Manuel
                </span>
              )}
              <span className="text-sm font-medium whitespace-nowrap">
                {STATUS_ICON[effectiveStatus]} {effectiveStatus}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {analysisResult?.confidence && !isOverridden && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONF_STYLE[analysisResult.confidence]}`}>
                  {analysisResult.confidence}
                </span>
              )}
              {analysisResult?.qualityScore != null && (
                <QualityBadge score={analysisResult.qualityScore} />
              )}
            </div>
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

      {/* Company history warning */}
      {companyHistory.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs font-medium text-amber-700 mb-1">
            ⚠ Bu şirket daha önce {companyHistory.length} analizde görüldü
          </p>
          <div className="space-y-0.5">
            {companyHistory.slice(0, 3).map((h, i) => (
              <p key={i} className="text-xs text-amber-600">
                {new Date(h.date).toLocaleDateString('tr-TR')} · {h.fileName} ·{' '}
                <span className="font-medium">{h.status}</span>
              </p>
            ))}
            {companyHistory.length > 3 && (
              <p className="text-xs text-amber-500">+{companyHistory.length - 3} daha...</p>
            )}
          </div>
        </div>
      )}

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
        <div className="bg-white/70 rounded-lg px-3 py-2 mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400 font-medium">
              {isOverridden ? `AI Analizi (orijinal: ${analysisResult.suggestedStatus})` : 'AI Analizi'}
            </p>
          </div>
          <p className="text-sm text-gray-700">{analysisResult.reason}</p>
          {analysisResult.matchedServices.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {analysisResult.matchedServices.map((s, i) => (
                <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {analysisError && (
        <p className="text-xs text-red-500 mb-3 bg-red-50 px-2 py-1 rounded">
          Analiz hatası: {analysisError}
        </p>
      )}

      {/* Move to category */}
      {analysisResult && (
        <div className="mb-3">
          {showMove ? (
            <div className="bg-white/80 rounded-xl p-2 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1.5 px-1">Kategoriye taşı:</p>
              <div className="flex flex-wrap gap-1">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { onOverride(s === analysisResult.suggestedStatus && !isOverridden ? undefined : s); setShowMove(false) }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      effectiveStatus === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {STATUS_ICON[s]} {s}
                  </button>
                ))}
                {isOverridden && (
                  <button
                    onClick={() => { onOverride(undefined); setShowMove(false) }}
                    className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                  >
                    ↩ AI kararına dön
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowMove(true)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
            >
              ↕ Kategoriyi değiştir
            </button>
          )}
        </div>
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
        {analysisResult && (
          <button
            onClick={onReanalyze}
            disabled={isReanalyzing}
            title="Daha derin analiz — AI'ya önceki kararı da göndererek yeniden değerlendirt"
            className="px-3 py-2 rounded-xl text-sm font-medium transition-colors bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isReanalyzing ? '⏳' : '🔄'}
          </button>
        )}
      </div>
      {decision === 'rejected' && (
        <div className="mt-2">
          <textarea
            placeholder="Neden hatalı? (isteğe bağlı)"
            value={decisionNote ?? ''}
            onChange={(e) => onDecisionNote(e.target.value)}
            className="w-full text-xs border border-red-200 rounded-lg px-2 py-1.5 bg-white/80 focus:outline-none focus:ring-1 focus:ring-red-300 resize-none"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}
