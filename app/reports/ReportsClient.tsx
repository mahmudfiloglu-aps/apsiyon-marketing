'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

type FileType = 'lead_detail' | 'lead_summary' | 'google' | 'meta'
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
  { type: 'google', label: 'Google Ads', accept: '.csv', hint: 'Google Ads Kampanya raporu CSV' },
  { type: 'meta',   label: 'Meta Ads',  accept: '.csv', hint: 'Meta Ads export CSV' },
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
        // Strip BOM (U+FEFF) and normalise line endings
        const raw = (e.target?.result as string).replace(/^﻿/, '')
        const lines = raw.split(/\r?\n/)
        const firstLine = lines[0].trim()

        let csvText = raw
        // Google Ads "Kampanya raporu" — first two rows are title + date range
        if (/kampanya raporu/i.test(firstLine)) {
          const headerIdx = lines.findIndex((l, i) => i >= 1 && /kampanya durumu/i.test(l))
          csvText = lines.slice(headerIdx >= 0 ? headerIdx : 2).join('\n')
        }

        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (r) => {
            const rows = (r.data as Record<string, string>[]).filter((row) => {
              const camp = String(row['Kampanya'] ?? row['Kampanya Adı'] ?? '')
              return !camp.startsWith('Toplam') && camp !== '' && camp !== '--'
            })
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
  // Detect Turkish Kampanya raporu format via first actual data row's keys
  const sample = rows.find((r) => r['Kampanya'] && !r['Kampanya'].startsWith('Toplam'))
  const isTR = sample ? ('Maliyet' in sample || 'Göstr.' in sample) : false
  const map: Record<string, AdsMetrics> = {}
  for (const row of rows) {
    const camp = row['Kampanya'] ?? row['Campaign'] ?? 'Bilinmiyor'
    if (!map[camp]) map[camp] = { campaign: camp, impressions: 0, clicks: 0, ctr: 0, spend: 0, conversions: 0, cpc: 0, cpa: 0 }
    if (isTR) {
      map[camp].impressions += numTR(row['Göstr.'])
      map[camp].clicks      += numTR(row['Tıklamalar'])
      map[camp].spend       += numTR(row['Maliyet'])
      map[camp].conversions += numTR(row['Dönüşümler'])
    } else {
      map[camp].impressions += num(row['Impressions'] ?? row['Gösterim'])
      map[camp].clicks      += num(row['Clicks'] ?? row['Tıklama'])
      map[camp].spend       += num(row['Cost'] ?? row['Spend'])
      map[camp].conversions += num(row['Conversions'] ?? row['Dönüşüm'])
    }
  }
  return Object.values(map).map((r) => ({
    ...r,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions : 0,
  })).sort((a, b) => b.spend - a.spend)
}

interface MetaAdSetRow {
  adset: string
  resultType: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
}

interface MetaCampaignGroup {
  campaign: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
  adsets: MetaAdSetRow[]
}

function parseMetaNum(row: Record<string, string>, key: string): number {
  return num(row[key] ?? '')
}

function buildMetaHierarchy(rows: Record<string, string>[]): MetaCampaignGroup[] {
  const camps: Record<string, MetaCampaignGroup> = {}
  for (const row of rows) {
    const camp  = row['Kampanya Adı'] ?? row['Campaign name'] ?? 'Bilinmiyor'
    const adset = row['Reklam seti adı'] ?? row['Ad set name'] ?? 'Bilinmiyor'
    const impr  = parseMetaNum(row, 'Gösterim') || parseMetaNum(row, 'Impressions')
    const clicks = parseMetaNum(row, 'Bağlantı Tıklamaları') || parseMetaNum(row, 'Link clicks')
    const spend  = parseMetaNum(row, 'Harcanan Tutar (TRY)') || parseMetaNum(row, 'Amount spent (TRY)') || parseMetaNum(row, 'Amount spent')
    const conv   = parseMetaNum(row, 'Sonuçlar') || parseMetaNum(row, 'Results')
    const resultType = row['Sonuç Türü'] ?? row['Result type'] ?? ''

    if (!camps[camp]) camps[camp] = { campaign: camp, impressions: 0, clicks: 0, spend: 0, conversions: 0, ctr: 0, cpc: 0, adsets: [] }
    camps[camp].impressions += impr
    camps[camp].clicks      += clicks
    camps[camp].spend       += spend
    camps[camp].conversions += conv
    camps[camp].adsets.push({
      adset, resultType, impressions: impr, clicks, spend, conversions: conv,
      ctr: impr > 0 ? (clicks / impr) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    })
  }
  return Object.values(camps).map((c) => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    adsets: c.adsets.sort((a, b) => b.spend - a.spend),
  })).sort((a, b) => b.spend - a.spend)
}

