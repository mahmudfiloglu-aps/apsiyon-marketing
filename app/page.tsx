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
    setLeads(filteredLeads)
    setTotalCount(total)
    setFileName(name)
    setError('')
  }

  const handleAnalyze = () => {
    if (!leads.length) { setError('Önce bir dosya yükleyin.'); return }
    if (!services.length) { setError('En az bir hizmet tanımlayın.'); return }

    const record = {
      id: Date.now().toString(),
      name: fileName,
      date: new Date().toLocaleDateString('tr-TR'),
      filteredCount: leads.length,
      totalCount,
    }
    const existing = JSON.parse(localStorage.getItem('fileHistory') || '[]')
    localStorage.setItem('fileHistory', JSON.stringify([record, ...existing].slice(0, 20)))
    window.dispatchEvent(new Event('fileHistoryUpdated'))

    sessionStorage.setItem('pendingAnalysis', JSON.stringify({
      leads,
      services,
      recordId: record.id,
      fileName,
      filteredCount: leads.length,
      totalCount,
    }))
    router.push('/results')
  }

  return (
    <div className="py-10 px-6 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Lead Yeniden Değerlendirme
        </h1>
        <p className="text-gray-500">
          &quot;Uygun Bulunmadı&quot; etiketli lead&apos;leri AI ile analiz edin
        </p>
      </div>

      <div className="space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">1. Dosya Yükle</h2>
          <FileUploader onLeadsLoaded={handleLeadsLoaded} />
          {leads.length > 0 && (
            <p className="text-sm text-blue-600 mt-3">
              ✓ {leads.length} lead analiz için hazır ({totalCount} toplam satırdan)
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-1 text-gray-800">2. Hizmetleri Tanımla</h2>
          <ServiceConfig onChange={setServices} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">3. Analizi Başlat</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={leads.length === 0}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {leads.length > 0 ? `${leads.length} Lead'i Analiz Et` : "Lead'leri Analiz Et"}
          </button>
        </div>
      </div>
    </div>
  )
}
