'use client'

import { useState, useEffect } from 'react'
import type { AgendaSuggestion } from '@/app/api/agenda/route'

const CACHE_KEY = 'agenda_cache'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 saat

interface CacheEntry {
  suggestions: AgendaSuggestion[]
  fetchedAt: string
  savedAt: number
}

const PRIORITY_CONFIG = {
  high:   { label: 'Yüksek Öncelik', bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100' },
  medium: { label: 'Orta Öncelik',   bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-100' },
  low:    { label: 'Düşük Öncelik',  bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-100' },
}

export default function AgendaClient() {
  const [suggestions, setSuggestions] = useState<AgendaSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [cacheTime, setCacheTime] = useState<number | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const entry: CacheEntry = JSON.parse(raw)
        if (Date.now() - entry.savedAt < CACHE_TTL) {
          setSuggestions(entry.suggestions)
          setFetchedAt(entry.fetchedAt)
          setCacheTime(entry.savedAt)
          return
        }
      }
    } catch {}
    fetchSuggestions()
  }, [])

  async function fetchSuggestions() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/agenda')
      const data = await res.json()
      if (!res.ok) { setError(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Hata')); return }
      setSuggestions(data.suggestions)
      setFetchedAt(data.fetchedAt)
      const now = Date.now()
      setCacheTime(now)
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        suggestions: data.suggestions,
        fetchedAt: data.fetchedAt,
        savedAt: now,
      } satisfies CacheEntry))
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }

  function clearCache() {
    localStorage.removeItem(CACHE_KEY)
    setSuggestions([])
    setFetchedAt(null)
    setCacheTime(null)
    fetchSuggestions()
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function toggleExpanded(i: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const highCount   = suggestions.filter(s => s.priority === 'high').length
  const mediumCount = suggestions.filter(s => s.priority === 'medium').length

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Gündem & İçerik Önerileri</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Güncel haberlere göre Apsiyon için içerik fırsatları
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cacheTime && (
            <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
              {new Date(cacheTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} güncellendi
              <button onClick={clearCache} className="ml-1.5 text-slate-300 hover:text-slate-500">×</button>
            </span>
          )}
          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00A5DF] text-white text-xs font-medium rounded-lg hover:bg-[#0090c4] transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Yükleniyor...
              </>
            ) : (
              <>↻ Güncelle</>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      {suggestions.length > 0 && (
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-xs text-red-600 font-medium">{highCount} yüksek öncelik</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-xs text-amber-600 font-medium">{mediumCount} orta öncelik</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-500">{suggestions.length} öneri toplam</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !suggestions.length && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-1/4 mb-3" />
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-full mb-1" />
              <div className="h-3 bg-slate-100 rounded w-5/6" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !suggestions.length && !error && (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">📰</div>
          <p className="text-sm font-medium text-slate-600 mb-1">Henüz öneri yok</p>
          <p className="text-xs text-slate-400">Güncel içerik önerileri için "Güncelle" butonuna tıkla</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.map((s, i) => {
        const cfg = PRIORITY_CONFIG[s.priority]
        const isExpanded = expanded.has(i)
        return (
          <div
            key={i}
            className={`bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-sm ${cfg.border}`}
          >
            {/* Top bar */}
            <div className={`flex items-center justify-between px-4 py-2 ${cfg.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>
                  {cfg.label}
                </span>
                <div className="flex gap-1">
                  {s.contentTypes.includes('blog') && (
                    <span className="text-[9px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Blog</span>
                  )}
                  {s.contentTypes.includes('social') && (
                    <span className="text-[9px] font-semibold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">Sosyal</span>
                  )}
                </div>
              </div>
              {s.pubDate && (
                <span className="text-[10px] text-slate-400">
                  {new Date(s.pubDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* News source */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Gündem</p>
                {s.newsUrl ? (
                  <a href={s.newsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-slate-600 hover:text-[#00A5DF] hover:underline leading-snug">
                    {s.newsTitle}
                  </a>
                ) : (
                  <p className="text-sm text-slate-600 leading-snug">{s.newsTitle}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5 italic">{s.priorityReason}</p>
              </div>

              {/* Blog suggestion */}
              {s.contentTypes.includes('blog') && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Blog Önerisi</span>
                    <button
                      onClick={() => copyText(s.blogTitle, `blog-${i}`)}
                      className="text-[10px] text-blue-400 hover:text-blue-600 transition-colors"
                    >
                      {copied === `blog-${i}` ? '✓ Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">{s.blogTitle}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{s.blogAngle}</p>
                </div>
              )}

              {/* Social suggestion */}
              {s.contentTypes.includes('social') && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">LinkedIn Önerisi</span>
                    <button
                      onClick={() => copyText(s.socialCaption, `social-${i}`)}
                      className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors"
                    >
                      {copied === `social-${i}` ? '✓ Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                  <p
                    className={`text-xs text-slate-600 leading-relaxed cursor-pointer ${!isExpanded ? 'line-clamp-2' : ''}`}
                    onClick={() => toggleExpanded(i)}
                  >
                    {s.socialCaption}
                  </p>
                  {s.socialCaption.length > 120 && (
                    <button
                      onClick={() => toggleExpanded(i)}
                      className="text-[10px] text-violet-400 mt-1 hover:text-violet-600"
                    >
                      {isExpanded ? 'Küçült' : 'Devamını gör'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {fetchedAt && suggestions.length > 0 && (
        <p className="text-center text-[10px] text-slate-300">
          Son güncelleme: {new Date(fetchedAt).toLocaleString('tr-TR')}
        </p>
      )}
    </div>
  )
}
