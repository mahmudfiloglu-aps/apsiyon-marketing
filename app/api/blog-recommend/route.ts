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
  return new GoogleGenAI({ vertexai: true, project, location, ...(googleAuthOptions ? { googleAuthOptions } : {}) })
}

// ─── Turkish-aware helpers ────────────────────────────────────────────────────

function normTR(text: string): string {
  return text.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/g, 'i').replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
    .replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
}

function tokenize(text: string): string[] {
  return normTR(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3)
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  const minLen = Math.min(a.length, b.length)
  if (minLen < 4) return false
  return a.startsWith(b.slice(0, minLen)) || b.startsWith(a.slice(0, minLen))
}

interface MatchedTerm { term: string; type: 'manual' | 'auto' | 'title' }

function computeMatches(
  queryTokens: string[],
  autoKw: string[], manualKw: string[], title: string,
): MatchedTerm[] {
  const seen = new Set<string>()
  const result: MatchedTerm[] = []

  const check = (kw: string, type: MatchedTerm['type']) => {
    if (seen.has(kw)) return
    const norm = normTR(kw)
    if (queryTokens.some(qt => tokensMatch(qt, norm) || norm.includes(qt))) {
      seen.add(kw)
      result.push({ term: kw, type })
    }
  }

  manualKw.forEach(k => check(k, 'manual'))
  autoKw.forEach(k => check(k, 'auto'))
  tokenize(title).forEach(k => check(k, 'title'))

  return result.slice(0, 10)
}

function localScore(
  queryTokens: string[],
  autoKw: string[], manualKw: string[], slug: string, title: string,
): number {
  if (!queryTokens.length) return 0
  const autoNorm   = autoKw.map(normTR)
  const manualNorm = manualKw.map(normTR)
  const titleTok   = tokenize(title)
  const slugTok    = tokenize(slug)
  const allKw      = [...autoNorm, ...manualNorm, ...titleTok, ...slugTok]

  let score = 0
  for (const qt of queryTokens) {
    if      (manualNorm.some(k => tokensMatch(qt, k)))   score += 4
    else if (autoNorm.some(k => tokensMatch(qt, k)))     score += 3
    else if (titleTok.some(k => tokensMatch(qt, k)))     score += 2
    else if (slugTok.some(k => tokensMatch(qt, k)))      score += 1
    else if (allKw.some(k => k.includes(qt) && qt.length >= 4)) score += 1
  }
  return Math.min(100, Math.round((score / (4 * queryTokens.length)) * 100))
}

function buildLocalReason(matched: MatchedTerm[]): string {
  if (!matched.length) return 'Genel içerik benzerliği'
  const manual = matched.filter(m => m.type === 'manual').map(m => m.term)
  const auto   = matched.filter(m => m.type === 'auto').map(m => m.term)
  if (manual.length) return `Manuel etiket eşleşmesi: ${manual.slice(0, 3).join(', ')}`
  if (auto.length)   return `Anahtar kelime eşleşmesi: ${auto.slice(0, 3).join(', ')}`
  return 'Başlık kelime benzerliği'
}

interface BlogPost {
  id: string; url: string; slug: string; title: string
  auto_keywords: string[]; manual_keywords: string[]
}
interface AiRec { id: string; score: number; reason: string }

// ─── AI scoring ───────────────────────────────────────────────────────────────

async function aiScore(title: string, description: string, candidates: BlogPost[], needTitles: boolean): Promise<{ recs: AiRec[]; suggestedTitles: string[] }> {
  const blogList = candidates.map((p, i) => {
    const kw = [...(p.auto_keywords ?? []), ...(p.manual_keywords ?? [])].join(', ')
    return `${i + 1}. ID:${p.id} | ${p.title} | ${kw}`
  }).join('\n')

  const titleBlock = needTitles ? `\nAyrıca bu video konusuyla ilgili 5 özgün Türkçe içerik/blog başlığı öner. "suggestedTitles" alanına dizi olarak ekle.` : ''

  const prompt = `Sen bir içerik stratejistisisin. YouTube videosu için uygun blog öner.

Video: ${title}
Açıklama: ${description ?? '(yok)'}

Bloglar:
${blogList}

Her blog için 0-100 puan ver (65+: doğrudan ilgili, 35-64: destekleyici, 0-34: önermez).
Minimum 3, maksimum 5 öneri. 35 altını ekleme (3'e ulaşamasan bile).${titleBlock}

Sadece JSON döndür:
{"recs":[{"id":"UUID","score":80,"reason":"Kısa Türkçe açıklama"}]${needTitles ? ',"suggestedTitles":["Başlık 1","Başlık 2"]' : ''}}`

  const TIMEOUT_MS = 25_000
  const aiP = getAiClient().models.generateContent({
    model: process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash',
    contents: prompt,
  })
  const response = await Promise.race([
    aiP,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ai_timeout')), TIMEOUT_MS)),
  ])
  const text = (response as Awaited<typeof aiP>).text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]) as { recs?: AiRec[]; suggestedTitles?: string[] }
    return { recs: parsed.recs ?? [], suggestedTitles: parsed.suggestedTitles ?? [] }
  }
  // Fallback: old array-only format
  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (!arrMatch) throw new Error('no_json')
  return { recs: JSON.parse(arrMatch[0]) as AiRec[], suggestedTitles: [] }
}

