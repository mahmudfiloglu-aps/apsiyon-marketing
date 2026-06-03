'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface AnalysisRecord {
  id: string
  file_name: string
  filtered_count: number
  total_count: number
  created_at: string
}

interface QualityRecord {
  id: string
  file_name: string
  total_count: number
  created_at: string
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { can } = usePermissions()
  const pathname = usePathname()
  const router = useRouter()
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [qualityHistory, setQualityHistory] = useState<QualityRecord[]>([])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/analyses')
      if (res.ok) setHistory((await res.json()).analyses ?? [])
    } catch {}
  }, [])

  const loadQualityHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/quality-analyses')
      if (res.ok) setQualityHistory((await res.json()).analyses ?? [])
    } catch {}
  }, [])

  useEffect(() => {
    if (user) { loadHistory(); loadQualityHistory() }
  }, [user, loadHistory, loadQualityHistory])

  useEffect(() => {
    window.addEventListener('analysisHistoryUpdated', loadHistory)
    window.addEventListener('qualityHistoryUpdated', loadQualityHistory)
    return () => {
      window.removeEventListener('analysisHistoryUpdated', loadHistory)
      window.removeEventListener('qualityHistoryUpdated', loadQualityHistory)
    }
  }, [loadHistory, loadQualityHistory])

  const openRecord = (id: string) => {
    router.push(`/results?id=${id}`)
  }

  const deleteRecord = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await fetch(`/api/analyses/${id}`, { method: 'DELETE' })
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-100 flex flex-col h-full shrink-0">
      {/* Brand area */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-sm leading-tight">ApsiyonLead</h1>
            <p className="text-xs text-gray-400 leading-tight">Satış Kalite Kontrol</p>
          </div>
        </div>
      </div>

      <nav className="px-3 pt-3 space-y-0.5">
        {can('lead_analysis') && (
          <Link
            href="/"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/'
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            + Yeni Analiz
          </Link>
        )}
        {can('keywords') && (
          <Link
            href="/keywords"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/keywords'
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            🔑 Negatif Kelimeler
          </Link>
        )}
        {can('analytics') && (
          <Link
            href="/analytics"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/analytics'
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📊 Analitik
          </Link>
        )}
        {can('lead_quality') && (
          <Link
            href="/quality"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/quality'
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ⭐ Lead Kalitesi
          </Link>
        )}
        {can('ad_reports') && (
          <Link
            href="/reports"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/reports' || pathname?.startsWith('/reports')
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📈 Reklam Raporları
          </Link>
        )}
        {can('blog_tools') && (
          <Link
            href="/blog-tools"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname?.startsWith('/blog-tools')
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📖 Blog Araçları
          </Link>
        )}
        {can('settings') && (
          <Link
            href="/settings"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/settings'
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ⚙ Ayarlar
          </Link>
        )}
        {(user?.role === 'super_admin' || user?.role === 'admin') && (
          <Link
            href="/admin"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/admin'
                ? 'border-l-2 border-blue-600 bg-blue-50 text-blue-700 pl-[10px]'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            👤 Yönetim
          </Link>
        )}
      </nav>

      <div className="border-t border-slate-100 mt-2" />

      <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
        {/* Lead analizi geçmişi */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
            Geçmiş
          </p>
          {history.length === 0 && (
            <p className="text-xs text-gray-400 px-2">Henüz analiz yok</p>
          )}
          {history.map((record) => (
            <div
              key={record.id}
              onClick={() => openRecord(record.id)}
              className="group flex items-start justify-between px-3 py-2.5 rounded-lg mb-1 border border-transparent hover:bg-slate-50 hover:border-slate-100 cursor-pointer transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate font-medium">{record.file_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {record.filtered_count} lead ·{' '}
                  {new Date(record.created_at).toLocaleDateString('tr-TR')}
                </p>
              </div>
              <button
                onClick={(e) => deleteRecord(e, record.id)}
                className="ml-2 shrink-0 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs pt-0.5"
                title="Sil"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Kalite analizi geçmişi */}
        {qualityHistory.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
              Kalite Geçmişi
            </p>
            {qualityHistory.map((record) => (
              <div
                key={record.id}
                onClick={() => router.push(`/quality?id=${record.id}`)}
                className="group flex items-start justify-between px-3 py-2.5 rounded-lg mb-1 border border-transparent hover:bg-slate-50 hover:border-slate-100 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 truncate font-medium">{record.file_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {record.total_count} lead ·{' '}
                    {new Date(record.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await fetch(`/api/quality-analyses/${record.id}`, { method: 'DELETE' })
                    setQualityHistory((prev) => prev.filter((r) => r.id !== record.id))
                  }}
                  className="ml-2 shrink-0 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs pt-0.5"
                  title="Sil"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        {user && (
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-2">
            <p className="text-sm font-medium text-slate-700 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