// Keep flat version for backward-compat (lead cost cross-reference)
function buildMetaMetrics(rows: Record<string, string>[]): AdsMetrics[] {
  return buildMetaHierarchy(rows).map((c) => ({
    campaign: c.campaign, impressions: c.impressions, clicks: c.clicks,
    spend: c.spend, conversions: c.conversions, ctr: c.ctr, cpc: c.cpc,
    cpa: c.conversions > 0 ? c.spend / c.conversions : 0,
  }))
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
    .filter((r) => r['Kampanya'] && r['Kampanya'].trim() !== '' && r['Kampanya'].trim() !== '--' && !r['Kampanya'].startsWith('Toplam'))
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

// ─── Summary file totals ──────────────────────────────────────────────────────

interface SummaryTotals {
  total: number
  qualified: number
  unqualified: number
  firma: number
}

function buildSummaryTotals(rows: Record<string, string>[]): SummaryTotals {
  let total = 0, qualified = 0, unqualified = 0, firma = 0
  for (const r of rows) {
    total      += num(r['Lead'])
    qualified  += num(r['Nitelikli Lead'])
    unqualified += num(r['Niteliksiz Lead'])
    firma      += num(r['Firma'])
  }
  return { total, qualified, unqualified, firma }
}

// ─── Lead Report Tab ──────────────────────────────────────────────────────────

function LeadReportTab({ project }: { project: Project }) {
  const curr     = project.files.find((f) => f.file_type === 'lead_detail'  && !f.is_previous)
  const prev     = project.files.find((f) => f.file_type === 'lead_detail'  && f.is_previous)
  const summCurr = project.files.find((f) => f.file_type === 'lead_summary' && !f.is_previous)
  const summPrev = project.files.find((f) => f.file_type === 'lead_summary' && f.is_previous)

  if (!curr && !summCurr) return <EmptySlot label="Lead Detaylı veya Lead Özeti dosyası yükleyin" />

  const detailMetrics = curr ? buildLeadMetrics(curr.data) : null
  const prevDetailMetrics = prev ? buildLeadMetrics(prev.data) : null

  // Authoritative totals: summary file takes precedence over detail calculation
  const summTotals     = summCurr ? buildSummaryTotals(summCurr.data) : null
  const prevSummTotals = summPrev ? buildSummaryTotals(summPrev.data) : null

  const totalLead      = summTotals?.total      ?? detailMetrics?.total      ?? 0
  const totalQualified = summTotals?.qualified   ?? detailMetrics?.qualified  ?? 0
  const totalUnqual    = summTotals?.unqualified ?? detailMetrics?.unqualified ?? 0
  const totalFirma     = summTotals?.firma       ?? 0
  const qualRate       = totalLead > 0 ? (totalQualified / totalLead) * 100 : 0

  const prevTotal      = prevSummTotals?.total      ?? prevDetailMetrics?.total      ?? null
  const prevQualified  = prevSummTotals?.qualified   ?? prevDetailMetrics?.qualified  ?? null

  const hasPrev = prevTotal !== null
  const [view, setView] = useState<'kampanya' | 'kanal'>('kanal')
  const [search, setSearch] = useState('')

  const filtered = (detailMetrics?.campaigns ?? []).filter((c) => !search || c.campaign.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Summary strip — numbers always from summary file when available */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Toplam Lead</TH>
              <TH>Nitelikli</TH>
              <TH>Niteliksiz</TH>
              <TH>Nitelik Oranı</TH>
              {totalFirma > 0 && <TH>Firma</TH>}
              {summCurr && <span className="hidden" />}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>
                {fmt(totalLead)}
                {hasPrev && prevTotal !== null && <DeltaBadge curr={totalLead} prev={prevTotal} />}
              </TD>
              <TD bold green>
                {fmt(totalQualified)}
                {hasPrev && prevQualified !== null && <DeltaBadge curr={totalQualified} prev={prevQualified} />}
              </TD>
              <TD bold red>
                {fmt(totalUnqual)}
              </TD>
              <TD><QualBadge rate={qualRate} /></TD>
              {totalFirma > 0 && <TD bold>{fmt(totalFirma)}</TD>}
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

      {/* Channel view — breakdown from detail file, totals from summary */}
      {view === 'kanal' && detailMetrics && (
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
              {detailMetrics.channels.map((ch) => {
                const p = prevDetailMetrics?.channels.find((c) => c.channel === ch.channel)
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
              {/* Toplam satırı: özet dosyası varsa ondan al */}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <TD bold>TOPLAM</TD>
                <TD right bold>{fmt(totalLead)}</TD>
                <TD right bold green>{fmt(totalQualified)}</TD>
                <TD right bold red>{fmt(totalUnqual)}</TD>
                <TD right><QualBadge rate={qualRate} /></TD>
                {hasPrev && prevQualified !== null && <TD right bold>{fmt(prevQualified)}</TD>}
                {hasPrev && prevQualified !== null && <TD right><DeltaBadge curr={totalQualified} prev={prevQualified} /></TD>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {view === 'kanal' && !detailMetrics && (
        <EmptySlot label="Kanal dağılımı için Lead Detaylı dosyası gerekli" />
      )}

      {/* Campaign view */}
      {view === 'kampanya' && detailMetrics && (
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
                  const p = prevDetailMetrics?.campaigns.find((x) => x.campaign === c.campaign)
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
                  <TD right bold>{fmt(totalLead)}</TD>
                  <TD right bold green>{fmt(totalQualified)}</TD>
                  <TD right bold red>{fmt(totalUnqual)}</TD>
                  <TD right><QualBadge rate={qualRate} /></TD>
                  {hasPrev && prevQualified !== null && <TD right bold>{fmt(prevQualified)}</TD>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view === 'kampanya' && !detailMetrics && (
        <EmptySlot label="Kampanya dağılımı için Lead Detaylı dosyası gerekli" />
      )}
    </div>
  )
}

// ─── Shared lead cross-reference helper ──────────────────────────────────────

function useLeadCrossRef(project: Project, channelName: string) {
  const leadCurr   = project.files.find((f) => f.file_type === 'lead_detail'  && !f.is_previous)
  const leadSumm   = project.files.find((f) => f.file_type === 'lead_summary' && !f.is_previous)
  const detailMetrics = leadCurr ? buildLeadMetrics(leadCurr.data) : null
  const summTotals    = leadSumm  ? buildSummaryTotals(leadSumm.data)  : null
  const ch = detailMetrics?.channels.find((c) => c.channel === channelName)
  if (!ch) return null
  // If summary is available and this is the only channel, use its qualified count
  const qualified = (summTotals && detailMetrics && detailMetrics.channels.length === 1)
    ? summTotals.qualified
    : ch.qualified
  return { total: ch.total, qualified }
}

// ─── Google Ads Tab ───────────────────────────────────────────────────────────

function GoogleAdsTab({ project }: { project: Project }) {
  const curr = project.files.find((f) => f.file_type === 'google' && !f.is_previous)
  const prev = project.files.find((f) => f.file_type === 'google' && f.is_previous)
  if (!curr) return <EmptySlot label="Google Ads CSV dosyasını yükleyin" />

  const metrics     = buildGoogleMetrics(curr.data)
  const prevMetrics = prev ? buildGoogleMetrics(prev.data) : null
  const channelLeads = useLeadCrossRef(project, 'Google Ads')

  const totSpend  = metrics.reduce((s, r) => s + r.spend, 0)
  const totImpr   = metrics.reduce((s, r) => s + r.impressions, 0)
  const totClicks = metrics.reduce((s, r) => s + r.clicks, 0)
  const totConv   = metrics.reduce((s, r) => s + r.conversions, 0)
  const avgCTR    = totImpr   > 0 ? (totClicks / totImpr)  * 100 : 0
  const avgCPC    = totClicks > 0 ? totSpend   / totClicks : 0

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Harcama</TH><TH right>Gösterim</TH><TH right>Tıklama</TH>
              <TH right>CTR</TH><TH right>TBM</TH><TH right>Dönüşüm</TH>
              {channelLeads && <TH right>Lead</TH>}
              {channelLeads && <TH right>Nitelikli</TH>}
              {channelLeads && <TH right>Lead Maliyeti</TH>}
              {channelLeads && <TH right>Nitelikli Maliyet</TH>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>{cur(totSpend)}</TD>
              <TD right>{fmt(totImpr)}</TD><TD right>{fmt(totClicks)}</TD>
              <TD right>{pct(avgCTR)}</TD><TD right>{cur(avgCPC)}</TD>
              <TD right>{fmt(totConv)}</TD>
              {channelLeads && <TD right bold>{fmt(channelLeads.total)}</TD>}
              {channelLeads && <TD right green bold>{fmt(channelLeads.qualified)}</TD>}
              {channelLeads && <TD right bold>{channelLeads.total > 0 ? cur(totSpend / channelLeads.total) : '—'}</TD>}
              {channelLeads && <TD right bold>{channelLeads.qualified > 0 ? cur(totSpend / channelLeads.qualified) : '—'}</TD>}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Kampanya</TH>
                <TH right>Harcama</TH><TH right>Gösterim</TH><TH right>Tıklama</TH>
                <TH right>CTR %</TH><TH right>TBM</TH><TH right>Dönüşüm</TH><TH right>CPA</TH>
                {prevMetrics && <TH right>Önceki Harcama</TH>}
              </tr>
            </thead>
            <tbody>
              {metrics.map((r) => {
                const p = prevMetrics?.find((x) => x.campaign === r.campaign)
                return (
                  <tr key={r.campaign} className="hover:bg-slate-50/50">
                    <TD><span className="truncate max-w-[220px] block" title={r.campaign}>{r.campaign}</span></TD>
                    <TD right bold>{cur(r.spend)}</TD>
                    <TD right>{fmt(r.impressions)}</TD><TD right>{fmt(r.clicks)}</TD>
                    <TD right>{pct(r.ctr)}</TD><TD right>{cur(r.cpc)}</TD>
                    <TD right>{fmt(r.conversions)}</TD>
                    <TD right>{r.cpa > 0 ? cur(r.cpa) : '—'}</TD>
                    {prevMetrics && <TD right>{p ? cur(p.spend) : '—'}{p ? <DeltaBadge curr={r.spend} prev={p.spend} /> : ''}</TD>}
                  </tr>
                )
              })}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <TD bold>TOPLAM</TD>
                <TD right bold>{cur(totSpend)}</TD>
                <TD right bold>{fmt(totImpr)}</TD><TD right bold>{fmt(totClicks)}</TD>
                <TD right bold>{pct(avgCTR)}</TD><TD right bold>{cur(avgCPC)}</TD>
                <TD right bold>{fmt(totConv)}</TD>
                <TD right bold>{totConv > 0 ? cur(totSpend / totConv) : '—'}</TD>
                {prevMetrics && <TD right bold>{cur(prevMetrics.reduce((s, r) => s + r.spend, 0))}</TD>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Meta Ads Tab (hierarchical: campaign → ad sets) ─────────────────────────

function MetaAdsTab({ project }: { project: Project }) {
  const curr = project.files.find((f) => f.file_type === 'meta' && !f.is_previous)
  const prev = project.files.find((f) => f.file_type === 'meta' && f.is_previous)
  if (!curr) return <EmptySlot label="Meta Ads CSV dosyasını yükleyin" />

  const groups     = buildMetaHierarchy(curr.data)
  const prevGroups = prev ? buildMetaHierarchy(prev.data) : null
  const channelLeads = useLeadCrossRef(project, 'Meta / Facebook')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const totSpend  = groups.reduce((s, g) => s + g.spend, 0)
  const totImpr   = groups.reduce((s, g) => s + g.impressions, 0)
  const totClicks = groups.reduce((s, g) => s + g.clicks, 0)
  const totConv   = groups.reduce((s, g) => s + g.conversions, 0)
  const avgCTR    = totImpr   > 0 ? (totClicks / totImpr)  * 100 : 0
  const avgCPC    = totClicks > 0 ? totSpend   / totClicks : 0

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Harcama</TH><TH right>Gösterim</TH><TH right>Tıklama</TH>
              <TH right>CTR</TH><TH right>TBM</TH><TH right>Sonuç</TH>
              {channelLeads && <TH right>Lead</TH>}
              {channelLeads && <TH right>Nitelikli</TH>}
              {channelLeads && <TH right>Lead Maliyeti</TH>}
              {channelLeads && <TH right>Nitelikli Maliyet</TH>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>{cur(totSpend)}</TD>
              <TD right>{fmt(totImpr)}</TD><TD right>{fmt(totClicks)}</TD>
              <TD right>{pct(avgCTR)}</TD><TD right>{cur(avgCPC)}</TD>
              <TD right>{fmt(totConv)}</TD>
              {channelLeads && <TD right bold>{fmt(channelLeads.total)}</TD>}
              {channelLeads && <TD right green bold>{fmt(channelLeads.qualified)}</TD>}
              {channelLeads && <TD right bold>{channelLeads.total > 0 ? cur(totSpend / channelLeads.total) : '—'}</TD>}
              {channelLeads && <TD right bold>{channelLeads.qualified > 0 ? cur(totSpend / channelLeads.qualified) : '—'}</TD>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Campaign → ad set hierarchy */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <TH>Kampanya / Reklam Seti</TH>
                <TH right>Harcama</TH><TH right>Gösterim</TH><TH right>Tıklama</TH>
                <TH right>CTR %</TH><TH right>TBM</TH><TH right>Sonuç</TH>
                {prevGroups && <TH right>Önceki Harcama</TH>}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expanded.has(g.campaign)
                const pg = prevGroups?.find((x) => x.campaign === g.campaign)
                return (
                  <React.Fragment key={g.campaign}>
                    {/* Campaign row */}
                    <tr className="bg-slate-50/60 hover:bg-slate-100/60 border-b border-slate-200">
                      <td className="px-3 py-1.5 text-xs font-semibold text-slate-700">
                        <button onClick={() => toggle(g.campaign)} className="mr-1.5 text-slate-400 hover:text-blue-600 font-mono select-none">
                          {isOpen ? '⊟' : '⊞'}
                        </button>
                        <span className="truncate max-w-[200px] inline-block align-middle" title={g.campaign}>{g.campaign}</span>
                        <span className="ml-1.5 text-[10px] text-slate-400 font-normal">({g.adsets.length} set)</span>
                      </td>
                      <TD right bold>{cur(g.spend)}</TD>
                      <TD right>{fmt(g.impressions)}</TD><TD right>{fmt(g.clicks)}</TD>
                      <TD right>{pct(g.ctr)}</TD><TD right>{cur(g.cpc)}</TD>
                      <TD right bold>{fmt(g.conversions)}</TD>
                      {prevGroups && <TD right>{pg ? cur(pg.spend) : '—'}{pg ? <DeltaBadge curr={g.spend} prev={pg.spend} /> : ''}</TD>}
                    </tr>
                    {/* Ad set rows (shown when expanded) */}
                    {isOpen && g.adsets.map((a) => (
                      <tr key={a.adset} className="hover:bg-blue-50/20 border-b border-slate-100">
                        <td className="px-3 py-1 text-xs text-slate-600 pl-8">
                          <span className="truncate max-w-[200px] block" title={a.adset}>{a.adset}</span>
                          {a.resultType && <span className="text-[10px] text-slate-400">{a.resultType}</span>}
                        </td>
                        <TD right>{cur(a.spend)}</TD>
                        <TD right>{fmt(a.impressions)}</TD><TD right>{fmt(a.clicks)}</TD>
                        <TD right>{pct(a.ctr)}</TD><TD right>{cur(a.cpc)}</TD>
                        <TD right>{fmt(a.conversions)}</TD>
                        {prevGroups && <TD right>—</TD>}
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <TD bold>TOPLAM</TD>
                <TD right bold>{cur(totSpend)}</TD>
                <TD right bold>{fmt(totImpr)}</TD><TD right bold>{fmt(totClicks)}</TD>
                <TD right bold>{pct(avgCTR)}</TD><TD right bold>{cur(avgCPC)}</TD>
                <TD right bold>{fmt(totConv)}</TD>
                {prevGroups && <TD right bold>{cur(prevGroups.reduce((s, g) => s + g.spend, 0))}</TD>}
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
  const gCurr = project.files.find((f) => f.file_type === 'google' && !f.is_previous)
  const gPrev = project.files.find((f) => f.file_type === 'google' && f.is_previous)
  const mCurr = project.files.find((f) => f.file_type === 'meta'   && !f.is_previous)
  const mPrev = project.files.find((f) => f.file_type === 'meta'   && f.is_previous)

  if (!gCurr && !mCurr) return <EmptySlot label="Google Ads veya Meta Ads CSV dosyasını yükleyin" />

  const gRows    = gCurr ? buildGoogleCostMetrics(gCurr.data) : []
  const gPrevRows = gPrev ? buildGoogleCostMetrics(gPrev.data) : null
  const mGroups   = mCurr ? buildMetaHierarchy(mCurr.data) : []
  const mPrevGroups = mPrev ? buildMetaHierarchy(mPrev.data) : null

  const gSpend  = gRows.reduce((s, r) => s + r.spend, 0)
  const gImpr   = gRows.reduce((s, r) => s + r.impressions, 0)
  const gClicks = gRows.reduce((s, r) => s + r.clicks, 0)
  const gConv   = gRows.reduce((s, r) => s + r.conversions, 0)

  const mSpend  = mGroups.reduce((s, g) => s + g.spend, 0)
  const mImpr   = mGroups.reduce((s, g) => s + g.impressions, 0)
  const mClicks = mGroups.reduce((s, g) => s + g.clicks, 0)
  const mConv   = mGroups.reduce((s, g) => s + g.conversions, 0)

  const totSpend  = gSpend + mSpend
  const totImpr   = gImpr  + mImpr
  const totClicks = gClicks + mClicks
  const totConv   = gConv  + mConv
  const avgCTR    = totImpr > 0 ? (totClicks / totImpr) * 100 : 0

  const prevTotSpend = (gPrevRows ? gPrevRows.reduce((s, r) => s + r.spend, 0) : 0)
                     + (mPrevGroups ? mPrevGroups.reduce((s, g) => s + g.spend, 0) : 0)

  return (
    <div className="space-y-3">
      {/* Combined summary strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <TH>Toplam Harcama</TH>
              {gCurr && mCurr && <TH right>Google</TH>}
              {gCurr && mCurr && <TH right>Meta</TH>}
              <TH right>Gösterim</TH>
              <TH right>Tıklama</TH>
              <TH right>Ort. CTR</TH>
              <TH right>Dönüşüm</TH>
              {totConv > 0 && <TH right>Dönüşüm Başı</TH>}
              {(gPrevRows || mPrevGroups) && <TH right>Önceki Harcama</TH>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TD bold>{cur(totSpend)}</TD>
              {gCurr && mCurr && <TD right>{cur(gSpend)}</TD>}
              {gCurr && mCurr && <TD right>{cur(mSpend)}</TD>}
              <TD right>{fmt(totImpr)}</TD>
              <TD right>{fmt(totClicks)}</TD>
              <TD right>{pct(avgCTR)}</TD>
              <TD right bold>{fmt(totConv, 2)}</TD>
              {totConv > 0 && <TD right bold>{cur(totSpend / totConv)}</TD>}
              {(gPrevRows || mPrevGroups) && (
                <TD right bold>
                  {cur(prevTotSpend)}
                  <DeltaBadge curr={totSpend} prev={prevTotSpend} />
                </TD>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Google campaign table */}
      {gCurr && gRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">🔵 Google Ads Kampanyaları</span>
            <span className="text-[10px] text-slate-400">{gRows.length} kampanya · {cur(gSpend)}</span>
          </div>
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
                  {gPrevRows && <TH right>Önceki Harcama</TH>}
                </tr>
              </thead>
              <tbody>
                {gRows.map((r) => {
                  const p = gPrevRows?.find((x) => x.campaign === r.campaign)
                  const isActive = r.status === 'Etkin'
                  return (
                    <tr key={r.campaign} className="hover:bg-slate-50/50">
                      <TD><span className="truncate max-w-[220px] block font-medium" title={r.campaign}>{r.campaign}</span></TD>
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
                      {gPrevRows && <TD right>{p ? cur(p.spend) : '—'}{p ? <DeltaBadge curr={r.spend} prev={p.spend} /> : ''}</TD>}
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <TD bold colSpan={2}>TOPLAM</TD>
                  <TD right bold>{cur(gSpend)}</TD>
                  <TD right bold>{fmt(gImpr)}</TD>
                  <TD right bold>{fmt(gClicks)}</TD>
                  <TD right bold>{gImpr > 0 ? pct((gClicks / gImpr) * 100) : '—'}</TD>
                  <TD right bold>{gClicks > 0 ? cur(gSpend / gClicks) : '—'}</TD>
                  <TD right bold>{fmt(gConv, 2)}</TD>
                  <TD right bold>{gConv > 0 ? cur(gSpend / gConv) : '—'}</TD>
                  {gPrevRows && <TD right bold>{cur(gPrevRows.reduce((s, r) => s + r.spend, 0))}</TD>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Meta campaign table */}
      {mCurr && mGroups.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">🔷 Meta Ads Kampanyaları</span>
            <span className="text-[10px] text-slate-400">{mGroups.length} kampanya · {cur(mSpend)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <TH>Kampanya</TH>
                  <TH right>Harcama</TH>
                  <TH right>Gösterim</TH>
                  <TH right>Tıklama</TH>
                  <TH right>CTR %</TH>
                  <TH right>Ort. TBM</TH>
                  <TH right>Sonuç</TH>
                  <TH right>Sonuç Başı</TH>
                  {mPrevGroups && <TH right>Önceki Harcama</TH>}
                </tr>
              </thead>
              <tbody>
                {mGroups.map((g) => {
                  const pg = mPrevGroups?.find((x) => x.campaign === g.campaign)
                  const cpa = g.conversions > 0 ? g.spend / g.conversions : 0
                  return (
                    <tr key={g.campaign} className="hover:bg-slate-50/50">
                      <TD><span className="truncate max-w-[220px] block font-medium" title={g.campaign}>{g.campaign}</span></TD>
                      <TD right bold>{cur(g.spend)}</TD>
                      <TD right>{fmt(g.impressions)}</TD>
                      <TD right>{fmt(g.clicks)}</TD>
                      <TD right>{pct(g.ctr)}</TD>
                      <TD right>{cur(g.cpc)}</TD>
                      <TD right>{fmt(g.conversions)}</TD>
                      <TD right>{cpa > 0 ? cur(cpa) : '—'}</TD>
                      {mPrevGroups && <TD right>{pg ? cur(pg.spend) : '—'}{pg ? <DeltaBadge curr={g.spend} prev={pg.spend} /> : ''}</TD>}
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <TD bold>TOPLAM</TD>
                  <TD right bold>{cur(mSpend)}</TD>
                  <TD right bold>{fmt(mImpr)}</TD>
                  <TD right bold>{fmt(mClicks)}</TD>
                  <TD right bold>{mImpr > 0 ? pct((mClicks / mImpr) * 100) : '—'}</TD>
                  <TD right bold>{mClicks > 0 ? cur(mSpend / mClicks) : '—'}</TD>
                  <TD right bold>{fmt(mConv)}</TD>
                  <TD right bold>{mConv > 0 ? cur(mSpend / mConv) : '—'}</TD>
                  {mPrevGroups && <TD right bold>{cur(mPrevGroups.reduce((s, g) => s + g.spend, 0))}</TD>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  onDeleted: () => void
}) {
  const [uploading, setUploading] = useState<'curr' | 'prev' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const currRef = useRef<HTMLInputElement>(null)
  const prevRef = useRef<HTMLInputElement>(null)

  const upload = async (f: File, isPrevious: boolean) => {
    setUploading(isPrevious ? 'prev' : 'curr')
    try {
      const data = await parseFile(f)
      const id = crypto.randomUUID()
      const res = await fetch(`/api/report-projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fileType: slot.type, isPrevious, fileName: f.name, data }),
      })
      if (res.ok) onUploaded()
    } finally {
      setUploading(null)
    }
  }

  const del = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/report-projects/${projectId}/files/${id}`, { method: 'DELETE' })
      if (res.ok) onDeleted()
    } finally {
      setDeleting(null)
    }
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
            <button
              onClick={(e) => { e.stopPropagation(); del(file.id) }}
              disabled={deleting === file.id}
              className="text-slate-300 hover:text-red-400 text-xs ml-1 disabled:opacity-40 shrink-0"
            >{deleting === file.id ? '…' : '✕'}</button>
          </div>
        ) : (
          <>
            <input ref={currRef} type="file" accept={slot.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload(f, false); e.target.value = '' } }} />
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
            <button
              onClick={(e) => { e.stopPropagation(); del(prevFile.id) }}
              disabled={deleting === prevFile.id}
              className="text-slate-300 hover:text-red-400 text-xs ml-1 disabled:opacity-40 shrink-0"
            >{deleting === prevFile.id ? '…' : '✕'}</button>
          </div>
        ) : (
          <>
            <input ref={prevRef} type="file" accept={slot.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload(f, true); e.target.value = '' } }} />
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
  const hasCost = project.files.some((f) => (f.file_type === 'google' || f.file_type === 'meta') && !f.is_previous)

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {activeTab === 'lead'   && <LeadReportTab project={project} />}
      {activeTab === 'google' && <GoogleAdsTab  project={project} />}
      {activeTab === 'meta'   && <MetaAdsTab    project={project} />}
      {activeTab === 'cost'   && <CostTab        project={project} />}
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
    const r = await fetch(`/api/report-projects/${projectId}`, { cache: 'no-store' })
    if (!r.ok) return
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
