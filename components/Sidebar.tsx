'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface FileRecord {
  id: string
  name: string
  date: string
  filteredCount: number
  totalCount: number
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [history, setHistory] = useState<FileRecord[]>([])

  const loadHistory = () => {
    const raw = localStorage.getItem('fileHistory')
    if (raw) setHistory(JSON.parse(raw))
  }

  useEffect(() => {
    loadHistory()
    window.addEventListener('fileHistoryUpdated', loadHistory)
    return () => window.removeEventListener('fileHistoryUpdated', loadHistory)
  }, [])

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      <div className="px-5 py-4 border-b border-gray-100">
        <h1 className="font-bold text-gray-900 text-sm leading-tight">
          Lead Yeniden Değerlendirme
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Apsiyon</p>
      </div>

      <nav className="px-3 pt-3">
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
            className="px-3 py-2.5 rounded-lg hover:bg-gray-50 mb-1 border border-transparent hover:border-gray-100"
          >
            <p className="text-sm text-gray-700 truncate font-medium">
              {record.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {record.filteredCount} lead · {record.date}
            </p>
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
