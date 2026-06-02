'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

type FileType = 'lead_detail' | 'lead_summary' | 'google' | 'meta' | 'google_cost'
type PeriodType = 'monthly' | 'weekly'

interface ProjectMeta {
  id: string
  project_name: string
  period_type: PeriodType
  created_at: string
}

interface ReportFile {
  id: string
  file_type: FileType
  is_previous: boolean
  file_name: string
  data: Record<string, string>[]
}

interface Project extends ProjectMeta {
  files: ReportFile[]
}

// ─── File slot config ─────────────────────────────────────────────────────────

const FILE_SLOTS: { type: FileType; label: string; accept: string; hint: string }[] = [
  { type: 'lead_detail',  label: 'Lead Detaylı',  accept: '.xlsx,.xls', hint: 'Aktiviteler.xlsx — CRM lead detayları' },
  { type: 'lead_summary', label: 'Lead Özeti',    accept: '.xlsx,.xls', hint: 'Lead_Performans.xlsx — nitelikli/niteliksiz özet' },
  { type: 'google',       label: 'Google Ads',      accept: '.csv',        hint: 'Google Ads export CSV' },
  { type: 'meta',         label: 'Meta Ads',        accept: '.csv',        hint: 'Meta Ads export CSV' },
  { type: 'google_cost',  label: 'Google Maliyet',  accept: '.csv',        hint: 'Google Ads Kampanya raporu CSV' },
]

// ─── CRM helpers ──────────────────────────────────────────────────────────────

const UNQUALIFIED = new Set(['Alakasız', 'Ulaşılamadı'])
function classify(durum: string): 'q' | 'u' | 'skip' {
  if (!durum || durum === 'None') return 'skip'
  return UNQUALIFIED.has(durum) ? 'u' : 'q'
}

function normalizeChannel(k: string | undefined): string {
  if (!k) return 'Diğer'
  if (k === 'google_ads') return 'Google Ads'
  if (k.toLowerCase() === 'google' || k === 'google_organic') return 'Google Organik'
  if (k.toLowerCase().includes('facebook') || k.toLowerCase().includes('meta')) return 'Meta / Facebook'
  return k
}

// ─── File parsing ─────────────────────────────────────────────────────────────

function num(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(String(v).replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0
}

// Turkish Google Ads number format: "1.742" = 1742 (period=thousands), "1519,82" = 1519.82 (comma=decimal)
function numTR(v: string | undefined): number {
  if (!v || v.trim() === '--' || v.trim() === ' --') return 0
  const clean = v.replace(/\s/g, '').replace('%', '').replace(/\./g, '').replace(',', '.')
  return parseFloat(clean) || 0
}

function fmt(n: number, dec = 0) { return n.toLocaleString('tr-TR', { maximumFractionDigits: dec }) }
function pct(n: number) { return '%' + fmt(n, 1) }
function cur(n: number) { return '₺' + fmt(n, 2) }
function delta(curr: number, prev: number) {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
  if (isXlsx) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    return raw.map((r) => {
      const out: Record<string, string> = {}
      for (const k of Object.keys(r)) {
        const v = r[k]
        out[k] = v instanceof Date ? v.toLocaleDateString('tr-TR') : String(v ?? '')
      }
      return out
    })
  }
  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const firstLine = text.split('\n')[0].trim()
        let csvText = text
        // Google Ads "Kampanya raporu" exports have 2 metadata rows before the real headers
        if (firstLine === 'Kampanya raporu') {
          const lines = text.split('\n')
          const headerIdx = lines.findIndex((l, i) => i >= 2 && l.includes('Kampanya durumu'))
          csvText = lines.slice(headerIdx >= 0 ? headerIdx : 2).join('\n')
        }
        Papa.parse(csvText, {
          header: true, skipEmptyLines: true,
          complete: (r) => {
            const rows = (r.data as Record<string, string>[])
              .filter((row) => !String(row['Kampanya'] ?? '').startsWith('Toplam:'))
              .filter((row) => !String(row['Kampanya durumu'] ?? '').startsWith('Toplam:'))
            resolve(rows)
          },
          error: reject,
        })
      }
      reader.onerror = reject
      reader.readAsText(file, 'utf-8')
    })
  })
}

// ─── Lead Detail metrics ───────────────────────────────────────────────────────

interface CampaignMetrics {
  campaign: string
  channel: string
  total: number
  qualified: number
  unqualified: number
  qualRate: number
}

