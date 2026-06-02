'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────

type ReportSource = 'crm' | 'performans' | 'google' | 'meta' | 'cost'

interface ReportTab {
  id: string
  tabName: string
  source: ReportSource
  fileName: string
  data: Record<string, string>[]
  created_at?: string
}

// ── CRM status classification ─────────────────────────

// Niteliksiz = sadece bu iki statü; geri kalan her şey nitelikli (boş hariç)
const UNQUALIFIED_STATUSES = new Set(['Alakasız', 'Ulaşılamadı'])

function classifyStatus(durum: string): 'qualified' | 'unqualified' | 'skip' {
  if (!durum || durum === 'None') return 'skip'
  return UNQUALIFIED_STATUSES.has(durum) ? 'unqualified' : 'qualified'
}

function normalizeChannel(kanal: string | undefined): string {
  if (!kanal) return 'Diğer'
  // Sadece google_ads ücretli reklam sayılır; organic hariç
  if (kanal === 'google_ads') return 'Google Ads'
  if (kanal.toLowerCase() === 'google' || kanal === 'google_organic') return 'Google Organik'
  if (kanal.toLowerCase().includes('facebook') || kanal.toLowerCase().includes('meta') || kanal.toLowerCase().includes('instagram')) return 'Meta / Facebook'
  return kanal
}

// ── Source detection ──────────────────────────────────

function detectSource(headers: string[]): ReportSource {
  const h = headers.join(' ').toLowerCase()
  if (h.includes('nitelikli lead') || h.includes('teklif sayısı') || h.includes('createquarter')) return 'performans'
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
  channel: string
  source: string
  total: number
  qualified: number
  unqualified: number
  qualRate: number
}

interface CRMSummary {
  total: number
  qualified: number
  unqualified: number
  skipped: number
  qualRate: number
  byStatus: { status: string; count: number; cls: 'qualified' | 'unqualified' | 'skip' }[]
  byCampaign: CampaignRow[]
  bySource: { source: string; total: number; qualified: number; qualRate: number }[]
  byChannel: { channel: string; total: number; qualified: number; qualRate: number }[]
}

