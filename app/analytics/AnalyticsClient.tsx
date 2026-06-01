'use client'

import { useEffect, useState } from 'react'

interface RepRow {
  rep: string
  total: number
  reeval: number
  wrong_record: number
  insufficient: number
  unclear: number
  check_pass: number
  avg_quality: number | null
}

interface CampaignRow {
  campaign: string
  total: number
  reeval: number
  wrong_record: number
  check_pass: number
  avg_quality: number | null
}

interface AccuracyRow {
  ai_status: string
  user_decision: string
  count: number
}

interface AnalyticsData {
  reps: RepRow[]
  campaigns: CampaignRow[]
  accuracy: AccuracyRow[]
}

function QualityDot({ score }: { score: number | null }) {
  if (score == null) return <span className="text-gray-300">—</span>
  const color =
    score >= 8 ? 'text-green-600' :
    score >= 6 ? 'text-blue-600' :
    score >= 4 ? 'text-yellow-600' :
    'text-red-500'
  return <span className={`font-semibold ${color}`}>★ {score}</span>
}

function AccuracySection({ rows }: { rows: AccuracyRow[] }) {
  const totalConfirmed = rows.filter((r) => r.user_decision === 'confirmed').reduce((s, r) => s + r.count, 0)
  const totalRejected = rows.filter((r) => r.user_decision === 'rejected').reduce((s, r) => s + r.count, 0)
  const total = totalConfirmed + totalRejected

  // Per-category breakdown
  const categories = [...new Set(rows.map((r) => r.ai_status))]
  const byCategory = categories.map((cat) => {
    const conf = rows.find((r) => r.ai_status === cat && r.user_decision === 'confirmed')?.count ?? 0
    const rej = rows.find((r) => r.ai_status === cat && r.user_decision === 'rejected')?.count ?? 0
    const tot = conf + rej
    return { cat, conf, rej, tot, pct: tot ? Math.round((conf / tot) * 100) : null }
  }).filter((r) => r.tot > 0).sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))

  if (!total) return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Doğruluk & Yanılma Paterni</h2>
      <p className="text-sm text-gray-400">Henüz değerlendirme kaydedilmedi. Sonuç sayfasında "AI Doğru / AI Hatalı" butonlarını kullanmaya başla.</p>
    </div>
  )

  const overallPct = Math.round((totalConfirmed / total) * 100)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">AI Doğruluk & Yanılma Paterni</h2>

      {/* Overall */}
      <div className="flex items-center gap-6">
        <div className="text-center shrink-0">
          <div className={`text-4xl font-bold ${overallPct >= 70 ? 'text-green-600' : overallPct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
            %{overallPct}
          </div>
          <div className="text-xs text-gray-500 mt-1">Genel Onay</div>
        </div>
        <div className="flex-1">
          <div className="flex gap-4 text-sm mb-2">
            <span className="text-green-700 font-medium">✓ {totalConfirmed} doğru</span>
            <span className="text-red-600 font-medium">✗ {totalRejected} hatalı</span>
            <span className="text-gray-400">{total} toplam</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
          </div>
        </div>
      </div>

      {/* Per-category pattern */}
      {byCategory.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Kategoriye Göre Doğruluk</p>
          <div className="space-y-2">
            {byCategory.map((row) => (
              <div key={row.cat} className="flex items-center gap-3">
                <div className="w-40 text-sm text-gray-700 truncate shrink-0">{row.cat}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 relative">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      (row.pct ?? 100) >= 70 ? 'bg-green-400' :
                      (row.pct ?? 100) >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${row.pct ?? 100}%` }}
                  />
                </div>
                <div className="w-24 text-right text-xs text-gray-500 shrink-0">
                  <span className={`font-semibold ${(row.pct ?? 100) >= 70 ? 'text-green-600' : (row.pct ?? 100) >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                    %{row.pct ?? '—'}
                  </span>
                  {' '}({row.rej} hata / {row.tot})
                </div>
              </div>
            ))}
          </div>
          {byCategory[0] && (byCategory[0].pct ?? 100) < 60 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                ⚠ "{byCategory[0].cat}" kararları en çok yanılıyor (%{byCategory[0].pct} doğruluk).
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Bu kategorideki {byCategory[0].rej} reddedilen karar otomatik olarak sonraki analizlerde AI'ya örnek olarak gösteriliyor.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => {
        if (!r.ok) throw new Error('Veri alınamadı')
        return r.json()
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-400">Yükleniyor...</div>
  if (error) return <div className="p-8 text-red-500">{error}</div>
  if (!data) return null

  return (
    <div className="py-8 px-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analitik Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Tüm analizlerin toplu görünümü</p>
      </div>

      <AccuracySection rows={data.accuracy} />

      {/* Satış Temsilcisi tablosu */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Satış Temsilcisi Performansı</h2>
        {data.reps.length === 0 ? (
          <p className="text-sm text-gray-400">Veri yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Temsilci</th>
                  <th className="pb-2 font-medium text-right">Toplam</th>
                  <th className="pb-2 font-medium text-right text-green-700">🟢 Yeniden</th>
                  <th className="pb-2 font-medium text-right text-orange-600">🗑️ Yanlış</th>
                  <th className="pb-2 font-medium text-right text-purple-600">📝 Yetersiz</th>
                  <th className="pb-2 font-medium text-right text-yellow-600">🟡 Belirsiz</th>
                  <th className="pb-2 font-medium text-right text-gray-500">✅ Pass</th>
                  <th className="pb-2 font-medium text-right">Ort. Kalite</th>
                </tr>
              </thead>
              <tbody>
                {data.reps.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 font-medium text-gray-900">{row.rep}</td>
                    <td className="py-2 text-right text-gray-600">{row.total}</td>
                    <td className="py-2 text-right font-semibold text-green-700">{row.reeval}</td>
                    <td className="py-2 text-right text-orange-600">{row.wrong_record}</td>
                    <td className="py-2 text-right text-purple-600">{row.insufficient}</td>
                    <td className="py-2 text-right text-yellow-600">{row.unclear}</td>
                    <td className="py-2 text-right text-gray-400">{row.check_pass}</td>
                    <td className="py-2 text-right"><QualityDot score={row.avg_quality} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kampanya tablosu */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Kampanya Analizi</h2>
        {data.campaigns.length === 0 ? (
          <p className="text-sm text-gray-400">Veri yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Kampanya</th>
                  <th className="pb-2 font-medium text-right">Toplam</th>
                  <th className="pb-2 font-medium text-right text-green-700">🟢 Yeniden</th>
                  <th className="pb-2 font-medium text-right text-orange-600">🗑️ Yanlış</th>
                  <th className="pb-2 font-medium text-right text-gray-500">✅ Pass</th>
                  <th className="pb-2 font-medium text-right">Ort. Kalite</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 font-medium text-gray-900">{row.campaign}</td>
                    <td className="py-2 text-right text-gray-600">{row.total}</td>
                    <td className="py-2 text-right font-semibold text-green-700">{row.reeval}</td>
                    <td className="py-2 text-right text-orange-600">{row.wrong_record}</td>
                    <td className="py-2 text-right text-gray-400">{row.check_pass}</td>
                    <td className="py-2 text-right"><QualityDot score={row.avg_quality} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