function templateTitles(topic: string): string[] {
  const t = topic.replace(/[?!.,]/g, '').trim()
  return [
    `${t}: Kapsamlı Rehber`,
    `${t} Hakkında Bilinmesi Gerekenler`,
    `${t} için Pratik İpuçları`,
    `${t}: Sık Sorulan Sorular`,
    `${t} — Adım Adım Kılavuz`,
  ]
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
      recommendations: [], totalBlogCount: 0,
      message: 'Henüz blog verisi yok. Admin panelinden sitemap URL\'sini ayarlayıp senkronize edin.',
    })
  }

  const queryTokens = tokenize(`${title} ${description ?? ''}`)
  const scored = posts
    .map(p => ({
      ...p,
      score: localScore(queryTokens, p.auto_keywords ?? [], p.manual_keywords ?? [], p.slug ?? '', p.title ?? ''),
      matchedTerms: computeMatches(queryTokens, p.auto_keywords ?? [], p.manual_keywords ?? [], p.title ?? ''),
    }))
    .sort((a, b) => b.score - a.score)

  const candidates = scored.filter(p => p.score > 0).slice(0, 15)
  const postMap = Object.fromEntries(posts.map(p => [p.id, p]))

  const fallbackPool = candidates.filter(p => p.score >= 5).slice(0, 5).length >= 1
    ? candidates.filter(p => p.score >= 5).slice(0, 5)
    : scored.slice(0, 3)

  const fallbackResults = fallbackPool.map(p => ({
    ...postMap[p.id],
    score: p.score,
    reason: buildLocalReason(p.matchedTerms),
    matchedTerms: p.matchedTerms,
    aiUsedForThis: false,
  }))

  let finalResults = fallbackResults
  let aiUsed = false

  let suggestedTitles: string[] = []

  if (candidates.length > 0) {
    try {
      const localMax = fallbackResults.reduce((m, r) => Math.max(m, r.score), 0)
      const needTitles = localMax < 60
      const { recs: aiRecs, suggestedTitles: aiTitles } = await aiScore(title, description, candidates, needTitles)
      const enriched = aiRecs
        .filter(r => postMap[r.id] && r.score >= 35)
        .map(r => ({
          ...postMap[r.id],
          score: r.score,
          reason: r.reason,
          matchedTerms: scored.find(p => p.id === r.id)?.matchedTerms ?? [],
          aiUsedForThis: true,
        }))
        .sort((a, b) => b.score - a.score)
      if (enriched.length >= 1) { finalResults = enriched.slice(0, 5); aiUsed = true }
      if (aiTitles.length) suggestedTitles = aiTitles
      // If AI ran but still no 60+ result, ensure we have title suggestions
      const maxScore = finalResults.reduce((m, r) => Math.max(m, r.score), 0)
      if (maxScore < 60 && !suggestedTitles.length) suggestedTitles = templateTitles(title)
    } catch (e) {
      console.warn('[blog-recommend] AI fallback:', e instanceof Error ? e.message : e)
    }
  }

  // Local fallback title suggestions (no AI)
  if (!aiUsed && fallbackResults.reduce((m, r) => Math.max(m, r.score), 0) < 60) {
    suggestedTitles = templateTitles(title)
  }

  return NextResponse.json({
    recommendations: finalResults,
    suggestedTitles,
    aiUsed,
    totalBlogCount: posts.length,
    matchedCount: candidates.length,
    ...(aiUsed ? {} : { notice: 'AI değerlendirme tamamlanamadı; anahtar kelime eşleşmesi kullanıldı.' }),
  })
}