function buildCRMSummary(data: Record<string, string>[]): CRMSummary {
  const statusMap: Record<string, number> = {}
  const campaignMap: Record<string, { channel: string; source: string; total: number; qualified: number; unqualified: number }> = {}
  const sourceMap: Record<string, { total: number; qualified: number }> = {}
  const channelMap: Record<string, { total: number; qualified: number }> = {}

  let total = 0, qualified = 0, unqualified = 0, skipped = 0

  for (const row of data) {
    const durum = row['Durumu'] ?? row['durumu'] ?? ''
    const kampanya = row['Kampanya'] ?? row['kampanya'] ?? 'Bilinmiyor'
    const kaynak = row['Başvuru Kaynağı'] ?? row['başvuru kaynağı'] ?? 'Bilinmiyor'
    const rawKanal = row['Kanal'] ?? row['kanal'] ?? ''
    const kanal = normalizeChannel(rawKanal)
    const cls = classifyStatus(durum)

    if (cls === 'skip') { skipped++; continue }

    total++
    if (cls === 'qualified') qualified++
    else unqualified++

    statusMap[durum] = (statusMap[durum] ?? 0) + 1

    if (!campaignMap[kampanya]) campaignMap[kampanya] = { channel: kanal, source: kaynak, total: 0, qualified: 0, unqualified: 0 }
    campaignMap[kampanya].total++
    if (cls === 'qualified') campaignMap[kampanya].qualified++
    else campaignMap[kampanya].unqualified++

    if (!sourceMap[kaynak]) sourceMap[kaynak] = { total: 0, qualified: 0 }
    sourceMap[kaynak].total++
    if (cls === 'qualified') sourceMap[kaynak].qualified++

    if (!channelMap[kanal]) channelMap[kanal] = { total: 0, qualified: 0 }
    channelMap[kanal].total++
    if (cls === 'qualified') channelMap[kanal].qualified++
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

  const byChannel = Object.entries(channelMap)
    .map(([channel, v]) => ({ channel, ...v, qualRate: v.total > 0 ? (v.qualified / v.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)

  return {
    total, qualified, unqualified, skipped,
    qualRate: total > 0 ? (qualified / total) * 100 : 0,
    byStatus, byCampaign, bySource, byChannel,
  }
}

// ── Lead Performans parsing ────────────────────────────

interface PerfRow {
  year: string
  quarter: string
  month: string
  date: string
  lead: number
  nitelikli: number
  niteliksiz: number
  firma: number
  teklif: number
  bolum: number
}

function buildPerfRows(data: Record<string, string>[]): PerfRow[] {
  return data.map((r) => ({
    year: r['Tarih'] ?? '',
    quarter: r['CreateQuarter'] ?? '',
    month: r['CreateMonth'] ?? '',
    date: r['CreateDay'] ?? '',
    lead: num(r['Lead']),
    nitelikli: num(r['Nitelikli Lead']),
    niteliksiz: num(r['Niteliksiz Lead']),
    firma: num(r['Firma']),
    teklif: num(r['Teklif Sayısı']),
    bolum: num(r['B. Bölüm']),
  }))
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

const CLS_COLORS: Record<'qualified' | 'unqualified' | 'skip', string> = {
  qualified: 'bg-green-100 text-green-700',
  unqualified: 'bg-red-100 text-red-700',
  skip: 'bg-slate-100 text-slate-400',
}
const CLS_LABELS: Record<'qualified' | 'unqualified' | 'skip', string> = { qualified: 'Nitelikli', unqualified: 'Niteliksiz', skip: '—' }

function CRMView({ report, costData }: { report: ReportTab; costData?: ReportTab }) {
  const summary = buildCRMSummary(report.data)
  const [tab, setTab] = useState<'kampanya' | 'kanal' | 'kaynak' | 'durum'>('kampanya')
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
    <div className="space-y-4">
      {/* Compact summary strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Toplam Lead</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider border-l border-slate-100">Nitelikli</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider border-l border-slate-100">Niteliksiz</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider border-l border-slate-100">Nitelik Oranı</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-2 font-bold text-slate-800 text-sm tabular-nums">{fmt(summary.total)}</td>
              <td className="px-4 py-2 font-bold text-green-700 text-sm tabular-nums border-l border-slate-100">{fmt(summary.qualified)}</td>
              <td className="px-4 py-2 font-bold text-red-500 text-sm tabular-nums border-l border-slate-100">{fmt(summary.unqualified)}</td>
              <td className="px-4 py-2 border-l border-slate-100">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  summary.qualRate >= 30 ? 'bg-green-100 text-green-700' :
                  summary.qualRate >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                }`}>{pct(summary.qualRate)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['kampanya', 'kanal', 'kaynak', 'durum'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'kampanya' ? 'Kampanya Bazlı' : t === 'kanal' ? 'Kanal Bazlı' : t === 'kaynak' ? 'Kaynak Bazlı' : 'Durum Dağılımı'}
          </button>
        ))}
      </div>

      {/* Campaign table */}
      {tab === 'kampanya' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
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
                  <th className="text-left px-3 py-3">Kanal</th>
                  <th className="text-right px-3 py-3">Toplam</th>
                  <th className="text-right px-3 py-3 text-green-600">Nitelikli</th>
                  <th className="text-right px-3 py-3 text-red-500">Niteliksiz</th>
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
                  const isGoogle = row.channel === 'Google'
                  return (
                    <tr key={row.campaign} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-1.5 font-medium text-slate-700 max-w-xs">
                        <div className="truncate" title={row.campaign}>{row.campaign || '—'}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isGoogle ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          {isGoogle ? '🔵 Google' : '🔷 Meta'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-xs tabular-nums">{fmt(row.total)}</td>
                      <td className="px-3 py-1.5 text-right text-green-700 font-semibold text-xs tabular-nums">{fmt(row.qualified)}</td>
                      <td className="px-3 py-1.5 text-right text-red-500 text-xs tabular-nums">{fmt(row.unqualified)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          row.qualRate >= 30 ? 'bg-green-100 text-green-700' :
                          row.qualRate >= 15 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {pct(row.qualRate)}
                        </span>
                      </td>
                      {hasCost && <td className="px-3 py-1.5 text-right text-slate-600">{spend > 0 ? cur(spend) : '—'}</td>}
                      {hasCost && <td className="px-3 py-1.5 text-right text-slate-600">{cpl > 0 ? cur(cpl) : '—'}</td>}
                      {hasCost && <td className="px-3 py-1.5 text-right font-medium text-blue-600">{cpql > 0 ? cur(cpql) : '—'}</td>}
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                  <td className="px-4 py-1.5" colSpan={2}>TOPLAM</td>
                  <td className="px-3 py-1.5 text-right">{fmt(summary.total)}</td>
                  <td className="px-3 py-1.5 text-right text-green-700 text-xs tabular-nums">{fmt(summary.qualified)}</td>
                  <td className="px-3 py-1.5 text-right text-red-500 text-xs tabular-nums">{fmt(summary.unqualified)}</td>
                  <td className="px-3 py-1.5 text-right">{pct(summary.qualRate)}</td>
                  {hasCost && (() => {
                    const totalSpend = Object.values(costMap).reduce((a, b) => a + b, 0)
                    const totalCPL = totalSpend > 0 && summary.total > 0 ? totalSpend / summary.total : 0
                    const totalCPQL = totalSpend > 0 && summary.qualified > 0 ? totalSpend / summary.qualified : 0
                    return (
                      <>
                        <td className="px-3 py-1.5 text-right">{totalSpend > 0 ? cur(totalSpend) : '—'}</td>
                        <td className="px-3 py-1.5 text-right">{totalCPL > 0 ? cur(totalCPL) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-blue-600">{totalCPQL > 0 ? cur(totalCPQL) : '—'}</td>
                      </>
                    )
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Channel table */}
      {tab === 'kanal' && (
        <div className="space-y-4">
          {/* Channel summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.byChannel.map((ch) => (
              <div key={ch.channel} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{ch.channel}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(ch.total)}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="text-green-600 font-medium">{fmt(ch.qualified)} nitelikli</span>
                  {' · '}
                  {pct(ch.qualRate)}
                </p>
              </div>
            ))}
          </div>

          {/* Campaign breakdown per channel */}
          {summary.byChannel.map((ch) => {
            const campaigns = summary.byCampaign.filter((c) => c.channel === ch.channel)
            return (
              <div key={ch.channel} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span className="font-semibold text-slate-800 text-sm">{ch.channel}</span>
                  <span className="text-xs text-slate-400">{campaigns.length} kampanya · {fmt(ch.total)} lead</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-1.5">Kampanya</th>
                        <th className="text-right px-3 py-1.5">Toplam</th>
                        <th className="text-right px-3 py-1.5 text-green-600">Nitelikli</th>
                        <th className="text-right px-3 py-1.5 text-red-500">Niteliksiz</th>
                        <th className="text-right px-3 py-1.5">Nitelik %</th>
                        {hasCost && <th className="text-right px-3 py-1.5">Harcama</th>}
                        {hasCost && <th className="text-right px-3 py-1.5">Lead Maliyeti</th>}
                        {hasCost && <th className="text-right px-3 py-1.5">Nitelikli Maliyet</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((row) => {
                        const spend = costMap[row.campaign] ?? 0
                        const cpl = spend > 0 && row.total > 0 ? spend / row.total : 0
                        const cpql = spend > 0 && row.qualified > 0 ? spend / row.qualified : 0
                        return (
                          <tr key={row.campaign} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-4 py-2 font-medium text-slate-700 max-w-xs">
                              <div className="truncate" title={row.campaign}>{row.campaign || '—'}</div>
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums font-semibold">{fmt(row.total)}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-green-600 font-medium">{fmt(row.qualified)}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-red-500">{fmt(row.unqualified)}</td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                row.qualRate >= 30 ? 'bg-green-100 text-green-700' :
                                row.qualRate >= 15 ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {pct(row.qualRate)}
                              </span>
                            </td>
                            {hasCost && <td className="px-3 py-1.5 text-right text-xs tabular-nums text-slate-600">{spend > 0 ? cur(spend) : '—'}</td>}
                            {hasCost && <td className="px-3 py-1.5 text-right text-xs tabular-nums text-slate-600">{cpl > 0 ? cur(cpl) : '—'}</td>}
                            {hasCost && <td className="px-3 py-1.5 text-right text-xs tabular-nums text-blue-600 font-medium">{cpql > 0 ? cur(cpql) : '—'}</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
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
                  <td className="px-4 py-1.5 font-medium text-slate-700">{row.source || '—'}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-xs tabular-nums">{fmt(row.total)}</td>
                  <td className="px-3 py-1.5 text-right text-green-700 text-xs tabular-nums">{fmt(row.qualified)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      row.qualRate >= 30 ? 'bg-green-100 text-green-700' :
                      row.qualRate >= 15 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {pct(row.qualRate)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-500">
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
                  <td className="px-4 py-1.5 font-medium text-slate-700">{row.status || '(Boş)'}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CLS_COLORS[row.cls]}`}>
                      {CLS_LABELS[row.cls]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-xs tabular-nums">{fmt(row.count)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">
                    {pct(summary.total > 0 ? (row.count / summary.total) * 100 : 0)}
                  </td>
                  <td className="px-4 py-1.5">
                    <div className="w-32 bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          row.cls === 'qualified' ? 'bg-green-500' : 'bg-red-400'
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
                <th key={c} className="text-left px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">{c}</th>
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
  performans: '📊 Lead Performansı',
  google: '🔵 Google Ads',
  meta: '🔷 Meta Ads',
  cost: '💰 Maliyet Raporu',
}

// ── Lead Performans View ───────────────────────────────

function PerformansView({ report }: { report: ReportTab }) {
  const rows = buildPerfRows(report.data)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })

  // Find the summary row
  const totalRow = rows.find((r) => String(r.year).toLowerCase() === 'total' || String(r.year) === 'Toplam')
  const dataRows = rows.filter((r) => String(r.year).toLowerCase() !== 'total' && String(r.year) !== 'Toplam')

  const thCls = 'px-3 py-1.5 text-right text-xs font-semibold text-slate-500 border-r border-slate-200 last:border-r-0 whitespace-nowrap bg-slate-50'
  const tdCls = 'px-3 py-1 text-right text-xs tabular-nums border-r border-slate-200 last:border-r-0'
  const tdLabelCls = 'px-3 py-1 text-xs border-r border-slate-200'

  const PerfRow = ({ row, indent, label, rowKey, hasChildren }: {
    row: PerfRow; indent: number; label: string; rowKey: string; hasChildren: boolean
  }) => {
    const isCollapsed = collapsed.has(rowKey)
    return (
      <tr className="border-b border-slate-100 hover:bg-blue-50/30">
        <td className={`${tdLabelCls} font-medium text-slate-700`} style={{ paddingLeft: 8 + indent * 16 }}>
          {hasChildren ? (
            <button onClick={() => toggle(rowKey)} className="mr-1 text-slate-400 hover:text-blue-600 font-mono text-xs select-none">
              {isCollapsed ? '⊞' : '⊟'}
            </button>
          ) : (
            <span className="mr-1 inline-block w-3" />
          )}
          {label}
        </td>
        <td className={tdCls}>{fmt(row.lead)}</td>
        <td className={`${tdCls} text-green-700 font-semibold`}>{fmt(row.nitelikli)}</td>
        <td className={`${tdCls} text-red-500`}>{fmt(row.niteliksiz)}</td>
        <td className={tdCls}>{fmt(row.firma)}</td>
        <td className={tdCls}>{row.teklif > 0 ? fmt(row.teklif) : '—'}</td>
        <td className={tdCls}>{row.bolum > 0 ? fmt(row.bolum) : '—'}</td>
      </tr>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-1.5 border-b border-slate-200 bg-slate-50">
        <span className="text-sm font-semibold text-slate-800">Lead Performansı</span>
        <span className="text-xs text-slate-400 ml-2">{report.fileName}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={`${thCls} text-left`} style={{ minWidth: 140 }}>Tarih</th>
              <th className={thCls}>Lead</th>
              <th className={thCls}>Nitelikli Lead</th>
              <th className={thCls}>Niteliksiz Lead</th>
              <th className={thCls}>Firma</th>
              <th className={thCls}>Teklif Sayısı</th>
              <th className={thCls}>B. Bölüm</th>
            </tr>
          </thead>
          <tbody>
            {dataRows.map((r, i) => {
              const yearKey = String(r.year)
              const qKey = `${yearKey}_${r.quarter}`
              const mKey = `${qKey}_${r.month}`

              // Year row
              if (r.month === 'Total' || r.month === '' || r.month === null) {
                if (r.quarter === 'Total' || r.quarter === '' || r.quarter === null) {
                  return <PerfRow key={i} row={r} indent={0} label={yearKey} rowKey={yearKey} hasChildren />
                }
              }
              // Quarter row
              if (collapsed.has(yearKey)) return null
              if ((r.date === 'Total' || r.date === '' || r.date === null) &&
                  r.month !== 'Total' && r.month !== '' && r.month !== null &&
                  (r.quarter !== 'Total' && r.quarter !== '')) {
                if (r.month === 'Total' || typeof r.month === 'string' && r.month.startsWith('Total')) {
                  return <PerfRow key={i} row={r} indent={1} label={`Q${r.quarter}`} rowKey={qKey} hasChildren />
                }
              }
              return null
            })}
            {/* Simpler approach: just render all rows with indentation based on data */}
            {(() => {
              const elements: React.ReactNode[] = []
              for (let i = 0; i < dataRows.length; i++) {
                const r = dataRows[i]
                const yearStr = String(r.year)
                const qStr = String(r.quarter)
                const mStr = String(r.month)
                const dStr = String(r.date)

                const yearKey = yearStr
                const qKey = `${yearStr}_${qStr}`
                const mKey = `${yearStr}_${qStr}_${mStr}`

                if (qStr === 'Total' || qStr === 'None' || qStr === 'null' || !r.quarter) {
                  // Year-level row
                  elements.push(<PerfRow key={`y${i}`} row={r} indent={0} label={yearStr} rowKey={yearKey} hasChildren />)
                } else if (mStr === 'Total' || mStr === 'None' || mStr === 'null' || !r.month) {
                  if (collapsed.has(yearKey)) continue
                  elements.push(<PerfRow key={`q${i}`} row={r} indent={1} label={`Q${qStr}`} rowKey={qKey} hasChildren />)
                } else if (dStr === 'Total' || dStr === 'None' || dStr === 'null' || !r.date) {
                  if (collapsed.has(yearKey) || collapsed.has(qKey)) continue
                  elements.push(<PerfRow key={`m${i}`} row={r} indent={2} label={`${mStr}. Ay`} rowKey={mKey} hasChildren />)
                } else {
                  if (collapsed.has(yearKey) || collapsed.has(qKey) || collapsed.has(mKey)) continue
                  const dateLabel = dStr.includes('T') || dStr.includes('-') ? new Date(dStr).toLocaleDateString('tr-TR') : dStr
                  elements.push(<PerfRow key={`d${i}`} row={r} indent={3} label={dateLabel} rowKey={`d${i}`} hasChildren={false} />)
                }
              }
              return elements
            })()}
          </tbody>
          {totalRow && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <td className="px-3 py-1.5 text-xs font-bold text-slate-800 border-r border-slate-200">Toplam</td>
                <td className={tdCls + ' font-bold text-slate-800'}>{fmt(totalRow.lead)}</td>
                <td className={tdCls + ' font-bold text-green-700'}>{fmt(totalRow.nitelikli)}</td>
                <td className={tdCls + ' font-bold text-red-500'}>{fmt(totalRow.niteliksiz)}</td>
                <td className={tdCls + ' font-bold text-slate-800'}>{fmt(totalRow.firma)}</td>
                <td className={tdCls + ' font-bold text-slate-800'}>{totalRow.teklif > 0 ? fmt(totalRow.teklif) : '—'}</td>
                <td className={tdCls + ' font-bold text-slate-800'}>{totalRow.bolum > 0 ? fmt(totalRow.bolum) : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
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
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
              ) : activeReport.source === 'performans' ? (
                <PerformansView report={activeReport} />
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
