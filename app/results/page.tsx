'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ResultsTable from '@/components/ResultsTable'
import ExportButton from '@/components/ExportButton'
import type { AnalyzedLead, AnalysisResult, LeadRow } from '@/types/lead'

export default function ResultsPage() {
  const router = useRouter()
  const [analyzedLeads, setAnalyzedLeads] = useState<AnalyzedLead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem('analysisData')
    if (!raw) {
      router.replace('/')
      return
    }
    const { leads, results } = JSON.parse(raw) as {
      leads: LeadRow[]
      results: Record<string, AnalysisResult | { error: string }>
    }

    const merged: AnalyzedLead[] = leads.map((lead) => {
      const result = results[lead['ID']]
      if (!result) return { lead }
      if ('error' in result) return { lead, analysisError: result.error }
      return { lead, analysisResult: result as AnalysisResult }
    })

    setAnalyzedLeads(merged)
    setLoading(false)
  }, [router])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-gray-400">Sonuçlar yükleniyor...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analiz Sonuçları</h1>
            <p className="text-sm text-gray-500 mt-1">
              {analyzedLeads.length} lead analiz edildi
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/')}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              ← Yeni Analiz
            </button>
            <ExportButton leads={analyzedLeads} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <ResultsTable leads={analyzedLeads} />
        </div>
      </div>
    </main>
  )
}