function buildLeadMetrics(rows: Record<string, string>[]) {
  const campaigns: Record<string, CampaignMetrics> = {}
  const channels: Record<string, { total: number; qualified: number }> = {}
  let total = 0, qualified = 0, unqualified = 0

  for (const row of rows) {
    const durum = row['Durumu'] ?? ''
    const cls = classify(durum)
    if (cls === 'skip') continue
    const camp = row['Kampanya'] ?? 'Bilinmiyor'
    const ch = normalizeChannel(row['Kanal'])
    total++
    if (cls === 'q') qualified++; else unqualified++
    if (!campaigns[camp]) campaigns[camp] = { campaign: camp, channel: ch, total: 0, qualified: 0, unqualified: 0, qualRate: 0 }
    campaigns[camp].total++
    if (cls === 'q') campaigns[camp].qualified++; else campaigns[camp].unqualified++
    if (!channels[ch]) channels[ch] = { total: 0, qualified: 0 }
    channels[ch].total++
    if (cls === 'q') channels[ch].qualified++
  }

  const campList = Object.values(campaigns).map((c) => ({ ...c, qualRate: c.total > 0 ? (c.qualified / c.total) * 100 : 0 })).sort((a, b) => b.total - a.total)
  const channelList = Object.entries(channels).map(([channel, v]) => ({ channel, ...v, unqualified: v.total - v.qualified, qualRate: v.total > 0 ? (v.qualified / v.total) * 100 : 0 })).sort((a, b) => b.total - a.total)

  return { total, qualified, unqualified, qualRate: total > 0 ? (qualified / total) * 100 : 0, campaigns: campList, channels: channelList }
}

// ─── Google/Meta metrics ───────────────────────────────────────────────────────

interface AdsMetrics {
  campaign: string
  impressions: number
  clicks: number
  ctr: number
  spend: number
  conversions: number
  cpc: number
  cpa: number
}

function buildGoogleMetrics(rows: Record<string, string>[]): AdsMetrics[] {
  const map: Record<string, AdsMetrics> = {}
  for (const row of rows) {
    const camp = row['Campaign'] ?? row['Kampanya'] ?? 'Bilinmiyor'
    if (!map[camp]) map[camp] = { campaign: camp, impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpc: 0, cpa: 0 }
    map[camp].impressions += num(row['Impressions'] ?? row['Gösterim'])
    map[camp].clicks += num(row['Clicks'] ?? row['Tıklama'])
    map[camp].spend += num(row['Cost'] ?? row['Maliyet'] ?? row['Spend'])
    map[camp].conversions += num(row['Conversions'] ?? row['Dönüşüm'])
  }
  return Object.values(map).map((r) => ({
    ...r,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions : 0,
  })).sort((a, b) => b.spend - a.spend)
}

function buildMetaMetrics(rows: Record<string, string>[]): AdsMetrics[] {
  const map: Record<string, AdsMetrics> = {}
  for (const row of rows) {
    const camp =
      row['Kampanya Adı'] ?? row['Campaign name'] ?? row['Campaign'] ?? 'Bilinmiyor'
    if (!map[camp]) map[camp] = { campaign: camp, impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpc: 0, cpa: 0 }
    map[camp].impressions += num(row['Gösterim'] ?? row['Impressions'])
    map[camp].clicks     += num(row['Bağlantı Tıklamaları'] ?? row['Link clicks'] ?? row['Clicks'])
    map[camp].spend      += num(row['Harcanan Tutar (TRY)'] ?? row['Amount spent (TRY)'] ?? row['Amount spent'] ?? row['Spend'])
    map[camp].conversions += num(row['Sonuçlar'] ?? row['Results'])
  }
  return Object.values(map).map((r) => ({
    ...r,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions : 0,
  })).sort((a, b) => b.spend - a.spend)
}

interface CostRow {
  campaign: string
  status: string
  impressions: number
  clicks: number
  ctr: number
  spend: number
  cpc: number
  conversions: number
  cpa: number
}

