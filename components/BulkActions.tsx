'use client'

import { useState } from 'react'
import type { AnalyzedLead, SuggestedStatus } from '@/types/lead'

const ALL_STATUSES: SuggestedStatus[] = [
  'Yeniden Değerlendir', 'Yanlış Kayıt', 'Yetersiz Not', 'Belirsiz', 'Check Pass',
]

interface Props {
  filteredLeads: AnalyzedLead[]
  onBulkDecision: (leadIds: string[], decision: 'confirmed' | 'rejected') => void
  onBulkOverride: (leadIds: string[], status: SuggestedStatus) => void
}

export default function BulkActions({ filteredLeads, onBulkDecision, onBulkOverride }: Props) {
  const [showMove, setShowMove] = useState(false)
  const ids = filteredLeads.map((l) => l.lead['ID']).filter(Boolean)

  if (!ids.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm">
      <span className="text-blue-700 font-medium shrink-0">
        Toplu İşlem ({ids.length} lead):
      </span>
      <button
        onClick={() => onBulkDecision(ids, 'confirmed')}
        className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium"
      >
        ✓ Tümü AI Doğru
      </button>
      <button
        onClick={() => onBulkDecision(ids, 'rejected')}
        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
      >
        ✗ Tümü AI Hatalı
      </button>
      <div className="relative">
        <button
          onClick={() => setShowMove((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
        >
          ↕ Kategoriye Taşı ▾
        </button>
        {showMove && (
          <div className="absolute left-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg p-2 flex flex-col gap-1 min-w-max">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => { onBulkOverride(ids, s); setShowMove(false) }}
                className="text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
