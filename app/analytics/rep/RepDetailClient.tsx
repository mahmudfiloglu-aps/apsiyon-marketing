'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface RepLead {
  analysis_id: string
  file_name: string
  created_at: string
  lead: Record<string, string>
  analysis_result: {
    suggestedStatus?: string
    qualityScore?: number
    reason?: string
  } | null
}

const STATUS_COLOR: Record<string, string> = {
  'Yeniden Değerlendir': 'text-green-700 bg-green-50 border-green-200',
  'Yanlış Kayıt': 'text-orange-700 bg-orange-50 border-orange-200',
  'Yetersiz Not': 'text-purple-700 bg-purple-50 border-purple-200',
  'Belirsiz': 'text-yellow-700 bg-yellow-50 border-yellow-200',
  'Check Pass': 'text-gray-600 bg-gray-50 border-gray-200',
}

const STATUS_ICON: Record<string, string> = {
  'Yeniden Değerlendir': '🟢',
  'Yanlış Kayıt': '🗑️',
  'Yetersiz Not': '📝',
  'Belirsiz': '🟡',
  'Check Pass': '✅',
}

export default function RepDetailClient() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name') ?? ''
  const [leads, setLeads] = useState<RepLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) return
    fetch('/api/analytics/rep?name=' + encodeURIComponent(name))
      .then((r) => {
        if (!r.ok) throw new Error('Veri alınamadı')
        return r.json()
      })
      .then((d) => setLeads(d.leads ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) return <div className="p-8 text-gray-400">Yükleniyor...</div>
  if (error) return <div className="p-8 text-red-500">{error}</div>

  return (
    <div className="py-8 px-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/analytics" className="text-sm text-blue-600 hover:underline">
          ← Analitiğe Dön
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{name}</h1>
        <p className="text-sm text-gray-500 mt-1">{leads.length} lead</p>
      </div>

      {leads.length === 0 ? (
        <p className="text-gray-400">Bu temsilciye ait lead bulunamadı.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Şirket</th>
                  <th className="px-4 py-3 font-medium">Kampanya</th>
                  <th className="px-4 py-3 font-medium">AI Durumu</th>
                  <th className="px-4 py-3 font-medium text-right">Kalite</th>
                  <th className="px-4 py-3 font-medium">Dosya</th>
                  <th className="px-4 py-3 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((row, i) => {
                  const status = row.analysis_result?.suggestedStatus ?? ''
                  const quality = row.analysis_result?.qualityScore
                  const colorClass = STATUS_COLOR[status] ?? 'text-gray-600 bg-gray-50 border-gray-200'
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {row.lead?.['Hesap Adı'] || row.lead?.['İlgili Kişi'] || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {row.lead?.['Başvuru Kampanyası'] || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {status ? (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
                            {STATUS_ICON[status]} {status}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {quality != null ? (
                          <span className={`font-semibold text-xs ${quality >= 8 ? 'text-green-600' : quality >= 6 ? 'text-blue-600' : quality >= 4 ? 'text-yellow-600' : 'text-red-500'}`}>
                            ★ {quality}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs truncate max-w-[160px]">
                        {row.file_name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(row.created_at).toLocaleDateString('tr-TR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