function buildGoogleCostMetrics(rows: Record<string, string>[]): CostRow[] {
  return rows
    .filter((r) => r['Kampanya'] && r['Kampanya'].trim() !== '' && !r['Kampanya'].startsWith('Toplam'))
    .map((r) => {
      const spend = numTR(r['Maliyet'])
      const clicks = numTR(r['Tıklamalar'])
      const impressions = numTR(r['Göstr.'])
      const conversions = numTR(r['Dönüşümler'])
      return {
        campaign: r['Kampanya'].trim(),
        status: r['Kampanya durumu'] ?? '',
        impressions,
        clicks,
        ctr: numTR(r['TO']),
        spend,
        cpc: clicks > 0 ? spend / clicks : numTR(r['Ort. TBM']),
        conversions,
        cpa: conversions > 0 ? spend / conversions : numTR(r['Maliyet / dönüşüm']),
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

// ─── Excel export ──────────────────────────────────────────────────────────────

function exportExcel(project: Project, mode: 'screen' | 'raw') {
  const wb = XLSX.utils.book_new()

  const leadFile = project.files.find((f) => f.file_type === 'lead_detail' && !f.is_previous)
  const googleFile = project.files.find((f) => f.file_type === 'google' && !f.is_previous)
  const metaFile = project.files.find((f) => f.file_type === 'meta' && !f.is_previous)

  if (mode === 'raw') {
    for (const f of project.files) {
      if (f.data.length) {
        const ws = XLSX.utils.json_to_sheet(f.data)
        XLSX.utils.book_append_sheet(wb, ws, `${f.file_type}${f.is_previous ? '_prev' : ''}`.slice(0, 31))
      }
    }
  } else {
    // Screen view: lead metrics
    if (leadFile?.data.length) {
      const metrics = buildLeadMetrics(leadFile.data)
      const rows = metrics.campaigns.map((c) => ({
        'Kampanya': c.campaign, 'Kanal': c.channel,
        'Toplam Lead': c.total, 'Nitelikli': c.qualified,
        'Niteliksiz': c.unqualified, 'Nitelik %': c.qualRate.toFixed(1) + '%',
      }))
      rows.push({ 'Kampanya': 'TOPLAM', 'Kanal': '', 'Toplam Lead': metrics.total, 'Nitelikli': metrics.qualified, 'Niteliksiz': metrics.unqualified, 'Nitelik %': metrics.qualRate.toFixed(1) + '%' })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Lead Raporu')
    }
    if (googleFile?.data.length) {
      const metrics = buildGoogleMetrics(googleFile.data)
      const rows = metrics.map((r) => ({ 'Kampanya': r.campaign, 'Gösterim': r.impressions, 'Tıklama': r.clicks, 'CTR %': r.ctr.toFixed(2) + '%', 'Harcama': r.spend.toFixed(2), 'Dönüşüm': r.conversions, 'TBM': r.cpc.toFixed(2), 'CPA': r.cpa.toFixed(2) }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Google Ads')
    }
    if (metaFile?.data.length) {
      const metrics = buildMetaMetrics(metaFile.data)
      const rows = metrics.map((r) => ({ 'Kampanya': r.campaign, 'Gösterim': r.impressions, 'Tıklama': r.clicks, 'CTR %': r.ctr.toFixed(2) + '%', 'Harcama': r.spend.toFixed(2), 'Sonuç': r.conversions, 'TBM': r.cpc.toFixed(2), 'Sonuç Başı': r.cpa.toFixed(2) }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Meta Ads')
    }
  }

  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Veri yok']]), 'Boş')
  XLSX.writeFile(wb, `${project.project_name}_rapor.xlsx`)
}

// ─── UI Components ────────────────────────────────────────────────────────────

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
)

const TD = ({ children, right, bold, green, red, className = '', colSpan }: { children: React.ReactNode; right?: boolean; bold?: boolean; green?: boolean; red?: boolean; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={`px-3 py-1.5 text-xs border-b border-slate-100 tabular-nums ${right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''} ${green ? 'text-green-700' : red ? 'text-red-500' : 'text-slate-700'} ${className}`}>
    {children}
  </td>
)

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  const d = delta(curr, prev)
  if (d === null) return null
  const up = d >= 0
  return (
    <span className={`ml-1 text-[10px] font-medium px-1 py-0.5 rounded ${up ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
      {up ? '▲' : '▼'}{Math.abs(d).toFixed(1)}%
    </span>
  )
}

function QualBadge({ rate }: { rate: number }) {
  const cls = rate >= 30 ? 'bg-green-100 text-green-700' : rate >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>{pct(rate)}</span>
}

// ─── Lead Report Tab ──────────────────────────────────────────────────────────

function LeadReportTab({ project }: { project: Project }) {
  const curr = project.files.find((f) => f.file_type === 'lead_detail' && !f.is_previous)
  const prev = project.files.find((f) => f.file_type === 'lead_detail' && f.is_previous)
  const summCurr = project.files.find((f) => f.file_type === 'lead_summary' && !f.is_previous)

  if (!curr) return <EmptySlot label="Lead Detaylı raporu yükleyin" />

  const metrics = buildLeadMetrics(curr.data)
  const prevMetrics = prev ? buildLeadMetrics(prev.data) : null
  const hasPrev = !!prevMetrics
  const [view, setView] = useState<'kampanya' | 'kanal'>('kanal')
  const [search, setSearch] = useState('')

  const filtered = metrics.campaigns.filter((c) => !search || c.campaign.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Toplam Lead</TH>
              <TH>Nitelikli</TH>
              <TH>Niteliksiz</TH>
              <TH>Nitelik Oranı</TH>
              {summCurr && <TH>Firma</TH>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>
                {fmt(metrics.total)}
                {hasPrev && <DeltaBadge curr={metrics.total} prev={prevMetrics!.total} />}
              </TD>
              <TD bold green>
                {fmt(metrics.qualified)}
                {hasPrev && <DeltaBadge curr={metrics.qualified} prev={prevMetrics!.qualified} />}
              </TD>
              <TD bold red>
                {fmt(metrics.unqualified)}
                {hasPrev && <DeltaBadge curr={metrics.unqualified} prev={prevMetrics!.unqualified} />}
              </TD>
              <TD><QualBadge rate={metrics.qualRate} /></TD>
              {summCurr && <TD bold>{summCurr.data[3] ? fmt(num(summCurr.data[3]['Firma'])) : '—'}</TD>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['kanal', 'kampanya'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${view === v ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {v === 'kanal' ? 'Kanal Bazlı' : 'Kampanya Bazlı'}
          </button>
        ))}
      </div>

      {/* Channel view */}
      {view === 'kanal' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Kanal</TH>
                <TH right>Toplam</TH>
                <TH right>Nitelikli</TH>
                <TH right>Niteliksiz</TH>
                <TH right>Nitelik %</TH>
                {hasPrev && <TH right>Önceki Nitelikli</TH>}
                {hasPrev && <TH right>Değişim</TH>}
              </tr>
            </thead>
            <tbody>
              {metrics.channels.map((ch) => {
                const p = prevMetrics?.channels.find((c) => c.channel === ch.channel)
                return (
                  <tr key={ch.channel} className="hover:bg-slate-50/50">
                    <TD bold>{ch.channel}</TD>
                    <TD right bold>{fmt(ch.total)}</TD>
                    <TD right green>{fmt(ch.qualified)}</TD>
                    <TD right red>{fmt(ch.unqualified)}</TD>
                    <TD right><QualBadge rate={ch.qualRate} /></TD>
                    {hasPrev && <TD right>{p ? fmt(p.qualified) : '—'}</TD>}
                    {hasPrev && <TD right>{p ? <DeltaBadge curr={ch.qualified} prev={p.qualified} /> : '—'}</TD>}
                  </tr>
                )
              })}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <TD bold>TOPLAM</TD>
                <TD right bold>{fmt(metrics.total)}</TD>
                <TD right bold green>{fmt(metrics.qualified)}</TD>
                <TD right bold red>{fmt(metrics.unqualified)}</TD>
                <TD right><QualBadge rate={metrics.qualRate} /></TD>
                {hasPrev && <TD right bold>{fmt(prevMetrics!.qualified)}</TD>}
                {hasPrev && <TD right><DeltaBadge curr={metrics.qualified} prev={prevMetrics!.qualified} /></TD>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Campaign view */}
      {view === 'kampanya' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kampanya ara..." className="text-xs border border-slate-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
            <span className="text-xs text-slate-400">{filtered.length} kampanya</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <TH>Kampanya</TH>
                  <TH>Kanal</TH>
                  <TH right>Toplam</TH>
                  <TH right>Nitelikli</TH>
                  <TH right>Niteliksiz</TH>
                  <TH right>Nitelik %</TH>
                  {hasPrev && <TH right>Önceki Nitl.</TH>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const p = prevMetrics?.campaigns.find((x) => x.campaign === c.campaign)
                  return (
                    <tr key={c.campaign} className="hover:bg-slate-50/50">
                      <TD><span className="truncate max-w-[200px] block" title={c.campaign}>{c.campaign}</span></TD>
                      <TD>{c.channel}</TD>
                      <TD right bold>{fmt(c.total)}</TD>
                      <TD right green>{fmt(c.qualified)}</TD>
                      <TD right red>{fmt(c.unqualified)}</TD>
                      <TD right><QualBadge rate={c.qualRate} /></TD>
                      {hasPrev && <TD right>{p ? fmt(p.qualified) : '—'}{p ? <DeltaBadge curr={c.qualified} prev={p.qualified} /> : ''}</TD>}
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <TD bold colSpan={2}>TOPLAM</TD>
                  <TD right bold>{fmt(metrics.total)}</TD>
                  <TD right bold green>{fmt(metrics.qualified)}</TD>
                  <TD right bold red>{fmt(metrics.unqualified)}</TD>
                  <TD right><QualBadge rate={metrics.qualRate} /></TD>
                  {hasPrev && <TD right bold>{fmt(prevMetrics!.qualified)}</TD>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ads Tab ──────────────────────────────────────────────────────────────────

function AdsTab({ project, type }: { project: Project; type: 'google' | 'meta' }) {
  const curr = project.files.find((f) => f.file_type === type && !f.is_previous)
  const prev = project.files.find((f) => f.file_type === type && f.is_previous)
  const leadCurr = project.files.find((f) => f.file_type === 'lead_detail' && !f.is_previous)

  if (!curr) return <EmptySlot label={`${type === 'google' ? 'Google' : 'Meta'} Ads dosyası yükleyin`} />

  const metrics = type === 'google' ? buildGoogleMetrics(curr.data) : buildMetaMetrics(curr.data)
  const prevMetrics = prev ? (type === 'google' ? buildGoogleMetrics(prev.data) : buildMetaMetrics(prev.data)) : null
  const hasPrev = !!prevMetrics

  // Cross-reference with lead data
  const leadMetrics = leadCurr ? buildLeadMetrics(leadCurr.data) : null
  const channelName = type === 'google' ? 'Google Ads' : 'Meta / Facebook'
  const channelLeads = leadMetrics?.channels.find((c) => c.channel === channelName)

  const totSpend = metrics.reduce((s, r) => s + r.spend, 0)
  const totImpr = metrics.reduce((s, r) => s + r.impressions, 0)
  const totClicks = metrics.reduce((s, r) => s + r.clicks, 0)
  const totConv = metrics.reduce((s, r) => s + r.conversions, 0)
  const avgCTR = totImpr > 0 ? (totClicks / totImpr) * 100 : 0
  const avgCPC = totClicks > 0 ? totSpend / totClicks : 0

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Harcama</TH>
              <TH right>Gösterim</TH>
              <TH right>Tıklama</TH>
              <TH right>CTR</TH>
              <TH right>TBM</TH>
              {type === 'google' && <TH right>Dönüşüm</TH>}
              {channelLeads && <TH right>Lead</TH>}
              {channelLeads && <TH right>Nitelikli</TH>}
              {channelLeads && <TH right>Lead Maliyeti</TH>}
              {channelLeads && <TH right>Nitelikli Maliyet</TH>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>{cur(totSpend)}</TD>
              <TD right>{fmt(totImpr)}</TD>
              <TD right>{fmt(totClicks)}</TD>
              <TD right>{pct(avgCTR)}</TD>
              <TD right>{cur(avgCPC)}</TD>
              {type === 'google' && <TD right>{fmt(totConv)}</TD>}
              {channelLeads && <TD right bold>{fmt(channelLeads.total)}</TD>}
              {channelLeads && <TD right green bold>{fmt(channelLeads.qualified)}</TD>}
              {channelLeads && <TD right bold>{channelLeads.total > 0 ? cur(totSpend / channelLeads.total) : '—'}</TD>}
              {channelLeads && <TD right bold>{channelLeads.qualified > 0 ? cur(totSpend / channelLeads.qualified) : '—'}</TD>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Campaign table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Kampanya</TH>
                <TH right>Harcama</TH>
                <TH right>Gösterim</TH>
                <TH right>Tıklama</TH>
                <TH right>CTR %</TH>
                <TH right>TBM</TH>
                {type === 'google' && <TH right>Dönüşüm</TH>}
                {type === 'google' && <TH right>CPA</TH>}
                {hasPrev && <TH right>Önceki Harcama</TH>}
              </tr>
            </thead>
            <tbody>
              {metrics.map((r) => {
                const p = prevMetrics?.find((x) => x.campaign === r.campaign)
                return (
                  <tr key={r.campaign} className="hover:bg-slate-50/50">
                    <TD><span className="truncate max-w-[200px] block" title={r.campaign}>{r.campaign}</span></TD>
                    <TD right bold>{cur(r.spend)}</TD>
                    <TD right>{fmt(r.impressions)}</TD>
                    <TD right>{fmt(r.clicks)}</TD>
                    <TD right>{pct(r.ctr)}</TD>
                    <TD right>{cur(r.cpc)}</TD>
                    {type === 'google' && <TD right>{fmt(r.conversions)}</TD>}
                    {type === 'google' && <TD right>{r.cpa > 0 ? cur(r.cpa) : '—'}</TD>}
                    {hasPrev && <TD right>{p ? cur(p.spend) : '—'}{p ? <DeltaBadge curr={r.spend} prev={p.spend} /> : ''}</TD>}
                  </tr>
                )
              })}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <TD bold>TOPLAM</TD>
                <TD right bold>{cur(totSpend)}</TD>
                <TD right bold>{fmt(totImpr)}</TD>
                <TD right bold>{fmt(totClicks)}</TD>
                <TD right bold>{pct(avgCTR)}</TD>
                <TD right bold>{cur(avgCPC)}</TD>
                {type === 'google' && <TD right bold>{fmt(totConv)}</TD>}
                {type === 'google' && <TD right bold>{totConv > 0 ? cur(totSpend / totConv) : '—'}</TD>}
                {hasPrev && <TD right bold>{cur(prevMetrics!.reduce((s, r) => s + r.spend, 0))}</TD>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Cost Tab ─────────────────────────────────────────────────────────────────

function CostTab({ project }: { project: Project }) {
  const curr = project.files.find((f) => f.file_type === 'google_cost' && !f.is_previous)
  const prev = project.files.find((f) => f.file_type === 'google_cost' && f.is_previous)

  if (!curr) return <EmptySlot label="Google Maliyet CSV dosyası yükleyin (Kampanya raporu)" />

  const rows = buildGoogleCostMetrics(curr.data)
  const prevRows = prev ? buildGoogleCostMetrics(prev.data) : null

  const totSpend = rows.reduce((s, r) => s + r.spend, 0)
  const totImpr = rows.reduce((s, r) => s + r.impressions, 0)
  const totClicks = rows.reduce((s, r) => s + r.clicks, 0)
  const totConv = rows.reduce((s, r) => s + r.conversions, 0)
  const avgCTR = totImpr > 0 ? (totClicks / totImpr) * 100 : 0

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Toplam Harcama</TH>
              <TH right>Gösterim</TH>
              <TH right>Tıklama</TH>
              <TH right>Ort. CTR</TH>
              <TH right>Dönüşüm</TH>
              {totConv > 0 && <TH right>Dönüşüm Başı</TH>}
              {prevRows && <TH right>Önceki Harcama</TH>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>{cur(totSpend)}</TD>
              <TD right>{fmt(totImpr)}</TD>
              <TD right>{fmt(totClicks)}</TD>
              <TD right>{pct(avgCTR)}</TD>
              <TD right bold>{fmt(totConv, 2)}</TD>
              {totConv > 0 && <TD right bold>{cur(totSpend / totConv)}</TD>}
              {prevRows && (
                <TD right bold>
                  {cur(prevRows.reduce((s, r) => s + r.spend, 0))}
                  <DeltaBadge curr={totSpend} prev={prevRows.reduce((s, r) => s + r.spend, 0)} />
                </TD>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Campaign table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Kampanya</TH>
                <TH>Durum</TH>
                <TH right>Harcama</TH>
                <TH right>Gösterim</TH>
                <TH right>Tıklama</TH>
                <TH right>CTR %</TH>
                <TH right>Ort. TBM</TH>
                <TH right>Dönüşüm</TH>
                <TH right>Dönüşüm Başı</TH>
                {prevRows && <TH right>Önceki Harcama</TH>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = prevRows?.find((x) => x.campaign === r.campaign)
                const isActive = r.status === 'Etkin'
                return (
                  <tr key={r.campaign} className="hover:bg-slate-50/50">
                    <TD>
                      <span className="truncate max-w-[220px] block font-medium" title={r.campaign}>{r.campaign}</span>
                    </TD>
                    <TD>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.status || '—'}
                      </span>
                    </TD>
                    <TD right bold>{cur(r.spend)}</TD>
                    <TD right>{fmt(r.impressions)}</TD>
                    <TD right>{fmt(r.clicks)}</TD>
                    <TD right>{pct(r.ctr)}</TD>
                    <TD right>{cur(r.cpc)}</TD>
                    <TD right>{fmt(r.conversions, 2)}</TD>
                    <TD right>{r.cpa > 0 ? cur(r.cpa) : '—'}</TD>
                    {prevRows && (
                      <TD right>
                        {p ? cur(p.spend) : '—'}
                        {p ? <DeltaBadge curr={r.spend} prev={p.spend} /> : ''}
                      </TD>
                    )}
                  </tr>
                )
              })}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <TD bold colSpan={2}>TOPLAM</TD>
                <TD right bold>{cur(totSpend)}</TD>
                <TD right bold>{fmt(totImpr)}</TD>
                <TD right bold>{fmt(totClicks)}</TD>
                <TD right bold>{pct(avgCTR)}</TD>
                <TD right bold>{totClicks > 0 ? cur(totSpend / totClicks) : '—'}</TD>
                <TD right bold>{fmt(totConv, 2)}</TD>
                <TD right bold>{totConv > 0 ? cur(totSpend / totConv) : '—'}</TD>
                {prevRows && <TD right bold>{cur(prevRows.reduce((s, r) => s + r.spend, 0))}</TD>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-10 text-center">
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}

// ─── File Upload Slot ─────────────────────────────────────────────────────────

function FileSlot({ projectId, slot, file, prevFile, onUploaded, onDeleted }: {
  projectId: string
  slot: typeof FILE_SLOTS[0]
  file: ReportFile | undefined
  prevFile: ReportFile | undefined
  onUploaded: () => void
  onDeleted: (id: string) => void
}) {
  const [uploading, setUploading] = useState<'curr' | 'prev' | null>(null)
  const currRef = useRef<HTMLInputElement>(null)
  const prevRef = useRef<HTMLInputElement>(null)

  const upload = async (f: File, isPrevious: boolean) => {
    setUploading(isPrevious ? 'prev' : 'curr')
    try {
      const data = await parseFile(f)
      const id = crypto.randomUUID()
      await fetch(`/api/report-projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fileType: slot.type, isPrevious, fileName: f.name, data }),
      })
      onUploaded()
    } finally {
      setUploading(null)
    }
  }

  const del = async (id: string) => {
    await fetch(`/api/report-projects/${projectId}/files/${id}`, { method: 'DELETE' })
    onDeleted(id)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-xs font-semibold text-slate-700 mb-2">{slot.label}</p>
      <p className="text-[10px] text-slate-400 mb-2">{slot.hint}</p>

      {/* Current period */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-slate-500 w-16 shrink-0">Dönem</span>
        {file ? (
          <div className="flex items-center gap-1 flex-1 bg-green-50 border border-green-200 rounded-lg px-2 py-1">
            <span className="text-[10px] text-green-700 truncate flex-1">{file.file_name}</span>
            <button onClick={() => del(file.id)} className="text-slate-300 hover:text-red-400 text-xs ml-1">✕</button>
          </div>
        ) : (
          <>
            <input ref={currRef} type="file" accept={slot.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, false) }} />
            <button onClick={() => currRef.current?.click()} disabled={uploading === 'curr'}
              className="flex-1 text-[10px] border border-dashed border-slate-300 hover:border-blue-400 text-slate-500 hover:text-blue-600 rounded-lg px-2 py-1 transition-colors disabled:opacity-50">
              {uploading === 'curr' ? 'Yükleniyor...' : '+ Yükle'}
            </button>
          </>
        )}
      </div>

      {/* Previous period */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-16 shrink-0">Önceki</span>
        {prevFile ? (
          <div className="flex items-center gap-1 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[10px] text-slate-500 truncate flex-1">{prevFile.file_name}</span>
            <button onClick={() => del(prevFile.id)} className="text-slate-300 hover:text-red-400 text-xs ml-1">✕</button>
          </div>
        ) : (
          <>
            <input ref={prevRef} type="file" accept={slot.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, true) }} />
            <button onClick={() => prevRef.current?.click()} disabled={uploading === 'prev'}
              className="flex-1 text-[10px] border border-dashed border-slate-200 text-slate-400 hover:border-slate-400 rounded-lg px-2 py-1 transition-colors disabled:opacity-50">
              {uploading === 'prev' ? 'Yükleniyor...' : '+ Önceki dönem'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Project View ─────────────────────────────────────────────────────────────

function ProjectView({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const [activeTab, setActiveTab] = useState<'lead' | 'google' | 'meta' | 'cost' | 'files'>('files')
  const [showExport, setShowExport] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const hasLead = project.files.some((f) => f.file_type === 'lead_detail' && !f.is_previous)
  const hasGoogle = project.files.some((f) => f.file_type === 'google' && !f.is_previous)
  const hasMeta = project.files.some((f) => f.file_type === 'meta' && !f.is_previous)
  const hasCost = project.files.some((f) => f.file_type === 'google_cost' && !f.is_previous)

  // Close export dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const getFile = (type: FileType, prev: boolean) => project.files.find((f) => f.file_type === type && f.is_previous === prev)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-slate-200 flex-1">
          {[
            { key: 'files', label: '⚙ Dosyalar' },
            { key: 'lead', label: '📋 Lead Raporu', disabled: !hasLead },
            { key: 'google', label: '🔵 Google Ads', disabled: !hasGoogle },
            { key: 'meta', label: '🔷 Meta Ads', disabled: !hasMeta },
            { key: 'cost', label: '💰 Maliyet Raporu', disabled: !hasCost },
          ].map((t) => (
            <button key={t.key} onClick={() => !t.disabled && setActiveTab(t.key as typeof activeTab)}
              disabled={t.disabled}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'border-blue-600 text-blue-700' :
                t.disabled ? 'border-transparent text-slate-300 cursor-not-allowed' :
                'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Excel export */}
        <div className="relative ml-4 shrink-0" ref={exportRef}>
          <button onClick={() => setShowExport((v) => !v)}
            className="flex items-center gap-1.5 text-xs border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            ⬇ Excel
          </button>
          {showExport && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-1 min-w-[140px]">
              <button onClick={() => { exportExcel(project, 'screen'); setShowExport(false) }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-700">Ekran görünümü</button>
              <button onClick={() => { exportExcel(project, 'raw'); setShowExport(false) }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-700">Ham veri</button>
            </div>
          )}
        </div>
      </div>

      {/* Files panel */}
      {activeTab === 'files' && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {FILE_SLOTS.map((slot) => (
            <FileSlot
              key={slot.type}
              projectId={project.id}
              slot={slot}
              file={getFile(slot.type, false)}
              prevFile={getFile(slot.type, true)}
              onUploaded={onRefresh}
              onDeleted={onRefresh}
            />
          ))}
        </div>
      )}

      {activeTab === 'lead' && <LeadReportTab project={project} />}
      {activeTab === 'google' && <AdsTab project={project} type="google" />}
      {activeTab === 'meta' && <AdsTab project={project} type="meta" />}
      {activeTab === 'cost' && <CostTab project={project} />}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsClient() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPeriod, setNewPeriod] = useState<PeriodType>('monthly')
  const [showCreate, setShowCreate] = useState(false)

  const loadProjects = useCallback(async () => {
    const res = await fetch('/api/report-projects')
    if (!res.ok) return
    const { projects: list } = await res.json()
    const full: Project[] = await Promise.all(
      list.map(async (p: ProjectMeta) => {
        const r = await fetch(`/api/report-projects/${p.id}`)
        const { files } = await r.json()
        return { ...p, files: files ?? [] }
      })
    )
    setProjects(full)
    if (full.length > 0 && !activeProjectId) setActiveProjectId(full[0].id)
  }, [activeProjectId])

  useEffect(() => { loadProjects().finally(() => setLoading(false)) }, [])

  const createProject = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const id = crypto.randomUUID()
    await fetch('/api/report-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, projectName: newName.trim(), periodType: newPeriod }),
    })
    setNewName('')
    setShowCreate(false)
    setCreating(false)
    await loadProjects()
    setActiveProjectId(id)
  }

  const deleteProject = async (id: string) => {
    if (!confirm('Bu rapor projesini silmek istediğinize emin misiniz?')) return
    await fetch(`/api/report-projects/${id}`, { method: 'DELETE' })
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (activeProjectId === id) setActiveProjectId(projects.find((p) => p.id !== id)?.id ?? null)
  }

  const refreshProject = useCallback(async (projectId: string) => {
    const r = await fetch(`/api/report-projects/${projectId}`)
    const { files } = await r.json()
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, files: files ?? [] } : p))
  }, [])

  const activeProject = projects.find((p) => p.id === activeProjectId)

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Yükleniyor...</div>

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reklam Raporları</h1>
          <p className="text-sm text-slate-500 mt-0.5">Her rapor projesi için Lead, Google ve Meta verilerini birleştirin.</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Yeni Proje
        </button>
      </div>

      {/* Create project panel */}
      {showCreate && (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">Yeni Rapor Projesi</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Proje Adı</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createProject()}
                placeholder="Mayıs 2026, Q2 2026..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Dönem</label>
              <select value={newPeriod} onChange={(e) => setNewPeriod(e.target.value as PeriodType)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="monthly">Aylık</option>
                <option value="weekly">Haftalık</option>
              </select>
            </div>
            <button onClick={createProject} disabled={!newName.trim() || creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {creating ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">İptal</button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <p className="text-slate-400 text-sm">Henüz rapor projesi oluşturulmadı.</p>
          <p className="text-slate-400 text-xs mt-1">Yukarıdaki &quot;+ Yeni Proje&quot; butonuyla başlayın.</p>
        </div>
      ) : (
        <>
          {/* Project tabs */}
          <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center group shrink-0">
                <button onClick={() => setActiveProjectId(p.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeProjectId === p.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}>
                  <span className="text-xs text-slate-400">{p.period_type === 'monthly' ? '📅' : '📆'}</span>
                  {p.project_name}
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full ml-1">
                    {p.files.filter((f) => !f.is_previous).length}/4
                  </span>
                </button>
                <button onClick={() => deleteProject(p.id)}
                  className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs pb-2 pr-1" title="Sil">
                  ✕
                </button>
              </div>
            ))}
          </div>

          {activeProject && (
            <ProjectView project={activeProject} onRefresh={() => refreshProject(activeProject.id)} />
          )}
        </>
      )}
    </div>
  )
}
