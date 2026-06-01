'use client'

import { useMemo, useState } from 'react'
import type { AnalyzedLead } from '@/types/lead'

export interface FilterState {
  search: string
  campaign: string
  salesRep: string
  city: string
  recordType: string
  minQuality: number
  confidence: string
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  campaign: '',
  salesRep: '',
  city: '',
  recordType: '',
  minQuality: 0,
  confidence: '',
}

export function applyFilters(leads: AnalyzedLead[], filters: FilterState): AnalyzedLead[] {
  return leads.filter((l) => {
    const { lead, analysisResult } = l

    if (filters.search) {
      const q = filters.search.toLowerCase()
      const searchable = [
        lead['İlgili Kişi'],
        lead['Hesap Adı'],
        lead['Son Aktivite Açıklaması'],
        lead['Son Aktivite Başlığı'],
      ].join(' ').toLowerCase()
      if (!searchable.includes(q)) return false
    }

    if (filters.campaign && lead['Başvuru Kampanyası'] !== filters.campaign) return false
    if (filters.salesRep && lead['Satış Temsilcisi'] !== filters.salesRep) return false
    if (filters.city && lead['Şehir'] !== filters.city) return false

    if (filters.recordType) {
      const rt = lead['Kayıt Tipi'] || lead['Hesap Tipi'] || ''
      if (rt !== filters.recordType) return false
    }

    if (filters.minQuality > 0) {
      const score = analysisResult?.qualityScore ?? 0
      if (score < filters.minQuality) return false
    }

    if (filters.confidence && analysisResult?.confidence !== filters.confidence) return false

    return true
  })
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))].sort()
}

interface Props {
  leads: AnalyzedLead[]
  filters: FilterState
  onChange: (f: FilterState) => void
  resultCount: number
}

export default function FilterPanel({ leads, filters, onChange, resultCount }: Props) {
  const [open, setOpen] = useState(false)

  const options = useMemo(() => ({
    campaigns: unique(leads.map((l) => l.lead['Başvuru Kampanyası'])),
    salesReps: unique(leads.map((l) => l.lead['Satış Temsilcisi'])),
    cities: unique(leads.map((l) => l.lead['Şehir'])),
    recordTypes: unique(leads.map((l) => l.lead['Kayıt Tipi'] || l.lead['Hesap Tipi'])),
  }), [leads])

  const activeCount = Object.entries(filters).filter(([k, v]) =>
    k === 'minQuality' ? (v as number) > 0 : v !== ''
  ).length

  const set = (key: keyof FilterState, value: string | number) =>
    onChange({ ...filters, [key]: value })

  const clear = () => onChange(EMPTY_FILTERS)

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-2">
        {/* Search — always visible */}
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="İsim, şirket, not ara..."
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${
            open || activeCount > 0
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⚙ Filtreler
          {activeCount > 0 && (
            <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${open ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'}`}>
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Temizle
          </button>
        )}

        <span className="text-sm text-gray-400 ml-auto">{resultCount} sonuç</span>
      </div>

      {open && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* Campaign */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Kampanya</label>
            <select
              value={filters.campaign}
              onChange={(e) => set('campaign', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Tümü</option>
              {options.campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Sales Rep */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Satış Temsilcisi</label>
            <select
              value={filters.salesRep}
              onChange={(e) => set('salesRep', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Tümü</option>
              {options.salesReps.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Şehir</label>
            <select
              value={filters.city}
              onChange={(e) => set('city', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Tümü</option>
              {options.cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Record Type */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Kayıt Tipi</label>
            <select
              value={filters.recordType}
              onChange={(e) => set('recordType', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Tümü</option>
              {options.recordTypes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Confidence */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">AI Güveni</label>
            <select
              value={filters.confidence}
              onChange={(e) => set('confidence', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Tümü</option>
              <option value="Yüksek">Yüksek</option>
              <option value="Orta">Orta</option>
              <option value="Düşük">Düşük</option>
            </select>
          </div>

          {/* Min Quality Score */}
          <div className="col-span-2 md:col-span-3 xl:col-span-5">
            <label className="text-xs font-semibold text-gray-500 mb-2 block">
              Min. Kalite Puanı: {filters.minQuality > 0 ? `★ ${filters.minQuality}+` : 'Tümü'}
            </label>
            <div className="flex gap-1.5">
              {[0, 3, 5, 7, 9].map((v) => (
                <button
                  key={v}
                  onClick={() => set('minQuality', v)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    filters.minQuality === v
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v === 0 ? 'Tümü' : `★ ${v}+`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
