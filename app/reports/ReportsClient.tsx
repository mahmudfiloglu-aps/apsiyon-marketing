'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────

type ReportSource = 'crm' | 'google' | 'meta' | 'cost'

interface ReportTab {
  id: string
  tabName: string
  source: ReportSource
  fileName: string
  data: Record<string, string>[]
  created_at?: string
}

// ── CRM status classification ─────────────────────────

const QUALIFIED_STATUSES = new Set([
  'Firma kaydı oluşturuldu',
  'Potansiyel Müşteri',
  'Bilgi verildi',
  'Müşteri',
])

const UNQUALIFIED_STATUSES = new Set([
  'Alakasız',
  'Kiralama istemiyor',
  'İletişim Bilgisi Yok / Eksik / Hatalı',
  'Mükerrer Kayıt',
  'Kat Maliki',
])

function classifyStatus(durum: string): 'qualified' | 'unqualified' | 'pending' {
  if (QUALIFIED_STATUSES.has(durum)) return 'qualified'
  if (UNQUALIFIED_STATUSES.has(durum)) return 'unqualified'
  return 'pending'
}

// ── Source detection ──────────────────────────────────

function detectSource(headers: string[]): ReportSource {
  const h = headers.join(' ').toLowerCase()
  if (h.includes('durumu') && h.includes('kampanya') && h.includes('başvuru kaynağı')) return 'crm'
  if (h.includes('reach') || h.includes('erişim') || h.includes('frequency')) return 'meta'
  if (h.includes('impressions') || h.includes('clicks') || h.includes('cost')) return 'google'
  return 'crm'
}

// ── Helpers ───────────────────────────────────────────

function generateId() { return crypto.randomUUID() }

function num(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(String(v).replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0
}

function fmt(n: number, dec = 0) { return n.toLocaleString('tr-TR', { maximumFractionDigits: dec }) }
function pct(n: number) { return '%' + fmt(n, 1) }
function cur(n: number) { return '₺' + fmt(n, 2) }

// ── CRM Metrics ───────────────────────────────────────

interface CampaignRow {
  campaign: string
  source: string
  total: number
  qualified: number
  unqualified: number
  pending: number
  qualRate: number
}

interface CRMSummary {
  total: number
  qualified: number
  unqualified: number
  pending: number
  qualRate: number
  byStatus: { status: string; count: number; cls: 'qualified' | 'unqualified' | 'pending' }[]
  byCampaign: CampaignRow[]
  bySource: { source: string; total: number; qualified: number; qualRate: number }[]
}

function buildCRMSummary(data: Record<string, string>[]): CRMSummary {
  const statusMap: Record<string, number> = {}
  const campaignMap: Record<string, { source: string; total: number; qualified: number; unqualified: number; pending: number }> = {}
  const sourceMap: Record<string, { total: number; qualified: number }> = {}

  let total = 0, qualified = 0, unqualified = 0, pending = 0

  for (const row of data) {
    const durum = row['Durumu'] ?? row['durumu'] ?? ''
    const kampanya = row['Kampanya'] ?? row['kampanya'] ?? 'Bilinmiyor'
    const kaynak = row['Başvuru Kaynağı'] ?? row['başvuru kaynağı'] ?? 'Bilinmiyor'
    const cls = classifyStatus(durum)

    total++
    if (cls === 'qualified') qualified++
    else if (cls === 'unqualified') unqualified++
    else pending++

    statusMap[durum] = (statusMap[durum] ?? 0) + 1

    if (!campaignMap[kampanya]) campaignMap[kampanya] = { source: kaynak, total: 0, qualified: 0, unqualified: 0, pending: 0 }
    campaignMap[kampanya].total++
    if (cls === 'qualified') campaignMap[kampanya].qualified++
    else if (cls === 'unqualified') campaignMap[kampanya].unqualified++
    else campaignMap[kampanya].pending++

    if (!sourceMap[kaynak]) sourceMap[kaynak] = { total: 0, qualified: 0 }
    sourceMap[kaynak].total++
    if (cls === 'qualified') sourceMap[kaynak].qualified++
  }

  const byStatus = Object.entries(statusMap)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count, cls: classifyStatus(status) }))

  const byCampaign: CampaignRow[] = Object.entries(campaignMap)
    .map(([campaign, v]) => ({ campaign, ...v, qualRate: v.total > 0 ? (v.qualified / v.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)

  const bySource = Object.entries(sourceMap)
    .map(([source, v]) => ({ source, ...v, qualRate: v.total > 0 ? (v.qualified / v.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)

  return {
    total, qualified, unqualified, pending,
    qualRate: total > 0 ? (qualified / total) * 100 : 0,
    byStatus, byCampaign, bySource,
  }
}

// ── File parsing ──────────────────────────────────────

async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

  if (isXlsx) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (!raw.length) return { headers: [], rows: [] }
    const headers = Object.keys(raw[0])
    const rows = raw.map((r) => {
      const out: Record<string, string> = {}
      for (const k of headers) {
        const v = r[k]
        if (v instanceof Date) {
          out[k] = v.toLocaleDateString('tr-TR')
        } else {
          out[k] = String(v ?? '')
        }
      }
      return out
    })
    return { headers, rows }
  }

  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve({ headers: r.meta.fields ?? [], rows: r.data as Record<string, string>[] }),
        error: reject,
      })
    })
  })
}

