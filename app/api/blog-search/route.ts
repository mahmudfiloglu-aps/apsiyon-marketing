import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listBlogPosts } from '@/lib/db'

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

function scorePost(
  queryTokens: string[],
  post: { auto_keywords: string[]; manual_keywords: string[]; slug: string; title: string }
): { score: number; matchedTerms: MatchedTerm[] } {
  if (!queryTokens.length) return { score: 0, matchedTerms: [] }

  const autoNorm   = (post.auto_keywords   ?? []).map(normTR)
  const manualNorm = (post.manual_keywords ?? []).map(normTR)
  const titleTok   = tokenize(post.title ?? '')
  const slugTok    = tokenize(post.slug ?? '')
  const allKw      = [...autoNorm, ...manualNorm, ...titleTok, ...slugTok]

  let score = 0
  const matched: MatchedTerm[] = []
  const seen = new Set<string>()

  for (const qt of queryTokens) {
    const mManual = manualNorm.findIndex(k => tokensMatch(qt, k))
    const mAuto   = autoNorm.findIndex(k => tokensMatch(qt, k))
    const mTitle  = titleTok.findIndex(k => tokensMatch(qt, k))

    if (mManual >= 0)     { score += 4; const t = post.manual_keywords[mManual]; if (!seen.has(t)) { seen.add(t); matched.push({ term: t, type: 'manual' }) } }
    else if (mAuto >= 0)  { score += 3; const t = post.auto_keywords[mAuto];   if (!seen.has(t)) { seen.add(t); matched.push({ term: t, type: 'auto' })   } }
    else if (mTitle >= 0) { score += 2; const t = titleTok[mTitle];             if (!seen.has(t)) { seen.add(t); matched.push({ term: t, type: 'title' })  } }
    else if (slugTok.some(k => tokensMatch(qt, k))) score += 1
    else if (allKw.some(k => k.includes(qt) && qt.length >= 4)) score += 1
  }

  return {
    score: Math.min(100, Math.round((score / (4 * queryTokens.length)) * 100)),
    matchedTerms: matched.slice(0, 10),
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await req.json()
  if (!query?.trim()) return NextResponse.json({ results: [] })

  let posts: Record<string, unknown>[]
  try {
    posts = (await listBlogPosts()) as Record<string, unknown>[]
  } catch {
    return NextResponse.json({ error: 'Veritabanı hatası' }, { status: 500 })
  }

  const queryTokens = tokenize(query)
  const results = posts
    .map(p => {
      const { score, matchedTerms } = scorePost(queryTokens, p as Parameters<typeof scorePost>[1])
      return { ...p, score, matchedTerms }
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  return NextResponse.json({ results, totalBlogCount: posts.length })
}
