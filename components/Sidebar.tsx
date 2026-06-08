'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import ApsiyonLogo from './ApsiyonLogo'

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

interface NavItem {
  href: string
  label: string
  icon: string
  permKey?: string
  adminOnly?: boolean
  soon?: boolean
  exact?: boolean
}

const PERF_ITEMS: NavItem[] = [
  { href: '/',          label: 'Lead Analizi',      icon: '⚡', permKey: 'lead_analysis', exact: true },
  { href: '/quality',   label: 'Lead Kalitesi',     icon: '⭐', permKey: 'lead_quality' },
  { href: '/reports',   label: 'Reklam Raporları',  icon: '📈', permKey: 'ad_reports' },
  { href: '/analytics', label: 'Analitik',          icon: '📊', permKey: 'analytics' },
]

const CONTENT_ITEMS: NavItem[] = [
  { href: '/agenda',     label: 'Gündem & İçerik',   icon: '📰', permKey: 'agenda' },
  { href: '/blog-tools', label: 'Blog Bulucu',       icon: '🔍', permKey: 'blog_tools' },
  { href: '/keywords',   label: 'Negatif Kelimeler', icon: '🔑', permKey: 'keywords' },
]

const SOCIAL_ITEMS: NavItem[] = [
  { href: '/reviews', label: 'Yorum & Yanıt', icon: '💬', soon: true },
]

const SYSTEM_ITEMS: NavItem[] = [
  { href: '/settings', label: 'Ayarlar', icon: '⚙', permKey: 'settings' },
  { href: '/admin',    label: 'Yönetim', icon: '👤', adminOnly: true },
]

type SectionKey = 'perf' | 'content' | 'social' | 'system' | 'history'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { can } = usePermissions()
  const pathname = usePathname()
  const router = useRouter()
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [qualityHistory, setQualityHistory] = useState<QualityRecord[]>([])
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    perf: true, content: true, social: true, system: true, history: true,
  })

  const toggle = (key: SectionKey) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))

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

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : (pathname === item.href || pathname?.startsWith(item.href + '/'))

  const isVisible = (item: NavItem) => {
    if (item.soon) return true
    if (item.adminOnly) return user?.role === 'super_admin' || user?.role === 'admin'
    if (item.permKey) return can(item.permKey)
    return true
  }

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item)
    if (item.soon) {
      return (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-slate-400 cursor-not-allowed select-none">
          <span className="text-sm leading-none w-4 text-center">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          <span className="text-[9px] font-semibold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Yakında</span>
        </div>
      )
    }
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
          active
            ? 'text-[#00A5DF] bg-[#00A5DF]/8 border-l-2 border-[#00A5DF] pl-[9px]'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="text-sm leading-none w-4 text-center">{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    )
  }

  const Section = ({
    sectionKey, label, items, border,
  }: { sectionKey: SectionKey; label: string; items: NavItem[]; border?: boolean }) => {
    const visible = items.filter(isVisible)
    if (!visible.length) return null
    const isOpen = open[sectionKey]
    return (
      <div className={border ? 'border-t border-slate-100 pt-2' : ''}>
        <button
          onClick={() => toggle(sectionKey)}
          className="flex items-center justify-between w-full px-2.5 py-1 mb-0.5 group"
        >
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
          <span className="text-[9px] text-slate-300 group-hover:text-slate-400 transition-colors">
            {isOpen ? '▲' : '▼'}
          </span>
        </button>
        {isOpen && (
          <div className="space-y-0.5">
            {visible.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
        )}
      </div>
    )
  }

  const hasHistory = history.length > 0 || qualityHistory.length > 0

  return (
    <aside className="w-60 bg-white border-r border-slate-100 flex flex-col h-full shrink-0">
      {/* Brand header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <ApsiyonLogo className="w-24 h-auto mb-1.5" />
        <p className="text-[9px] font-semibold text-slate-400 tracking-widest uppercase leading-tight">
          Marketing Automation Center
        </p>
      </div>

      {/* Navigation */}
      <nav className="px-3 pt-3 space-y-1.5 overflow-y-auto flex-1">
        <Section sectionKey="perf"    label="Performance Marketing" items={PERF_ITEMS} />
        <Section sectionKey="content" label="Content & SEO"         items={CONTENT_ITEMS} />
        <Section sectionKey="social"  label="Social Media"          items={SOCIAL_ITEMS} />
        <Section sectionKey="system"  label="Sistem"                items={SYSTEM_ITEMS} border />

        {/* History */}
        {hasHistory && (
          <div className="border-t border-slate-100 pt-2">
            <button
              onClick={() => toggle('history')}
              className="flex items-center justify-between w-full px-2.5 py-1 mb-0.5 group"
            >
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Geçmiş</span>
              <span className="text-[9px] text-slate-300 group-hover:text-slate-400 transition-colors">
                {open.history ? '▲' : '▼'}
              </span>
            </button>
            {open.history && (
              <div className="space-y-0.5">
                {history.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => router.push(`/results?id=${r.id}`)}
                    className="group flex items-start justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-600 truncate">{r.file_name}</p>
                      <p className="text-[10px] text-slate-400">
                        {r.filtered_count} lead · {new Date(r.created_at).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await fetch(`/api/analyses/${r.id}`, { method: 'DELETE' })
                        setHistory((prev) => prev.filter((x) => x.id !== r.id))
                      }}
                      className="ml-1 shrink-0 text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                    >✕</button>
                  </div>
                ))}
                {qualityHistory.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => router.push(`/quality?id=${r.id}`)}
                    className="group flex items-start justify-between px-2.5 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-600 truncate">⭐ {r.file_name}</p>
                      <p className="text-[10px] text-slate-400">
                        {r.total_count} lead · {new Date(r.created_at).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await fetch(`/api/quality-analyses/${r.id}`, { method: 'DELETE' })
                        setQualityHistory((prev) => prev.filter((x) => x.id !== r.id))
                      }}
                      className="ml-1 shrink-0 text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-100 px-3 py-2.5 shrink-0">
        {user && (
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
              style={{ background: '#00A5DF' }}
            >
              {user.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-700 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
        >
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