// ── Stat Card ─────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 ${color ? `border-${color}-200` : 'border-slate-200'}`}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ? `text-${color}-600` : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── CRM View ──────────────────────────────────────────

const CLS_COLORS: Record<'qualified' | 'unqualified' | 'pending', string> = {
  qualified: 'bg-green-100 text-green-700',
  unqualified: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
}
const CLS_LABELS: Record<'qualified' | 'unqualified' | 'pending', string> = { qualified: 'Nitelikli', unqualified: 'Niteliksiz', pending: 'Beklemede' }

function CRMView({ report, costData }: { report: ReportTab; costData?: ReportTab }) {
  const summary = buildCRMSummary(report.data)
  const [tab, setTab] = useState<'kampanya' | 'kaynak' | 'durum'>('kampanya')
  const [search, setSearch] = useState('')

  // Cost merging: campaign → spend
  const costMap: Record<string, number> = {}
  if (costData) {
    for (const row of costData.data) {
      const name = row['Campaign'] ?? row['Kampanya'] ?? ''
      const spend = num(row['Cost'] ?? row['Amount spent'] ?? row['Harcanan tutar'] ?? row['Spend'] ?? '')
      if (name) costMap[name] = (costMap[name] ?? 0) + spend
    }
  }

  const hasCost = Object.keys(costMap).length > 0

  const filteredCampaigns = summary.byCampaign.filter(
    (r) => !search || r.campaign.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Toplam Lead" value={fmt(summary.total)} />
        <StatCard label="Nitelikli Lead" value={fmt(summary.qualified)} sub={pct(summary.qualRate) + ' nitelik oranı'} color="green" />
        <StatCard label="Niteliksiz" value={fmt(summary.unqualified)} sub={pct(summary.total > 0 ? (summary.unqualified / summary.total) * 100 : 0)} color="red" />
        <StatCard label="Beklemede" value={fmt(summary.pending)} sub={pct(summary.total > 0 ? (summary.pending / summary.total) * 100 : 0)} color="amber" />
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['kampanya', 'kaynak', 'durum'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'kampanya' ? 'Kampanya Bazlı' : t === 'kaynak' ? 'Kaynak Bazlı' : 'Durum Dağılımı'}
          </button>
        ))}
      </div>

      {/* Campaign table */}
      {tab === 'kampanya' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kampanya ara..."
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            <span className="text-xs text-slate-400">{filteredCampaigns.length} kampanya</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Kampanya</th>
                  <th className="text-right px-3 py-3">Toplam</th>
                  <th className="text-right px-3 py-3 text-green-600">Nitelikli</th>
                  <th className="text-right px-3 py-3 text-red-500">Niteliksiz</th>
                  <th className="text-right px-3 py-3 text-amber-500">Beklemede</th>
                  <th className="text-right px-3 py-3">Nitelik %</th>
                  {hasCost && <th className="text-right px-3 py-3">Harcama</th>}
                  {hasCost && <th className="text-right px-3 py-3">Lead Maliyeti</th>}
                  {hasCost && <th className="text-right px-3 py-3">Nitelikli Maliyet</th>}
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((row) => {
                  const spend = costMap[row.campaign] ?? 0
                  const cpl = spend > 0 && row.total > 0 ? spend / row.total : 0
                  const cpql = spend > 0 && row.qualified > 0 ? spend / row.qualified : 0
                  return (
                    <tr key={row.campaign} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-700 max-w-xs">
                        <div className="truncate" title={row.campaign}>{row.campaign || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">{fmt(row.total)}</td>
                      <td className="px-3 py-2.5 text-right text-green-600 font-medium">{fmt(row.qualified)}</td>
                      <td className="px-3 py-2.5 text-right text-red-500">{fmt(row.unqualified)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-500">{fmt(row.pending)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          row.qualRate >= 30 ? 'bg-green-100 text-green-700' :
                          row.qualRate >= 15 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {pct(row.qualRate)}
                        </span>
                      </td>
                      {hasCost && <td className="px-3 py-2.5 text-right text-slate-600">{spend > 0 ? cur(spend) : '—'}</td>}
                      {hasCost && <td className="px-3 py-2.5 text-right text-slate-600">{cpl > 0 ? cur(cpl) : '—'}</td>}
                      {hasCost && <td className="px-3 py-2.5 text-right font-medium text-blue-600">{cpql > 0 ? cur(cpql) : '—'}</td>}
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                  <td className="px-4 py-2.5">TOPLAM</td>
                  <td className="px-3 py-2.5 text-right">{fmt(summary.total)}</td>
                  <td className="px-3 py-2.5 text-right text-green-600">{fmt(summary.qualified)}</td>
                  <td className="px-3 py-2.5 text-right text-red-500">{fmt(summary.unqualified)}</td>
                  <td className="px-3 py-2.5 text-right text-amber-500">{fmt(summary.pending)}</td>
                  <td className="px-3 py-2.5 text-right">{pct(summary.qualRate)}</td>
                  {hasCost && (() => {
                    const totalSpend = Object.values(costMap).reduce((a, b) => a + b, 0)
                    const totalCPL = totalSpend > 0 && summary.total > 0 ? totalSpend / summary.total : 0
                    const totalCPQL = totalSpend > 0 && summary.qualified > 0 ? totalSpend / summary.qualified : 0
                    return (
                      <>
                        <td className="px-3 py-2.5 text-right">{totalSpend > 0 ? cur(totalSpend) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{totalCPL > 0 ? cur(totalCPL) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-blue-600">{totalCPQL > 0 ? cur(totalCPQL) : '—'}</td>
                      </>
                    )
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source table */}
      {tab === 'kaynak' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Başvuru Kaynağı</th>
                <th className="text-right px-3 py-3">Toplam</th>
                <th className="text-right px-3 py-3 text-green-600">Nitelikli</th>
                <th className="text-right px-3 py-3">Nitelik %</th>
                <th className="text-right px-3 py-3">Pay %</th>
              </tr>
            </thead>
            <tbody>
              {summary.bySource.map((row) => (
                <tr key={row.source} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{row.source || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmt(row.total)}</td>
                  <td className="px-3 py-2.5 text-right text-green-600">{fmt(row.qualified)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      row.qualRate >= 30 ? 'bg-green-100 text-green-700' :
                      row.qualRate >= 15 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {pct(row.qualRate)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {pct(summary.total > 0 ? (row.total / summary.total) * 100 : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status table */}
      {tab === 'durum' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Durum</th>
                <th className="text-left px-3 py-3">Sınıf</th>
                <th className="text-right px-3 py-3">Adet</th>
                <th className="text-right px-3 py-3">Pay %</th>
                <th className="px-4 py-3">Dağılım</th>
              </tr>
            </thead>
            <tbody>
              {summary.byStatus.map((row) => (
                <tr key={row.status} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{row.status || '(Boş)'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CLS_COLORS[row.cls]}`}>
                      {CLS_LABELS[row.cls]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmt(row.count)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {pct(summary.total > 0 ? (row.count / summary.total) * 100 : 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="w-32 bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          row.cls === 'qualified' ? 'bg-green-500' :
                          row.cls === 'unqualified' ? 'bg-red-400' : 'bg-amber-400'
                        }`}
                        style={{ width: `${summary.total > 0 ? (row.count / summary.total) * 100 : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Google/Meta generic view ───────────────────────────

function GenericView({ report }: { report: ReportTab }) {
  const headers = report.data.length > 0 ? Object.keys(report.data[0]) : []
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PAGE = 50
  const filtered = report.data.filter((row) =>
    !search || Object.values(row).some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  )
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE)

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          placeholder="Satırlarda ara..."
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <span className="text-xs text-slate-400">{filtered.length} satır</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {headers.slice(0, 12).map((c) => (
                <th key={c} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                {headers.slice(0, 12).map((c) => (
                  <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-xs truncate">{row[c] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, filtered.length)} / {filtered.length}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40">←</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE >= filtered.length} className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Upload panel ──────────────────────────────────────

const SOURCE_LABELS: Record<ReportSource, string> = {
  crm: '📋 CRM Aktiviteleri',
  google: '🔵 Google Ads',
  meta: '🔷 Meta Ads',
  cost: '💰 Maliyet Raporu',
}

// ── Main component ────────────────────────────────────

export default function ReportsClient() {
  const [tabs, setTabs] = useState<ReportTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [costTabId, setCostTabId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [detectedSource, setDetectedSource] = useState<ReportSource | null>(null)
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
            source: r.source as ReportSource,
            fileName: r.file_name,
            data: detail.report?.data ?? [],
            created_at: r.created_at,
          })
        }
        setTabs(list)
        if (list.length > 0) setActiveTab(list[0].id)
        const costTab = list.find((t) => t.source === 'cost' || t.source === 'google' || t.source === 'meta')
        if (costTab) setCostTabId(costTab.id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleFileSelect = async (file: File) => {
    setPendingFile(file)
    if (!newTabName) {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ')
      setNewTabName(base)
    }
    try {
      const { headers } = await parseFile(file)
      setDetectedSource(detectSource(headers))
    } catch {}
  }

  const handleUpload = async () => {
    if (!pendingFile || !newTabName.trim()) return
    setUploading(true)
    try {
      const { headers, rows } = await parseFile(pendingFile)
      const source = detectedSource ?? detectSource(headers)
      const id = generateId()
      const res = await fetch('/api/ad-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, tabName: newTabName.trim(), source, fileName: pendingFile.name, data: rows }),
      })
      if (res.ok) {
        const newTab: ReportTab = { id, tabName: newTabName.trim(), source, fileName: pendingFile.name, data: rows }
        setTabs((prev) => [newTab, ...prev])
        setActiveTab(newTab.id)
        setShowUpload(false)
        setNewTabName('')
        setPendingFile(null)
        setDetectedSource(null)
      }
    } finally {
      setUploading(false)
    }
  }

  const deleteTab = async (id: string) => {
    if (!confirm('Bu raporu silmek istediğinize emin misiniz?')) return
    await fetch(`/api/ad-reports/${id}`, { method: 'DELETE' })
    setTabs((prev) => prev.filter((t) => t.id !== id))
    if (activeTab === id) setActiveTab(tabs.find((t) => t.id !== id)?.id ?? null)
    if (costTabId === id) setCostTabId(null)
  }

  const activeReport = tabs.find((t) => t.id === activeTab)
  const costReport = costTabId ? tabs.find((t) => t.id === costTabId) : undefined

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Yükleniyor...</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reklam Raporları</h1>
          <p className="text-sm text-slate-500 mt-1">CRM aktiviteleri, Google Ads ve Meta Ads raporlarını yükleyin ve analiz edin.</p>
        </div>
        <div className="flex items-center gap-3">
          {tabs.filter((t) => t.source === 'google' || t.source === 'meta').length > 0 && (
            <select
              value={costTabId ?? ''}
              onChange={(e) => setCostTabId(e.target.value || null)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Maliyet verisi için sekme seç"
            >
              <option value="">Maliyet verisi seç…</option>
              {tabs.filter((t) => t.source === 'google' || t.source === 'meta').map((t) => (
                <option key={t.id} value={t.id}>{t.tabName}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Rapor Yükle
          </button>
        </div>
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
                placeholder="Örn: Haziran CRM, Q2 Google Ads..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Dosya (.xlsx veya .csv)</label>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                {pendingFile ? (
                  <div>
                    <p className="text-sm font-medium text-slate-700">{pendingFile.name}</p>
                    {detectedSource && (
                      <p className="text-xs text-blue-600 mt-1 font-medium">Algılanan: {SOURCE_LABELS[detectedSource]}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{(pendingFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-500">Dosyayı sürükleyin veya tıklayın</p>
                    <p className="text-xs text-slate-400 mt-1">CRM (.xlsx), Google Ads veya Meta Ads (.csv)</p>
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
                onClick={() => { setShowUpload(false); setNewTabName(''); setPendingFile(null); setDetectedSource(null) }}
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
          <p className="text-slate-400 text-xs mt-1">CRM aktiviteler (.xlsx) veya reklam raporları (.csv) yükleyerek başlayın.</p>
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
                    activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base">{SOURCE_LABELS[tab.source].split(' ')[0]}</span>
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
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                  {SOURCE_LABELS[activeReport.source]}
                </span>
                <span className="text-xs text-slate-400">{activeReport.fileName}</span>
                <span className="text-xs text-slate-400">· {activeReport.data.length} satır</span>
              </div>

              {activeReport.source === 'crm' ? (
                <CRMView report={activeReport} costData={costReport} />
              ) : (
                <GenericView report={activeReport} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
