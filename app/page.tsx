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
  const [fileName, setFileName] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [services, setServices] = useState<string[]>(DEFAULT_SERVICES)
  const [error, setError] = useState('')

  const handleLeadsLoaded = (filteredLeads: LeadRow[], total: number, name: string) => {
    setLeads(filteredLeads); setTotalCount(total); setFileName(name); setError('')
  }

  const handleAnalyze = () => {
    if (!leads.length) { setError('Önce bir dosya yükleyin.'); return }
    if (!services.length) { setError('En az bir hizmet tanımlayın.'); return }

    const record = { id: Date.now().toString(), name: fileName, date: new Date().toLocaleDateString('tr-TR'), filteredCount: leads.length, totalCount }
    const existing = JSON.parse(localStorage.getItem('fileHistory') || '[]')
    localStorage.setItem('fileHistory', JSON.stringify([record, ...existing].slice(0, 20)))
    window.dispatchEvent(new Event('fileHistoryUpdated'))

    sessionStorage.setItem('pendingAnalysis', JSON.stringify({ leads, services, recordId: record.id, fileName, filteredCount: leads.length, totalCount }))
    router.push('/results')
  }

  return (
    <div className="py-12 px-6 max-w-xl mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          AI Destekli Lead Analizi
        </div>
        <h1 className="text-3xl font-bold text-slate-900 leading-tight">
          Kaçırılan Fırsatları<br />Geri Kazanın
        </h1>
        <p className="text-gray-500 mt-3 leading-relaxed">
          &quot;Uygun Bulunmadı&quot; etiketli leadleri AI ile analiz edin,<br />
          yanlış değerlendirilen satış fırsatlarını tespit edin.
        </p>
      </div>

      <div className="space-y-4">
        {/* Step 1 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-50">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <h2 className="font-semibold text-slate-800">Dosyayı Yükle</h2>
          </div>
          <div className="p-5">
            <FileUploader onLeadsLoaded={handleLeadsLoaded} />
            {leads.length > 0 && (
              <p className="text-sm text-blue-600 mt-3 font-medium">
                ✓ {leads.length} lead hazır <span className="text-gray-400 font-normal">({totalCount} satırdan filtrelendi)</span>
              </p>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-50">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <h2 className="font-semibold text-slate-800">Hizmetleri Yapılandır</h2>
          </div>
          <div className="p-5">
            <ServiceConfig onChange={setServices} />
          </div>
        </div>

        {/* Step 3 */}
        <div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-3 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={handleAnalyze}
            disabled={leads.length === 0}
            className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-semibold text-base hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {leads.length > 0 ? `${leads.length} Lead'i Analiz Et →` : "Analizi Başlat"}
          </button>
          {leads.length === 0 && (
            <p className="text-center text-xs text-gray-400 mt-2">Devam etmek için dosya yükleyin</p>
          )}
        </div>
      </div>
    </div>
  )
}
