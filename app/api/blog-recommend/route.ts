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

// ─── Turkish-aware text normalization ────────────────────────────────────────

// Converts Turkish chars to ASCII so slug keywords (ö→o) match user input (ö)
function normTR(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/g, 'i').replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
    .replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
}

function tokenize(text: string): string[] {
  return normTR(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
}

// Two tokens match if one is a prefix of the other (min 4 chars) or exact.
// Handles Turkish stemming heuristically: "yönetim"/"yönetimleri" both → "yonetim"
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  const minLen = Math.min(a.length, b.length)
  if (minLen < 4) return false
  // prefix match: "yonetim" matches "yoneticilerin" and vice-versa
  return a.startsWith(b.slice(0, minLen)) || b.startsWith(a.slice(0, minLen))
}

function localScore(
  queryTokens: string[],
  autoKw: string[],
  manualKw: string[],
  slug: string,
  title: string,
): number {
  if (!queryTokens.length) return 0

  const autoNorm   = autoKw.map(normTR)
  const manualNorm = manualKw.map(normTR)
  const titleTokens = tokenize(title)
  const slugTokens  = tokenize(slug)
  // all keywords to match against
  const allKw = [...autoNorm, ...manualNorm, ...titleTokens, ...slugTokens]

  let score = 0
  for (const qt of queryTokens) {
    const matchedAuto   = autoNorm.some((k)   => tokensMatch(qt, k))
    const matchedManual = manualNorm.some((k)  => tokensMatch(qt, k))
    const matchedTitle  = titleTokens.some((k) => tokensMatch(qt, k))
    const matchedSlug   = slugTokens.some((k)  => tokensMatch(qt, k))

    if (matchedManual) score += 4   // manual keywords: highest signal
    else if (matchedAuto) score += 3
    else if (matchedTitle) score += 2
    else if (matchedSlug) score += 1
    // also reward if a keyword contains the query token
    else if (allKw.some((k) => k.includes(qt) && qt.length >= 4)) score += 1
  }

  // Normalize: max possible score = 4 * queryTokens.length
  const normalized = (score / (4 * queryTokens.length)) * 100
  return Math.min(100, Math.round(normalized))
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
      totalBlogCount: 0,
      message: 'Henüz blog verisi yok. Admin panelinden sitemap URL\'sini ayarlayıp senkronize edin.',
    })
  }

  // Score every post with the improved local scorer
  const queryTokens = tokenize(`${title} ${description ?? ''}`)
  const scored = posts
    .map((p) => ({
      ...p,
      score: localScore(queryTokens, p.auto_keywords ?? [], p.manual_keywords ?? [], p.slug ?? '', p.title ?? ''),
    }))
    .sort((a, b) => b.score - a.score)

  // Candidates: top 15 with score > 0 (sent to AI)
  const candidates = scored.filter((p) => p.score > 0).slice(0, 15)

  // Fallback result set — top 5 with score >= 5, or top 3 if nothing above 5
  const postMap = Object.fromEntries(posts.map((p) => [p.id, p]))
  const fallbackPool = candidates.length >= 3
    ? candidates.filter((p) => p.score >= 5).slice(0, 5)
    : scored.slice(0, 3)          // last resort: just top 3 whatever score
  const fallbackResults = fallbackPool.map((p) => ({
    ...postMap[p.id], score: p.score, reason: 'Anahtar kelime eşleşmesi', aiUsed: false,
  }))

  // Try AI scoring
  let finalResults = fallbackResults
  let aiUsed = false

  if (candidates.length > 0) {
    try {
      const aiRecs = await aiScore(title, description, candidates)
      const enriched = aiRecs
        .filter((r) => postMap[r.id] && r.score >= 35)
        .map((r) => ({ ...postMap[r.id], score: r.score, reason: r.reason, aiUsed: true }))
        .sort((a, b) => b.score - a.score)
      if (enriched.length >= 1) {
        finalResults = enriched.slice(0, 5)
        aiUsed = true
      }
    } catch (e) {
      console.warn('[blog-recommend] AI fallback:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({
    recommendations: finalResults,
    aiUsed,
    totalBlogCount: posts.length,
    matchedCount: candidates.length,
    ...(aiUsed ? {} : { notice: 'AI değerlendirme tamamlanamadı; anahtar kelime eşleşmesi kullanıldı.' }),
  })
}
