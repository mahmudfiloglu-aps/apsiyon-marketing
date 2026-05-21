'use client'

import { useState } from 'react'
import type { AnalyzedLead } from '@/types/lead'

const STATUS_ICONS: Record<string, string> = {
  'Yeniden Değerlendir': '🟢',
  'Onayla Olumsuz': '🔴',
  Belirsiz: '🟡',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  Yüksek: 'text-green-700 bg-green-50',
  Orta: 'text-yellow-700 bg-yellow-50',
  Düşük: 'text-gray-600 bg-gray-100',
}

interface ResultsTableProps {
  leads: AnalyzedLead[]
}

export default function ResultsTable({ leads }: ResultsTableProps) {
  const [filter, setFilter] = useState<string>('Tümü')
  const [search, setSearch] = useState('')

  const filtered = leads.filter(({ lead, analysisResult }) => {
    const status = analysisResult?.suggestedStatus || ''
    const matchFilter = filter === 'Tümü' || status === filter
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
      lead['İlgili Kişi']?.toLowerCase().includes(q) ||
      lead['Hesap Adı']?.toLowerCase().includes(q) ||
      lead['Satış Temsilcisi']?.toLowerCase().includes(q)
    return matchFilter && matchSearch
  })

  const counts = {
    'Yeniden Değerlendir': leads.filter(
      (l) => l.analysisResult?.suggestedStatus === 'Yeniden Değerlendir'
    ).length,
    'Onayla Olumsuz': leads.filter(
      (l) => l.analysisResult?.suggestedStatus === 'Onayla Olumsuz'
    ).length,
    Belirsiz: leads.filter(
      (l) => l.analysisResult?.suggestedStatus === 'Belirsiz'
    ).length,
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {counts['Yeniden Değerlendir']}
          </div>
          <div className="text-sm text-green-600">🟢 Yeniden Değerlendir</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-700">
            {counts['Onayla Olumsuz']}
          </div>
          <div className="text-sm text-red-600">🔴 Onayla Olumsuz</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">
            {counts['Belirsiz']}
          </div>
          <div className="text-sm text-yellow-600">🟡 Belirsiz</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="İsim, firma, temsilci ara..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {['Tümü', 'Yeniden Değerlendir', 'Onayla Olumsuz', 'Belirsiz'].map(
          (opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                filter === opt
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt === 'Tümü' ? `Tümü (${leads.length})` : opt}
            </button>
          )
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">İlgili Kişi</th>
              <th className="px-4 py-3 text-left">Hesap Adı</th>
              <th className="px-4 py-3 text-left">Durum Detayı</th>
              <th className="px-4 py-3 text-left">Satışçı Notu</th>
              <th className="px-4 py-3 text-left">AI Öneri</th>
              <th className="px-4 py-3 text-left">Güven</th>
              <th className="px-4 py-3 text-left">Açıklama</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(({ lead, analysisResult, analysisError }, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {lead['İlgili Kişi'] || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lead['Hesap Adı'] || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lead['Durum Detayı'] || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-xs">
                  <span
                    className="line-clamp-2"
                    title={lead['Son Aktivite Açıklaması']}
                  >
                    {lead['Son Aktivite Açıklaması']?.slice(0, 80) || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {analysisResult ? (
                    <span className="font-medium">
                      {STATUS_ICONS[analysisResult.suggestedStatus]}{' '}
                      {analysisResult.suggestedStatus}
                    </span>
                  ) : analysisError ? (
                    <span className="text-red-500 text-xs">Hata</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {analysisResult?.confidence && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        CONFIDENCE_COLORS[analysisResult.confidence]
                      }`}
                    >
                      {analysisResult.confidence}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">
                  <span className="line-clamp-2" title={analysisResult?.reason}>
                    {analysisResult?.reason || analysisError || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            Sonuç bulunamadı.
          </div>
        )}
      </div>
    </div>
  )
}
