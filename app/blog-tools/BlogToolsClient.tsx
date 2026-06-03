'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlogPost {
  id: string; url: string; slug: string; title: string
  auto_keywords: string[]; manual_keywords: string[]
  last_synced: string; created_at: string
}

interface MatchedTerm { term: string; type: 'manual' | 'auto' | 'title' }

interface Recommendation extends BlogPost {
  score: number; reason: string
  matchedTerms?: MatchedTerm[]; aiUsedForThis?: boolean
}

const CACHE_KEY = 'blog_yt_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

interface CacheEntry {
  query: { title: string; description: string }
  results: Recommendation[]; suggestedTitles: string[]
  aiUsed: boolean; notice: string; message: string
  meta: { totalBlogCount?: number; matchedCount?: number }
  timestamp: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreBadge(score: number) {
  if (score >= 65) return { bg: 'bg-green-100 text-green-700 border-green-200', label: 'Yüksek' }
  if (score >= 35) return { bg: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Kısmi' }
  return { bg: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Düşük' }
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Shared Components ────────────────────────────────────────────────────────

function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}

function KeywordEditor({ keywords, onChange, placeholder }: {
  keywords: string[]; onChange: (kw: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const kw = input.trim()
    if (kw && !keywords.includes(kw)) onChange([...keywords, kw])
    setInput('')
  }
  return (
    <div className="flex flex-wrap gap-1 items-center border border-slate-200 rounded-lg px-2 py-1 bg-white min-h-[34px]">
      {keywords.map(k => (
        <span key={k} className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-blue-100">
          {k}
          <button onClick={() => onChange(keywords.filter(x => x !== k))} className="ml-0.5 text-blue-400 hover:text-blue-700 leading-none">×</button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        placeholder={keywords.length === 0 ? (placeholder ?? 'Kelime yaz, Enter ile ekle') : ''}
        className="text-xs outline-none flex-1 min-w-[100px] bg-transparent py-0.5" />
    </div>
  )
}

function RecCard({ rec }: { rec: Recommendation }) {
  const badge = scoreBadge(rec.score)
  const manualM = (rec.matchedTerms ?? []).filter(m => m.type === 'manual')
  const autoM   = (rec.matchedTerms ?? []).filter(m => m.type === 'auto')
  const titleM  = (rec.matchedTerms ?? []).filter(m => m.type === 'title')
  const hasM    = (rec.matchedTerms ?? []).length > 0
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-snug">{rec.title}</p>
          <a href={rec.url} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-blue-600 hover:underline truncate block mt-0.5">{rec.url}</a>
        </div>
        <div className={`shrink-0 flex flex-col items-center gap-0.5 border rounded-lg px-2.5 py-1.5 ${badge.bg}`}>
          <span className="text-lg font-bold leading-none">{rec.score}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">{badge.label}</span>
        </div>
      </div>
      {rec.reason && <p className="text-xs text-slate-500 leading-relaxed">{rec.reason}</p>}
      {hasM && (
        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Eşleşme nedenleri</p>
          <div className="flex flex-wrap gap-1">
            {manualM.map(m => (
              <span key={m.term} className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium">
                <span className="text-blue-400">★</span>{m.term}
              </span>
            ))}
            {autoM.map(m => (
              <span key={m.term} className="text-[10px] bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full">{m.term}</span>
            ))}
            {titleM.map(m => (
              <span key={m.term} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{m.term}</span>
            ))}
          </div>
          <p className="text-[9px] text-slate-300">
            {[manualM.length > 0 && '★ manuel etiket', autoM.length > 0 && '● oto. kelime', titleM.length > 0 && '○ başlık']
              .filter(Boolean).join('  ·  ')}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── YouTube Tab ──────────────────────────────────────────────────────────────

function YouTubeTab() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Recommendation[] | null>(null)
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([])
  const [aiUsed, setAiUsed] = useState(false)
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<{ totalBlogCount?: number; matchedCount?: number } | null>(null)
  const [cachedAt, setCachedAt] = useState<Date | null>(null)
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return
      const cache: CacheEntry = JSON.parse(raw)
      if (Date.now() - cache.timestamp > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return }
      setTitle(cache.query.title); setDescription(cache.query.description)
      setResults(cache.results); setSuggestedTitles(cache.suggestedTitles ?? [])
      setAiUsed(cache.aiUsed); setNotice(cache.notice); setMessage(cache.message)
      setMeta(cache.meta); setCachedAt(new Date(cache.timestamp))
    } catch {}
  }, [])

  const saveCache = (entry: Omit<CacheEntry, 'timestamp'>) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...entry, timestamp: Date.now() })) } catch {}
  }

  const submit = async () => {
    if (!title.trim()) return
    setLoading(true); setError(''); setResults(null); setMessage('')
    setNotice(''); setMeta(null); setCachedAt(null); setSuggestedTitles([])
    try {
      const res = await fetch('/api/blog-recommend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Hata oluştu'); return }
      const recs = data.recommendations ?? []; const ai = data.aiUsed ?? false
      const ntc = data.notice ?? ''; const msg = data.message ?? ''
      const titles = data.suggestedTitles ?? []
      const m = { totalBlogCount: data.totalBlogCount, matchedCount: data.matchedCount }
      setResults(recs); setAiUsed(ai); setMessage(msg); setNotice(ntc); setMeta(m); setSuggestedTitles(titles)
      saveCache({ query: { title: title.trim(), description: description.trim() }, results: recs, suggestedTitles: titles, aiUsed: ai, notice: ntc, message: msg, meta: m })
      setCachedAt(new Date())
    } catch { setError('İstek zaman aşımına uğradı. Lütfen tekrar deneyin.') }
    finally { setLoading(false) }
  }

