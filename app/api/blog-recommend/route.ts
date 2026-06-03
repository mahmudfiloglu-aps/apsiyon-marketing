import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listBlogPosts } from '@/lib/db'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 60

function getAiClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not configured')
  const credEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  let googleAuthOptions: Record<string, unknown> | undefined
  if (credEnv?.trim().startsWith('{')) {
    try { googleAuthOptions = { credentials: JSON.parse(credEnv) } } catch {}
  }
  return new GoogleGenAI({
    vertexai: true, project, location,
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  })
}

// ─── Local keyword scoring (instant fallback) ─────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-zçğıöşüa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
}

function localScore(queryTokens: string[], autoKw: string[], manualKw: string[]): number {
  if (!queryTokens.length) return 0
  const allKw = [...autoKw, ...manualKw].map((k) => k.toLowerCase())
  let hits = 0
  for (const qt of queryTokens) {
    if (allKw.some((k) => k.includes(qt) || qt.includes(k))) hits++
  }
  // manual keywords carry extra weight (already counted once, add again)
  let manualHits = 0
  for (const qt of queryTokens) {
    if (manualKw.map((k) => k.toLowerCase()).some((k) => k.includes(qt) || qt.includes(k))) manualHits++
  }
  const raw = (hits + manualHits) / queryTokens.length
  return Math.min(100, Math.round(raw * 130))
}

interface BlogPost {
  id: string; url: string; slug: string; title: string
  auto_keywords: string[]; manual_keywords: string[]
}

interface AiRec { id: string; score: number; reason: string }

// ─── AI scoring with strict timeout ──────────────────────────────────────────

async function aiScore(title: string, description: string, candidates: BlogPost[]): Promise<AiRec[]> {
  const blogList = candidates.map((p, i) => {
    const kw = [...(p.auto_keywords ?? []), ...(p.manual_keywords ?? [])].join(', ')
    return `${i + 1}. ID:${p.id} | ${p.title} | ${kw}`
  }).join('\n')

  const prompt = `Sen bir içerik stratejistisisin. YouTube videosu için uygun blog öner.

Video: ${title}
Açıklama: ${description ?? '(yok)'}

Bloglar:
${blogList}

Her blog için 0-100 puan ver (65+: doğrudan ilgili, 35-64: destekleyici, 0-34: önermez).
Minimum 3, maksimum 5 öneri. 35 altını ekleme (3'e ulaşamasan bile).

Sadece JSON array döndür:
[{"id":"UUID","score":80,"reason":"Kısa Türkçe açıklama"}]`

  const TIMEOUT_MS = 25_000
  const aiPromise = getAiClient().models.generateContent({
    model: process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash',
    contents: prompt,
  })
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('ai_timeout')), TIMEOUT_MS)
  )

  const response = await Promise.race([aiPromise, timeoutPromise])
  const text = (response as Awaited<typeof aiPromise>).text ?? ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('no_json')
  return JSON.parse(match[0]) as AiRec[]
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Başlık gerekli' }, { status: 400 })

  // DB query with its own error handling
  let posts: BlogPost[]
  try {
    posts = (await listBlogPosts()) as BlogPost[]
  } catch (e) {
    console.error('[blog-recommend] DB error:', e)
    return NextResponse.json({ error: 'Veritabanı hatası' }, { status: 500 })
  }

  if (!posts.length) {
    return NextResponse.json({
      recommendations: [],
      message: 'Henüz blog verisi yok. Admin panelinden sitemap URL\'sini ayarlayıp "Senkronize Et" butonuna basın.',
    })
  }

  // Always compute local scores first (instant)
  const queryTokens = tokenize(`${title} ${description ?? ''}`)
  const withLocal = posts
    .map((p) => ({ ...p, localScore: localScore(queryTokens, p.auto_keywords ?? [], p.manual_keywords ?? []) }))
    .filter((p) => p.localScore > 0)
    .sort((a, b) => b.localScore - a.localScore)
    .slice(0, 15)

  // Fallback result set (used if AI fails or is skipped)
  const postMap = Object.fromEntries(posts.map((p) => [p.id, p]))
  const fallbackResults = withLocal
    .filter((p) => p.localScore >= 20)
    .slice(0, 5)
    .map((p) => ({ ...postMap[p.id], score: p.localScore, reason: 'Anahtar kelime eşleşmesi', aiUsed: false }))

  // Try AI scoring — gracefully skip on timeout/error
  let finalResults = fallbackResults
  let aiUsed = false

  if (withLocal.length > 0) {
    try {
      const aiRecs = await aiScore(title, description, withLocal)
      const enriched = aiRecs
        .filter((r) => postMap[r.id] && r.score >= 35)
        .map((r) => ({ ...postMap[r.id], score: r.score, reason: r.reason, aiUsed: true }))
        .sort((a, b) => b.score - a.score)
      if (enriched.length >= 1) {
        finalResults = enriched.slice(0, 5)
        aiUsed = true
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[blog-recommend] AI fallback:', msg)
      // use fallbackResults already set above
    }
  }

  return NextResponse.json({
    recommendations: finalResults,
    aiUsed,
    ...(aiUsed ? {} : { notice: 'AI değerlendirme yapılamadı; anahtar kelime eşleşmesi kullanıldı.' }),
  })
}
