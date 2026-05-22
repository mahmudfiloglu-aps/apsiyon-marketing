'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LeadCard from '@/components/LeadCard'
import EmailComposer from '@/components/EmailComposer'
import ExportButton from '@/components/ExportButton'
import type { AnalyzedLead, AnalysisResult, LeadRow } from '@/types/lead'

export default function ResultsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<AnalyzedLead[]>([])
  const [decisions, setDecisions] = useState<Record<string, 'confirmed' | 'rejected'>>({})
  const [filter, setFilter] = useState('Tümü')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem('analysisData')
    if (!raw) { router.replace('/'); return }

    const { leads: rawLeads, results } = JSON.parse(raw) as {
      leads: LeadRow[]
      results: Record<string, AnalysisResult | { error: string }>
    }

    const merged: AnalyzedLead[] = rawLeads.map((lead) => {
      const result = results[lead['ID']]
      if (!result) return { lead }
      if ('error' in result) return { lead, analysisError: result.error }
      return { lead, analysisResult: result as AnalysisResult }
    })

    setLeads(merged)
    setLoading(false)
  }, [router])

  const handleDecision = (leadId: string, decision: 'confirmed' | 'rejected') => {
    setDecisions((prev) => {
      if (prev[leadId] === decision) {
        const next = { ...prev }
        delete next[leadId]
        return next
      }
      return { ...prev, [leadId]: decision }
    })
  }

  const filtered = leads.filter(({ analysisResult }) => {
    if (filter === 'Tümü') return true
    return analysisResult?.suggestedStatus === filter
  })

  const counts = {
    'Yeniden Değerlendir': leads.filter(
      (l) => l.analysisResult?.suggestedStatus === 'Yeniden Değerlendir'
    ).length,
    'Onayla Olumsuz': leads.filter(
      (l) => l.analysisResult?.suggestedStatus === 'Onayla Olumsuz'
    ).length,
    Belirsiz: leads.filter(
      (l) => l.analysisResult?.suggestedStatus === 'Belirsiz'
    ).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="py-8 px-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analiz Sonuçları</h1>
          <p className="text-sm text-gray-500 mt-1">
            {leads.length} lead analiz edildi ·{' '}
            {Object.keys(decisions).length} değerlendirildi
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/')}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            ← Yeni Analiz
          </button>
          <ExportButton leads={leads} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {counts['Yeniden Değerlendir']}
          </div>
          <div className="text-sm text-green-600">🟢 Yeniden Değerlendir</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-700">
            {counts['Onayla Olumsuz']}
          </div>
          <div className="text-sm text-red-600">🔴 Onayla Olumsuz</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">
            {counts['Belirsiz']}
          </div>
          <div className="text-sm text-yellow-600">🟡 Belirsiz</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['Tümü', 'Yeniden Değerlendir', 'Onayla Olumsuz', 'Belirsiz'].map((opt) => (
          <button
            key={opt}
            onClick={() => setFilter(opt)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              filter === opt
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt === 'Tümü' ? `Tümü (${leads.length})` : opt}
          </button>
        ))}
      </div>

      {/* Lead cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((item, i) => (
          <LeadCard
            key={i}
            item={item}
            decision={decisions[item.lead['ID']]}
            onConfirm={() => handleDecision(item.lead['ID'], 'confirmed')}
            onReject={() => handleDecision(item.lead['ID'], 'rejected')}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">Sonuç bulunamadı.</div>
      )}

      {/* Email composer — görünür olduğunda */}
      <EmailComposer leads={leads} decisions={decisions} />
    </div>
  )
}
