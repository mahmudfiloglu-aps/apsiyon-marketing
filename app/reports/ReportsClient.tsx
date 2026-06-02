'use client'

import { useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'

interface ReportTab {
  id: string
  tabName: string
  source: 'google' | 'meta'
  fileName: string
  data: Record<string, string>[]
  created_at?: string
}

function generateId() {
  return crypto.randomUUID()
}

function detectSource(headers: string[]): 'google' | 'meta' {
  const h = headers.join(' ').toLowerCase()
  if (h.includes('impressions') && (h.includes('keyword') || h.includes('search term') || h.includes('arama'))) return 'google'
  if (h.includes('reach') || h.includes('frequency') || h.includes('erişim')) return 'meta'
  return 'google'
}

// Normalize numeric strings — remove currency symbols, spaces, commas used as thousand separators
function num(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(v.replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: decimals })
}

function fmtCurrency(n: number) {
  return '₺' + fmt(n, 2)
}

// ── Google Ads summary ────────────────────────────────

interface GoogleSummary {
  totalImpressions: number
  totalClicks: number
  totalCost: number
  totalConversions: number
  avgCTR: number
  avgCPC: number
  avgCPA: number
  rows: Record<string, string>[]
}

function parseGoogleSummary(data: Record<string, string>[]): GoogleSummary {
  let totalImpressions = 0, totalClicks = 0, totalCost = 0, totalConversions = 0
  for (const row of data) {
    const imp = num(row['Impressions'] ?? row['Gösterim'] ?? row['impressions'])
    const cli = num(row['Clicks'] ?? row['Tıklama'] ?? row['clicks'])
    const cost = num(row['Cost'] ?? row['Maliyet'] ?? row['Spend'] ?? row['cost'])
    const conv = num(row['Conversions'] ?? row['Dönüşüm'] ?? row['conversions'])
    totalImpressions += imp
    totalClicks += cli
    totalCost += cost
    totalConversions += conv
  }
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCPC = totalClicks > 0 ? totalCost / totalClicks : 0
  const avgCPA = totalConversions > 0 ? totalCost / totalConversions : 0
  return { totalImpressions, totalClicks, totalCost, totalConversions, avgCTR, avgCPC, avgCPA, rows: data }
}

// ── Meta Ads summary ──────────────────────────────────

interface MetaSummary {
  totalReach: number
  totalImpressions: number
  totalSpend: number
  totalClicks: number
  totalResults: number
  avgCPR: number
  avgCPC: number
  rows: Record<string, string>[]
}

function parseMetaSummary(data: Record<string, string>[]): MetaSummary {
  let totalReach = 0, totalImpressions = 0, totalSpend = 0, totalClicks = 0, totalResults = 0
  for (const row of data) {
    totalReach += num(row['Reach'] ?? row['Erişim'] ?? row['reach'])
    totalImpressions += num(row['Impressions'] ?? row['Gösterim'] ?? row['impressions'])
    totalSpend += num(row['Amount spent'] ?? row['Harcanan tutar'] ?? row['Spend'] ?? row['spend'])
    totalClicks += num(row['Link clicks'] ?? row['Bağlantı tıklamaları'] ?? row['Clicks'] ?? row['clicks'])
    totalResults += num(row['Results'] ?? row['Sonuçlar'] ?? row['results'])
  }
  const avgCPR = totalResults > 0 ? totalSpend / totalResults : 0
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0
  return { totalReach, totalImpressions, totalSpend, totalClicks, totalResults, avgCPR, avgCPC, rows: data }
}

// ── Column display helpers ────────────────────────────

const GOOGLE_DISPLAY_COLS = [
  'Campaign', 'Kampanya', 'Search term', 'Arama terimi',
  'Impressions', 'Gösterim', 'Clicks', 'Tıklama',
  'CTR', 'Cost', 'Maliyet', 'Conversions', 'Dönüşüm', 'Avg. CPC', 'Ort. TBM',
]

