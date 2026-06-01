'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface AnalysisRecord {
  id: string
  file_name: string
  filtered_count: number
  total_count: number
  created_at: string
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [history, setHistory] = useState<AnalysisRecord[]>([])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/analyses')
      if (res.ok) {
        const data = await res.json()
        setHistory(data.analyses ?? [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (user) loadHistory()
  }, [user, loadHistory])

  useEffect(() => {
    window.addEventListener('analysisHistoryUpdated', loadHistory)
    return () => window.removeEventListener('analysisHistoryUpdated', loadHistory)
  }, [loadHistory])

  const openRecord = (id: string) => {
    router.push(`/results?id=${id}`)
  }

  const deleteRecord = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await fetch(`/api/analyses/${id}`, { method: 'DELETE' })
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      <div className="px-5 py-4 border-b border-gray-100">
        <h1 className="font-bold text-gray-900 text-sm leading-tight">
          ApsiyonLead
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Apsiyon</p>
      </div>

      <nav className="px-3 pt-3 space-y-1">
        <Link
          href="/"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname === '/'
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          + Yeni Analiz
        </Link>
        <Link
          href="/keywords"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname === '/keywords'
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          🔑 Negatif Kelimeler
        </Link>
        <Link
          href="/analytics"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname === '/analytics'
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          📊 Analitik
        </Link>
      </nav>

      <div className="flex-1 overflow-auto px-3 py-3">
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
            className="group flex items-start justify-between px-3 py-2.5 rounded-lg mb-1 border border-transparent hover:bg-gray-50 hover:border-gray-100 cursor-pointer transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-700 truncate font-medium">{record.file_name}</p>
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

      <div className="border-t border-gray-100 px-4 py-3">
        {user && (
          <>
            <p className="text-sm font-medium text-gray-700 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </>
        )}
        <button
          onClick={logout}
          className="mt-2 text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
