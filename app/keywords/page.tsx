'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'

type Category = 'Alakalı' | 'Negatif' | 'İncelenmeli'

interface TermResult {
  term: string
  category: Category
}

function parseSearchTerms(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

  // "Arama terimi" / "Search term" / "Search Term" sütununu bul
  const headerRow = rows[0] ?? {}
  const col = Object.keys(headerRow).find((k) =>
    /arama.?terimi|search.?term/i.test(k)
  )

  if (!col) {
    // Sütun bulunamazsa ilk sütunu dene
    const firstCol = Object.keys(headerRow)[0]
    return rows
      .map((r) => String(r[firstCol] ?? '').trim())
      .filter((t) => t && t.length > 1)
  }

  return rows
    .map((r) => String(r[col] ?? '').trim())
    .filter((t) => t && t.length > 1)
}

export default function KeywordsPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [terms, setTerms] = useState<string[]>([])
  const [results, setResults] = useState<TermResult[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [filter, setFilter] = useState<Category | 'Tümü'>('Tümü')
  const [error, setError] = useState('')
  const [fileLoaded, setFileLoaded] = useState('')

  const handleFile = async (file: File) => {
    setError('')
    setResults([])
    const buffer = await file.arrayBuffer()
    try {
      const parsed = parseSearchTerms(buffer)
      if (!parsed.length) { setError('Arama terimi sütunu bulunamadı. Dosyayı kontrol edin.'); return }
      // Tekrarları kaldır
      const unique = [...new Set(parsed.map(t => t.toLowerCase().trim()))].filter(Boolean)
      setTerms(unique)
      setFileLoaded(`${file.name} — ${unique.length} benzersiz terim`)
    } catch {
      setError('Dosya okunamadı.')
    }
  }

  const handleAnalyze = async () => {
    if (!terms.length) return
    setAnalyzing(true)
    setResults([])
    setProgress({ done: 0, total: terms.length })
    setError('')

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms }),
        signal: abort.signal,
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }

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
            const item = JSON.parse(line) as TermResult
            setResults((prev) => [...prev, item])
            setProgress((p) => ({ ...p, done: p.done + 1 }))
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Hata oluştu')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const counts = {
    Negatif: results.filter((r) => r.category === 'Negatif').length,
    Alakalı: results.filter((r) => r.category === 'Alakalı').length,
    İncelenmeli: results.filter((r) => r.category === 'İncelenmeli').length,
  }

  const filtered = filter === 'Tümü' ? results : results.filter((r) => r.category === filter)

  const exportNegatives = () => {
    const negatives = results.filter((r) => r.category === 'Negatif').map((r) => r.term)
    const blob = new Blob([negatives.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'negatif-anahtar-kelimeler.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="py-8 px-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Negatif Anahtar Kelime Analizi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Google Ads arama terimleri raporunu yükle, AI alakasız terimleri tespit etsin
        </p>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">1. Raporu Yükle</h2>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-gray-50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <div className="text-3xl mb-2">📊</div>
          {fileLoaded ? (
            <p className="text-sm font-medium text-green-700">{fileLoaded}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">Google Ads → Raporlar → Arama Terimleri → İndir (.csv veya .xlsx)</p>
              <p className="text-xs text-gray-400 mt-1">"Arama terimi" sütunu otomatik bulunur</p>
            </>
          )}
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        {terms.length > 0 && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {analyzing
              ? `Analiz ediliyor... (${progress.done}/${progress.total})`
              : `${terms.length} Terimi Analiz Et`}
          </button>
        )}

        {analyzing && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-700">{counts.Negatif}</div>
              <div className="text-xs text-red-600 mt-1">🚫 Negatif Ekle</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-yellow-700">{counts.İncelenmeli}</div>
              <div className="text-xs text-yellow-600 mt-1">🔍 İncelenmeli</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{counts.Alakalı}</div>
              <div className="text-xs text-green-600 mt-1">✅ Alakalı</div>
            </div>
          </div>

          {/* Export + Filter */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-2">
              {(['Tümü', 'Negatif', 'İncelenmeli', 'Alakalı'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setFilter(opt)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    filter === opt
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt === 'Tümü' ? `Tümü (${results.length})` : opt}
                </button>
              ))}
            </div>
            <button
              onClick={exportNegatives}
              disabled={counts.Negatif === 0}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              ⬇ {counts.Negatif} Negatif Kelimeyi İndir (.txt)
            </button>
          </div>

          {/* Term list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50 max-h-[60vh] overflow-auto">
              {filtered.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{r.term}</span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-4 ${
                    r.category === 'Negatif'
                      ? 'bg-red-100 text-red-700'
                      : r.category === 'Alakalı'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {r.category === 'Negatif' ? '🚫 Negatif' : r.category === 'Alakalı' ? '✅ Alakalı' : '🔍 İncelenmeli'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