  const copyTitle = (t: string) => {
    navigator.clipboard.writeText(t).then(() => { setCopiedTitle(t); setTimeout(() => setCopiedTitle(null), 1500) })
  }

  const maxScore = results ? results.reduce((m, r) => Math.max(m, r.score), 0) : 0

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Video Başlığı <span className="text-red-500">*</span>
          </label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && submit()}
            placeholder="Örn: Airbnb'de Ev Yönetimi İpuçları"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Video Açıklaması
            <span className="text-slate-400 font-normal ml-1">(isteğe bağlı — eşleşme kalitesini artırır)</span>
          </label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="Videodaki konuları, anahtar kavramları kısaca açıklayın..."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={submit} disabled={loading || !title.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
          {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Analiz ediliyor...</span> : '✨ Blog Önerisi Al'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      {notice && <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 flex items-center gap-1.5"><span>ℹ️</span>{notice}</div>}
      {message && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">{message}</div>}

      {results !== null && (
        <div className="space-y-3">
          {/* Result header */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-700">
              {results.length > 0 ? `${results.length} Blog Önerisi` : 'Eşleşen blog bulunamadı'}
            </p>
            {results.length > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${aiUsed ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {aiUsed ? '🤖 AI Puanı / 100' : '🔤 Anahtar Kelime Puanı / 100'}
              </span>
            )}
            <span className="text-[10px] text-slate-400 ml-auto flex items-center gap-2">
              {meta?.totalBlogCount != null && (
                <span>{meta.totalBlogCount} blog{meta.matchedCount ? `, ${meta.matchedCount} aday` : ''}</span>
              )}
              {cachedAt && (
                <span className="flex items-center gap-0.5 bg-slate-100 px-1.5 py-0.5 rounded-full">
                  💾 {cachedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  <button onClick={() => { setResults(null); setCachedAt(null); setSuggestedTitles([]); localStorage.removeItem(CACHE_KEY) }}
                    className="ml-1 text-slate-400 hover:text-red-400 font-bold" title="Temizle">×</button>
                </span>
              )}
            </span>
          </div>

          {/* No results state */}
          {results.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <p className="text-sm font-medium text-slate-700">Bu video için ilgili blog yazısı bulunamadı.</p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside leading-relaxed">
                <li>Başlığa daha fazla anahtar kelime ekleyin</li>
                <li>Blog Yönetimi sekmesinde ilgili bloglara manuel etiket ekleyin</li>
                <li>Yeni içerik eklendiyse yeniden senkronize edin</li>
              </ul>
            </div>
          )}

          {/* Blog cards */}
          {results.map(r => <RecCard key={r.id} rec={r} />)}

          {/* Suggested titles when no 60+ match */}
          {suggestedTitles.length > 0 && (results.length === 0 || maxScore < 60) && (
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <div>
                  <p className="text-sm font-semibold text-violet-800">İçerik Başlığı Önerileri</p>
                  <p className="text-xs text-violet-500">
                    {results.length === 0
                      ? 'Bu konuda henüz blog yok — aşağıdaki başlıklarla yeni içerik oluşturabilirsiniz.'
                      : 'Mevcut bloglar %60 altı uyum — bu başlıklarla daha iyi içerik yazılabilir.'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {suggestedTitles.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-white/70 border border-violet-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-700 font-medium flex-1">{t}</p>
                    <button onClick={() => copyTitle(t)}
                      className="shrink-0 text-[10px] text-violet-600 hover:text-violet-800 bg-violet-100 hover:bg-violet-200 px-2 py-1 rounded-md transition-colors font-medium">
                      {copiedTitle === t ? '✓ Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Content Search Tab ───────────────────────────────────────────────────────

interface SearchResult extends BlogPost { score: number; matchedTerms: MatchedTerm[] }

function ContentSearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true)
    try {
      const res = await fetch('/api/blog-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data = await res.json()
        setResults(data.results ?? [])
        setTotalCount(data.totalBlogCount ?? 0)
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  // Debounced search as you type
  const handleChange = (val: string) => {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 400)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Konu veya Anahtar Kelime</label>
          <div className="relative">
            <input value={query} onChange={e => handleChange(e.target.value)}
              placeholder="Örn: kiracı hakları, yönetim planı, aidat hesaplama..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {loading && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Yazarken otomatik arar — blog, makale, herhangi bir içerik</p>
        </div>
      </div>

      {results !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-700">
              {results.length > 0 ? `${results.length} sonuç` : 'Sonuç bulunamadı'}
            </p>
            {totalCount > 0 && (
              <span className="text-[10px] text-slate-400 ml-auto">{totalCount} içerik tarandı</span>
            )}
          </div>
          {results.length === 0 && (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
              <p className="text-sm text-slate-500">
                &quot;<strong>{query}</strong>&quot; için içerik bulunamadı.
              </p>
              <p className="text-xs text-slate-400 mt-1">Farklı kelimeler deneyin veya blog anahtar kelimelerini zenginleştirin.</p>
            </div>
          )}
          {results.map(r => <RecCard key={r.id} rec={r as unknown as Recommendation} />)}
        </div>
      )}
    </div>
  )
}

// ─── Blog Management Tab ──────────────────────────────────────────────────────

function ManageTab() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editKw, setEditKw] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/blog-posts')
    if (res.ok) setPosts((await res.json()).posts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sync = async () => {
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/blog-posts/sync', { method: 'POST' })
    const data = await res.json()
    setSyncMsg(res.ok ? `✓ ${data.synced} blog senkronize edildi (toplam ${data.total})` : `✗ ${data.error ?? 'Hata'}`)
    if (res.ok) await load()
    setSyncing(false)
  }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true)
    const res = await fetch(`/api/blog-posts/${editId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualKeywords: editKw }),
    })
    if (res.ok) { setPosts(prev => prev.map(p => p.id === editId ? { ...p, manual_keywords: editKw } : p)); setEditId(null) }
    setSaving(false)
  }

  const deletePost = async (id: string) => {
    if (!confirm('Bu blog kaydını silmek istiyor musunuz?')) return
    const res = await fetch(`/api/blog-posts/${id}`, { method: 'DELETE' })
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== id))
  }

  const filtered = posts.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.url.toLowerCase().includes(search.toLowerCase()) ||
    (p.auto_keywords ?? []).some(k => k.includes(search.toLowerCase())) ||
    (p.manual_keywords ?? []).some(k => k.includes(search.toLowerCase()))
  )

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Yükleniyor...</div>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Blog veya kelime ara..."
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
        <span className="text-xs text-slate-400 flex-1">{filtered.length} blog</span>
        <button onClick={sync} disabled={syncing}
          className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg transition-colors">
          {syncing ? '⟳ Senkronize...' : '⟳ Senkronize Et'}
        </button>
      </div>
      {syncMsg && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${syncMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {syncMsg}
        </p>
      )}
      {posts.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <p className="text-slate-500 text-sm">Henüz blog verisi yok.</p>
          <p className="text-slate-400 text-xs mt-1">Admin panelinden sitemap URL&apos;sini ayarlayıp &quot;Senkronize Et&quot; butonuna basın.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Başlık / URL</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Oto. Kelimeler</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider w-64">Manuel Kelimeler</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Son Sync</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wider">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(post => {
                  const isEditing = editId === post.id
                  return (
                    <tr key={post.id} className={`border-b border-slate-100 ${isEditing ? 'bg-blue-50/40' : 'hover:bg-slate-50/50'}`}>
                      <td className="px-3 py-2 max-w-[240px]">
                        <p className="font-medium text-slate-800 truncate" title={post.title}>{post.title}</p>
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-blue-500 hover:underline truncate block" title={post.url}>{post.url}</a>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-0.5 max-w-[200px]">
                          {(post.auto_keywords ?? []).slice(0, 6).map(k => (
                            <span key={k} className="bg-green-50 text-green-700 text-[9px] px-1.5 py-0.5 rounded-full border border-green-100">{k}</span>
                          ))}
                          {(post.auto_keywords ?? []).length > 6 && (
                            <span className="text-[9px] text-slate-400">+{(post.auto_keywords ?? []).length - 6}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 w-64">
                        {isEditing
                          ? <KeywordEditor keywords={editKw} onChange={setEditKw} placeholder="Manuel kelime ekle" />
                          : <div className="flex flex-wrap gap-0.5">
                              {(post.manual_keywords ?? []).length === 0
                                ? <span className="text-[10px] text-slate-300 italic">—</span>
                                : (post.manual_keywords ?? []).map(k => (
                                    <span key={k} className="bg-blue-50 text-blue-700 text-[9px] px-1.5 py-0.5 rounded-full border border-blue-100">{k}</span>
                                  ))}
                            </div>
                        }
                      </td>
                      <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">
                        {post.last_synced ? fmt(post.last_synced) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isEditing
                          ? <div className="flex items-center justify-center gap-1">
                              <button onClick={saveEdit} disabled={saving}
                                className="text-[10px] bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                                {saving ? '...' : 'Kaydet'}
                              </button>
                              <button onClick={() => setEditId(null)}
                                className="text-[10px] text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100">İptal</button>
                            </div>
                          : <div className="flex items-center justify-center gap-1">
                              <button onClick={() => { setEditId(post.id); setEditKw([...(post.manual_keywords ?? [])]) }}
                                className="text-[10px] text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 font-medium">Düzenle</button>
                              <button onClick={() => deletePost(post.id)}
                                className="text-[10px] text-red-400 px-1.5 py-1 rounded-lg hover:bg-red-50">✕</button>
                            </div>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = 'youtube' | 'search' | 'manage'

export default function BlogToolsClient({ userRole }: { userRole: string }) {
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  const [tab, setTab] = useState<Tab>('youtube')

  const tabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'youtube', label: '🎬 YouTube Blog Bulucu' },
    { key: 'search',  label: '🔍 İçerik Bulucu' },
    { key: 'manage',  label: '🗂 Blog Yönetimi', adminOnly: true },
  ]

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Blog Bulucu</h1>
        <p className="text-sm text-slate-500 mt-0.5">İçeriklerinize uygun blog yazılarını keşfedin.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.filter(t => !t.adminOnly || isAdmin).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'youtube' && <YouTubeTab />}
      {tab === 'search'  && <ContentSearchTab />}
      {tab === 'manage'  && isAdmin && <ManageTab />}
    </div>
  )
}
