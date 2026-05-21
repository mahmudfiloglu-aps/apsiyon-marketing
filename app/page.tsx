'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import FileUploader from '@/components/FileUploader'
import ServiceConfig from '@/components/ServiceConfig'
import type { LeadRow } from '@/types/lead'

const DEFAULT_SERVICES = [
  'Plaka Tanıma Sistemi (PTS) Kiralama',
  'Apsiyon Site Yönetim Yazılımı',
  'Tur Kontrol Sistemi',
  'QR Kod Geçiş Sistemi',
  'Kazan Otomasyon Sistemi',
  'Saha Mobil Uygulaması',
]

export default function HomePage() {
  const router = useRouter()
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [services, setServices] = useState<string[]>(DEFAULT_SERVICES)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')

  const handleLeadsLoaded = (filteredLeads: LeadRow[], total: number) => {
    setLeads(filteredLeads)
    setTotalCount(total)
    setError('')
  }

  const handleAnalyze = async () => {
    if (!leads.length) {
      setError('Önce bir dosya yükleyin.')
      return
    }
    if (!services.length) {
      setError('En az bir hizmet tanımlayın.')
      return
    }

    setIsAnalyzing(true)
    setError('')
    setProgress({ done: 0, total: leads.length })

    try {
      const CHUNK_SIZE = 50
      const allResults: Record<string, unknown> = {}

      for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
        const chunk = leads.slice(i, i + CHUNK_SIZE)
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: chunk, services }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'API hatası')
        Object.assign(allResults, data.results)
        setProgress({ done: Math.min(i + CHUNK_SIZE, leads.length), total: leads.length })
      }

      sessionStorage.setItem(
        'analysisData',
        JSON.stringify({ leads, results: allResults })
      )
      router.push('/results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analiz sırasında hata oluştu.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Lead Yeniden Değerlendirme
          </h1>
          <p className="text-gray-500">
            &quot;Uygun Bulunmadı&quot; etiketli lead&apos;leri AI ile analiz edin
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">
              1. Dosya Yükle
            </h2>
            <FileUploader onLeadsLoaded={handleLeadsLoaded} />
            {leads.length > 0 && (
              <p className="text-sm text-blue-600 mt-3">
                ✓ {leads.length} lead analiz için hazır ({totalCount} toplam satırdan)
              </p>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="mb-2">
              <span className="text-lg font-semibold text-gray-800">
                2. Hizmetleri Tanımla
              </span>
            </div>
            <ServiceConfig onChange={setServices} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">
              3. Analizi Başlat
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
                {error}
              </div>
            )}

            {isAnalyzing && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Analiz ediliyor...</span>
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: progress.total
                        ? `${(progress.done / progress.total) * 100}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || leads.length === 0}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAnalyzing
                ? `Analiz ediliyor... (${progress.done}/${progress.total})`
                : leads.length > 0
                  ? `${leads.length} Lead'i Analiz Et`
                  : 'Lead\'leri Analiz Et'}
            </button>

            {leads.length > 0 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Tahmini süre: ~{Math.ceil(leads.length / 10)} dakika
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
