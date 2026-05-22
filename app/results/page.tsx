'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LeadCard from '@/components/LeadCard'
import EmailComposer from '@/components/EmailComposer'
import ExportButton from '@/components/ExportButton'
import type { AnalyzedLead, AnalysisResult, LeadRow } from '@/types/lead'

const ACTIONABLE = ['Yeniden Değerlendir', 'Yanlış Kayıt', 'Belirsiz'] as const

export default function ResultsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<AnalyzedLead[]>([])
  const [decisions, setDecisions] = useState<Record<string, 'confirmed' | 'rejected'>>({})
  const [filter, setFilter] = useState('Tümü')
  const [showCheckPass, setShowCheckPass] = useState(false)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const pendingMeta = useRef<{ id: string; fileName: string; filteredCount: number; totalCount: number } | null>(null)

  useEffect(() => {
    const historyId = searchParams.get('id')

    // Geçmişten yükleme
    if (historyId) {
      fetch(`/api/analyses/${historyId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.analysis?.results) {
            setLeads(data.analysis.results as AnalyzedLead[])
          } else {
            router.replace('/')
          }
          setLoading(false)
        })
        .catch(() => { router.replace('/'); })
      return
    }

    // Yeni analiz
    const pending = sessionStorage.getItem('pendingAnalysis')
    if (pending) {
      sessionStorage.removeItem('pendingAnalysis')
      const { leads: rawLeads, services, recordId, fileName, filteredCount, totalCount } = JSON.parse(pending) as {
        leads: LeadRow[]
        services: string[]
        recordId: string
        fileName: string
        filteredCount: number
        totalCount: number
      }
      pendingMeta.current = { id: recordId, fileName, filteredCount, totalCount }
      setLeads(rawLeads.map((lead) => ({ lead })))
      setProgress({ done: 0, total: rawLeads.length })
      setLoading(false)
      setAnalyzing(true)
      startStreaming(rawLeads, services)
      return
    }

    router.replace('/')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startStreaming(rawLeads: LeadRow[], services: string[]) {
    const CHUNK_SIZE = 20
    const abort = new AbortController()
    abortRef.current = abort
    const accumulated: AnalyzedLead[] = rawLeads.map((lead) => ({ lead }))

    try {
      for (let i = 0; i < rawLeads.length; i += CHUNK_SIZE) {
        if (abort.signal.aborted) break
        const chunk = rawLeads.slice(i, i + CHUNK_SIZE)

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: chunk, services }),
          signal: abort.signal,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'API hatası')
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()!

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const { id, result, error } = JSON.parse(line) as {
                id: string; result?: AnalysisResult; error?: string
              }
              const idx = accumulated.findIndex((l) => l.lead['ID'] === id)
              if (idx !== -1) {
                accumulated[idx] = {
                  ...accumulated[idx],
                  ...(result ? { analysisResult: result } : { analysisError: error }),
                }
              }
              setLeads([...accumulated])
              setProgress((p) => ({ ...p, done: p.done + 1 }))
            } catch {}
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAnalysisError(err instanceof Error ? err.message : 'Analiz hatası')
      }
    } finally {
      setAnalyzing(false)
      // DB'ye kaydet
      const meta = pendingMeta.current
      if (meta && accumulated.some((l) => l.analysisResult)) {
        fetch('/api/analyses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: meta.id,
            fileName: meta.fileName,
            filteredCount: meta.filteredCount,
            totalCount: meta.totalCount,
            results: accumulated,
          }),
        }).then(() => {
          window.dispatchEvent(new Event('analysisHistoryUpdated'))
        }).catch(() => {})
      }
    }
  }

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

  const checkPassLeads = leads.filter((l) => l.analysisResult?.suggestedStatus === 'Check Pass')
  const actionableLeads = leads.filter(
    (l) => !l.analysisResult || l.analysisResult.suggestedStatus !== 'Check Pass'
  )

  const counts = {
    'Yeniden Değerlendir': leads.filter((l) => l.analysisResult?.suggestedStatus === 'Yeniden Değerlendir').length,
    'Yanlış Kayıt': leads.filter((l) => l.analysisResult?.suggestedStatus === 'Yanlış Kayıt').length,
    Belirsiz: leads.filter((l) => l.analysisResult?.suggestedStatus === 'Belirsiz').length,
  }

  const displayLeads = showCheckPass ? leads : actionableLeads
  const filtered = displayLeads.filter(({ analysisResult }) => {
    if (filter === 'Tümü') return true
    return analysisResult?.suggestedStatus === filter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="py-8 px-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analiz Sonuçları</h1>
          <p className="text-sm text-gray-500 mt-1">
            {leads.length} lead · {actionableLeads.filter(l => l.analysisResult).length} aksiyon ·{' '}
            {Object.keys(decisions).length} değerlendirildi
          </p>
        </div>
        <div className="flex gap-3">
          {analyzing && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="border border-red-300 text-red-600 px-4 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors"
            >
              Durdur
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            ← Yeni Analiz
          </button>
          <ExportButton leads={leads} />
        </div>
      </div>

      {analyzing && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Analiz ediliyor...</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {analysisError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {analysisError}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{counts['Yeniden Değerlendir']}</div>
          <div className="text-sm text-green-600">🟢 Yeniden Değerlendir</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-700">{counts['Yanlış Kayıt']}</div>
          <div className="text-sm text-orange-600">🗑️ Yanlış Kayıt</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{counts['Belirsiz']}</div>
          <div className="text-sm text-yellow-600">🟡 Belirsiz</div>
        </div>
        <button
          onClick={() => setShowCheckPass((v) => !v)}
          className={`rounded-xl p-4 text-center transition-colors border ${
            showCheckPass ? 'bg-gray-200 border-gray-400' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}
        >
          <div className="text-2xl font-bold text-gray-500">{checkPassLeads.length}</div>
          <div className="text-sm text-gray-500">✅ Check Pass {showCheckPass ? '(gizle)' : '(göster)'}</div>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['Tümü', ...ACTIONABLE, ...(showCheckPass ? ['Check Pass'] : [])] as string[]).map((opt) => (
          <button
            key={opt}
            onClick={() => setFilter(opt)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              filter === opt
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt === 'Tümü' ? `Tümü (${displayLeads.length})` : opt}
          </button>
        ))}
      </div>

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

      {filtered.length === 0 && !analyzing && (
        <div className="text-center py-16 text-gray-400">
          {filter === 'Tümü' && !showCheckPass && checkPassLeads.length > 0
            ? `Tüm leadler Check Pass — ${checkPassLeads.length} kayıt AI tarafından onaylandı.`
            : 'Sonuç bulunamadı.'}
        </div>
      )}

      <EmailComposer leads={leads} decisions={decisions} />
    </div>
  )
}