const META_DISPLAY_COLS = [
  'Campaign name', 'Kampanya adı', 'Ad Set Name', 'Reklam seti adı',
  'Reach', 'Erişim', 'Impressions', 'Gösterim',
  'Amount spent', 'Harcanan tutar', 'Link clicks', 'Bağlantı tıklamaları',
  'Results', 'Sonuçlar', 'Cost per result', 'Sonuç başı maliyet',
]

function pickDisplayCols(headers: string[], source: 'google' | 'meta') {
  const preferred = source === 'google' ? GOOGLE_DISPLAY_COLS : META_DISPLAY_COLS
  const selected = headers.filter((h) => preferred.some((p) => h.toLowerCase().includes(p.toLowerCase())))
  return selected.length >= 3 ? selected : headers.slice(0, 8)
}

// ── Main component ────────────────────────────────────

export default function ReportsClient() {
  const [tabs, setTabs] = useState<ReportTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/ad-reports')
      .then((r) => r.json())
      .then(async (d) => {
        const list: ReportTab[] = []
        for (const r of d.reports ?? []) {
          const detail = await fetch(`/api/ad-reports/${r.id}`).then((x) => x.json())
          list.push({
            id: r.id,
            tabName: r.tab_name,
            source: r.source,
            fileName: r.file_name,
            data: detail.report?.data ?? [],
            created_at: r.created_at,
          })
        }
        setTabs(list)
        if (list.length > 0) setActiveTab(list[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const parseFile = (file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as Record<string, string>[]
          const headers = results.meta.fields ?? []
          resolve({ headers, rows })
        },
        error: reject,
      })
    })
  }

  const handleFileSelect = (file: File) => {
    setPendingFile(file)
    if (!newTabName) {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
      setNewTabName(base)
    }
  }

  const handleUpload = async () => {
    if (!pendingFile || !newTabName.trim()) return
    setUploading(true)
    try {
      const { headers, rows } = await parseFile(pendingFile)
      const source = detectSource(headers)
      const id = generateId()
      const res = await fetch('/api/ad-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          tabName: newTabName.trim(),
          source,
          fileName: pendingFile.name,
          data: rows,
        }),
      })
      if (res.ok) {
        const newTab: ReportTab = { id, tabName: newTabName.trim(), source, fileName: pendingFile.name, data: rows }
        setTabs((prev) => [newTab, ...prev])
        setActiveTab(newTab.id)
        setShowUpload(false)
        setNewTabName('')
        setPendingFile(null)
      }
    } finally {
      setUploading(false)
    }
  }

  const deleteTab = async (id: string) => {
    if (!confirm('Bu raporu silmek istediğinize emin misiniz?')) return
    await fetch(`/api/ad-reports/${id}`, { method: 'DELETE' })
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTab((prev) => (prev === id ? (tabs.find((t) => t.id !== id)?.id ?? null) : prev))
  }

  const activeReport = tabs.find((t) => t.id === activeTab)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Yükleniyor...
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reklam Raporları</h1>
          <p className="text-sm text-slate-500 mt-1">Google Ads ve Meta Ads raporlarını yükleyin ve görüntüleyin.</p>
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Rapor Yükle
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Yeni Rapor</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sekme Adı</label>
              <input
                type="text"
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                placeholder="Örn: Ocak Google, Q1 Meta..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">CSV Dosyası</label>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleFileSelect(file)
                }}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                  }}
                />
                {pendingFile ? (
                  <div>
                    <p className="text-sm font-medium text-slate-700">{pendingFile.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(pendingFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-500">CSV dosyasını sürükleyin veya tıklayın</p>
                    <p className="text-xs text-slate-400 mt-1">Google Ads veya Meta Ads export formatı</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={!pendingFile || !newTabName.trim() || uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {uploading ? 'Yükleniyor...' : 'Raporu Kaydet'}
              </button>
              <button
                onClick={() => { setShowUpload(false); setNewTabName(''); setPendingFile(null) }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {tabs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <p className="text-slate-400 text-sm">Henüz rapor yüklenmedi.</p>
          <p className="text-slate-400 text-xs mt-1">Yukarıdaki butonu kullanarak ilk raporunuzu ekleyin.</p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
            {tabs.map((tab) => (
              <div key={tab.id} className="flex items-center group shrink-0">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span>{tab.source === 'google' ? '🔵' : '🔷'}</span>
                  {tab.tabName}
                </button>
                <button
                  onClick={() => deleteTab(tab.id)}
                  className="ml-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs pb-2 pr-1"
                  title="Sil"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Active report */}
          {activeReport && (
            <ReportView report={activeReport} />
          )}
        </>
      )}
    </div>
  )
}

function ReportView({ report }: { report: ReportTab }) {
  const headers = report.data.length > 0 ? Object.keys(report.data[0]) : []
  const displayCols = pickDisplayCols(headers, report.source)

  if (report.source === 'google') {
    const summary = parseGoogleSummary(report.data)
    return <GoogleReport summary={summary} displayCols={displayCols} report={report} />
  } else {
    const summary = parseMetaSummary(report.data)
    return <MetaReport summary={summary} displayCols={displayCols} report={report} />
  }
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function GoogleReport({ summary, displayCols, report }: { summary: GoogleSummary; displayCols: string[]; report: ReportTab }) {
  const [search, setSearch] = useState('')
  const filtered = summary.rows.filter((row) =>
    !search || Object.values(row).some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  )
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Google Ads</span>
          <span className="text-xs text-slate-400 ml-2">{report.fileName}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Gösterim" value={fmt(summary.totalImpressions)} />
        <StatCard label="Tıklama" value={fmt(summary.totalClicks)} sub={`CTR: %${summary.avgCTR.toFixed(2)}`} />
        <StatCard label="Maliyet" value={fmtCurrency(summary.totalCost)} sub={`TBM: ${fmtCurrency(summary.avgCPC)}`} />
        <StatCard label="Dönüşüm" value={fmt(summary.totalConversions, 1)} sub={summary.totalConversions > 0 ? `CPA: ${fmtCurrency(summary.avgCPA)}` : undefined} />
      </div>
      <DataTable rows={filtered} cols={displayCols} search={search} onSearch={setSearch} />
    </div>
  )
}

function MetaReport({ summary, displayCols, report }: { summary: MetaSummary; displayCols: string[]; report: ReportTab }) {
  const [search, setSearch] = useState('')
  const filtered = summary.rows.filter((row) =>
    !search || Object.values(row).some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  )
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Meta Ads</span>
          <span className="text-xs text-slate-400 ml-2">{report.fileName}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Erişim" value={fmt(summary.totalReach)} />
        <StatCard label="Gösterim" value={fmt(summary.totalImpressions)} />
        <StatCard label="Harcama" value={fmtCurrency(summary.totalSpend)} sub={`Tıklama başı: ${fmtCurrency(summary.avgCPC)}`} />
        <StatCard label="Sonuç" value={fmt(summary.totalResults)} sub={summary.totalResults > 0 ? `Sonuç başı: ${fmtCurrency(summary.avgCPR)}` : undefined} />
      </div>
      <DataTable rows={filtered} cols={displayCols} search={search} onSearch={setSearch} />
    </div>
  )
}

function DataTable({
  rows,
  cols,
  search,
  onSearch,
}: {
  rows: Record<string, string>[]
  cols: string[]
  search: string
  onSearch: (v: string) => void
}) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const total = rows.length
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { onSearch(e.target.value); setPage(0) }}
          placeholder="Satırlarda ara..."
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <span className="text-xs text-slate-400">{total} satır</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {cols.map((c) => (
                <th key={c} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-xs truncate">
                    {row[c] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400">
                  Sonuç bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40">←</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  )
}
