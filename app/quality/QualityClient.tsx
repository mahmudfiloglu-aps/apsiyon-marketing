'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { parseLeadsFile } from '@/lib/parseLeads'
import type { LeadRow } from '@/types/lead'
import type { QualityResult } from '@/app/api/quality-analyze/route'

const DEFAULT_SERVICES = [
  'Apsiyon Site Yönetim Yazılımı',
  'Plaka Tanıma Sistemi (PTS)',
  'QR Kod Geçiş Sistemi',
  'Kartlı Geçiş Sistemi',
  'Kazan Otomasyon Sistemi',
  'ADA Dijital Asistan',
  'Tur Kontrol Sistemi',
  'Saha Mobil Uygulaması',
]

const TIER_CONFIG = {
  'Sıcak':    { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', icon: '🔥' },
  'İlgili':   { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', icon: '💛' },
  'Soğuk':    { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',   icon: '🧊' },
  'Uygunsuz': { bg: 'bg-gray-50 border-gray-200',     text: 'text-gray-600',   badge: 'bg-gray-100 text-gray-600',   icon: '❌' },
}

const SCORE_COLOR = (s: number) =>
  s >= 8 ? 'text-green-700 bg-green-100' :
  s >= 6 ? 'text-blue-700 bg-blue-100' :
  s >= 4 ? 'text-yellow-700 bg-yellow-100' :
  'text-red-700 bg-red-100'

interface Row {
  lead: LeadRow
  result?: QualityResult
  error?: string
}

type SortKey = 'qualityScore' | 'tier' | 'name' | 'company' | 'rep' | 'campaign'
type SortDir = 'asc' | 'desc'

export default function QualityClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<'upload' | 'analyzing' | 'done'>('upload')
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('qualityScore')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const savedIdRef = useRef<string | null>(null)

  useEffect(() => {
    const historyId = searchParams.get('id')
    if (!historyId) return
    setLoading(true)
    fetch(`/api/quality-analyses/${historyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.analysis?.results) {
          setRows(data.analysis.results as Row[])
          setFileName(data.analysis.file_name)
          savedIdRef.current = historyId
          setPhase('done')
        } else {
          router.replace('/quality')
        }
      })
      .catch(() => router.replace('/quality'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFile = async (file: File) => {
    setError('')
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      setError('Sadece .xlsx veya .csv dosyası desteklenir.')
      return
    }
    const buffer = await file.arrayBuffer()
    try {
      const { allRows } = parseLeadsFile(buffer)
      setRows(allRows.map((lead) => ({ lead })))
      setFileName(file.name)
      setProgress({ done: 0, total: allRows.length })
    } catch {
      setError('Dosya okunamadı.')
    }
  }

  const startAnalysis = async () => {
    if (!rows.length) return
    setPhase('analyzing')
    setProgress({ done: 0, total: rows.length })

    const abort = new AbortController()
    abortRef.current = abort
    const accumulated = [...rows]
    const CHUNK = 20

    try {
      const leads = rows.map((r) => r.lead)
      for (let i = 0; i < leads.length; i += CHUNK) {
        if (abort.signal.aborted) break
        const chunk = leads.slice(i, i + CHUNK)
        const res = await fetch('/api/quality-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: chunk, services: DEFAULT_SERVICES }),
          signal: abort.signal,
        })
        if (!res.ok) throw new Error('API hatası')

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n'); buf = lines.pop()!
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const { id, result, error: err } = JSON.parse(line) as { id: string; result?: QualityResult; error?: string }
              const idx = accumulated.findIndex((r) => r.lead['ID'] === id)
              if (idx !== -1) {
                accumulated[idx] = { ...accumulated[idx], ...(result ? { result } : { error: err }) }
              }
              setRows([...accumulated])
              setProgress((p) => ({ ...p, done: p.done + 1 }))
            } catch {}
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    }

    setPhase('done')

    // Save to DB
    const id = savedIdRef.current ?? Date.now().toString()
    savedIdRef.current = id
    fetch('/api/quality-analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fileName, totalCount: accumulated.length, results: accumulated }),
    }).then(() => {
      window.dispatchEvent(new Event('qualityHistoryUpdated'))
      router.replace(`/quality?id=${id}`)
    }).catch(() => {})
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const TIER_ORDER = { 'Sıcak': 0, 'İlgili': 1, 'Soğuk': 2, 'Uygunsuz': 3 }

  const sorted = [...rows].sort((a, b) => {
    const mult = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'qualityScore') return ((a.result?.qualityScore ?? -1) - (b.result?.qualityScore ?? -1)) * mult
    if (sortKey === 'tier') return ((TIER_ORDER[a.result?.tier ?? 'Uygunsuz'] ?? 99) - (TIER_ORDER[b.result?.tier ?? 'Uygunsuz'] ?? 99)) * mult
    if (sortKey === 'name') return (a.lead['İlgili Kişi'] || '').localeCompare(b.lead['İlgili Kişi'] || '') * mult
    if (sortKey === 'company') return (a.lead['Hesap Adı'] || '').localeCompare(b.lead['Hesap Adı'] || '') * mult
    if (sortKey === 'rep') return (a.lead['Satış Temsilcisi'] || '').localeCompare(b.lead['Satış Temsilcisi'] || '') * mult
    if (sortKey === 'campaign') return (a.lead['Başvuru Kampanyası'] || '').localeCompare(b.lead['Başvuru Kampanyası'] || '') * mult
    return 0
  })

  const counts = {
    'Sıcak':    rows.filter((r) => r.result?.tier === 'Sıcak').length,
    'İlgili':   rows.filter((r) => r.result?.tier === 'İlgili').length,
    'Soğuk':    rows.filter((r) => r.result?.tier === 'Soğuk').length,
    'Uygunsuz': rows.filter((r) => r.result?.tier === 'Uygunsuz').length,
  }

  const exportCSV = () => {
    const headers = ['İsim', 'Şirket', 'Şehir', 'Kampanya', 'Temsilci', 'Puan', 'Tier', 'Gerekçe']
    const csvRows = sorted.map((r) => [
      r.lead['İlgili Kişi'] || '',
      r.lead['Hesap Adı'] || '',
      r.lead['Şehir'] || '',
      r.lead['Başvuru Kampanyası'] || '',
      r.lead['Satış Temsilcisi'] || '',
      r.result?.qualityScore ?? '',
      r.result?.tier ?? '',
      (r.result?.reason || r.error || '').replace(/"/g, '""'),
    ].map((v) => `"${v}"`).join(','))
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'lead-kalite.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => handleSort(k)} className="flex items-center gap-1 hover:text-gray-700 transition-colors">
      {label}
      {sortKey === k && <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )

  if (loading) {
    return <div className="flex items-center justify-center h-full"><p className="text-gray-400">Yükleniyor...</p></div>
  }

  // ── Upload phase ────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="py-10 px-6 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Lead Kalite Analizi</h1>
          <p className="text-gray-500">Tüm leadlerin kalitesini ve potansiyelini ölç — durum filtresi yok</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors border-gray-300 hover:border-blue-400 hover:bg-gray-50"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            <div className="text-4xl mb-3">📂</div>
            {rows.length > 0 ? (
              <p className="text-sm font-medium text-green-700">✓ {fileName} — {rows.length} lead yüklendi</p>
            ) : (
              <>
                <p className="font-medium text-gray-700">Excel veya CSV dosyasını sürükleyin veya seçin</p>
                <p className="text-sm text-gray-400 mt-1">Tüm statüler analiz edilir</p>
              </>
            )}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>

          <button
            onClick={startAnalysis}
            disabled={!rows.length}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rows.length > 0 ? `${rows.length} Lead'i Analiz Et` : 'Önce Dosya Yükleyin'}
          </button>
        </div>
      </div>
    )
  }

  // ── Analysis + Results phase ────────────────────────────
  return (
    <div className="py-8 px-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Kalite Analizi</h1>
          <p className="text-sm text-gray-500 mt-1">{fileName} · {rows.length} lead</p>
        </div>
        <div className="flex gap-2">
          {phase === 'analyzing' && (
            <button onClick={() => abortRef.current?.abort()}
              className="border border-red-300 text-red-600 px-4 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors">
              Durdur
            </button>
          )}
          {phase === 'done' && (
            <button onClick={exportCSV}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">
              ⬇ CSV İndir
            </button>
          )}
          <button onClick={() => { setPhase('upload'); setRows([]); setFileName(''); savedIdRef.current = null; router.push('/quality') }}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            ← Yeni Analiz
          </button>
        </div>
      </div>

      {phase === 'analyzing' && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Analiz ediliyor...</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {/* Tier summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(Object.keys(TIER_CONFIG) as (keyof typeof TIER_CONFIG)[]).map((tier) => {
          const cfg = TIER_CONFIG[tier]
          return (
            <div key={tier} className={`border rounded-xl p-4 text-center ${cfg.bg}`}>
              <div className={`text-2xl font-bold ${cfg.text}`}>{counts[tier]}</div>
              <div className={`text-xs mt-1 font-medium ${cfg.text}`}>{cfg.icon} {tier}</div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {/* Sortable table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 font-medium"><SortBtn k="name" label="İsim" /></th>
                <th className="px-4 py-3 font-medium"><SortBtn k="company" label="Şirket" /></th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Şehir</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell"><SortBtn k="campaign" label="Kampanya" /></th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell"><SortBtn k="rep" label="Temsilci" /></th>
                <th className="px-4 py-3 font-medium text-right"><SortBtn k="qualityScore" label="Puan" /></th>
                <th className="px-4 py-3 font-medium"><SortBtn k="tier" label="Tier" /></th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Gerekçe</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                    {row.lead['İlgili Kişi'] || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">
                    {row.lead['Hesap Adı'] || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">
                    {row.lead['Şehir'] || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden lg:table-cell max-w-[120px] truncate">
                    {row.lead['Başvuru Kampanyası'] || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden lg:table-cell">
                    {row.lead['Satış Temsilcisi'] || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.result ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SCORE_COLOR(row.result.qualityScore)}`}>
                        ★ {row.result.qualityScore}
                      </span>
                    ) : row.error ? (
                      <span className="text-xs text-red-400">hata</span>
                    ) : (
                      <span className="text-xs text-gray-300">...</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.result?.tier && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_CONFIG[row.result.tier].badge}`}>
                        {TIER_CONFIG[row.result.tier].icon} {row.result.tier}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs hidden xl:table-cell max-w-[280px]"
                    title={row.result?.reason ?? row.error ?? ''}>
                    {(row.result?.reason ?? row.error ?? '').slice(0, 80)}
                    {(row.result?.reason ?? '').length > 80 ? '…' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Henüz sonuç yok.</div>
        )}
      </div>
    </div>
  )
}
