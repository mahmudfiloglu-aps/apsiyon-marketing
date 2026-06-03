import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listBlogPosts } from '@/lib/db'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 30

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

// Normalize text for keyword overlap: lowercase, strip punctuation
function normalize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-zçğıöşüa-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3)
}

// Pre-score blogs by keyword overlap with user query
function preScore(queryWords: string[], autoKw: string[], manualKw: string[]): number {
  const allKw = [...autoKw, ...manualKw].map((k) => k.toLowerCase())
  return queryWords.reduce((score, w) => score + (allKw.some((k) => k.includes(w) || w.includes(k)) ? 1 : 0), 0)
}

interface BlogPost {
  id: string
  url: string
  slug: string
  title: string
  auto_keywords: string[]
  manual_keywords: string[]
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Başlık gerekli' }, { status: 400 })

  const posts = (await listBlogPosts()) as BlogPost[]
  if (!posts.length) return NextResponse.json({ recommendations: [], message: 'Henüz blog verisi yok. Admin panelinden senkronize edin.' })

  // Pre-filter: score by keyword overlap, take top 25 for AI
  const queryWords = normalize(`${title} ${description ?? ''}`)
  const scored = posts
    .map((p) => ({ ...p, preScore: preScore(queryWords, p.auto_keywords ?? [], p.manual_keywords ?? []) }))
    .sort((a, b) => b.preScore - a.preScore)
    .slice(0, 25)

  // Build blog list for AI prompt
  const blogList = scored.map((p, i) => {
    const allKw = [...(p.auto_keywords ?? []), ...(p.manual_keywords ?? [])].join(', ')
    return `${i + 1}. ID:${p.id} | Başlık: ${p.title} | URL: ${p.url} | Kelimeler: ${allKw}`
  }).join('\n')

  const prompt = `Sen bir içerik stratejisti ve SEO uzmanısın. Bir YouTube videosu için en uygun blog yazılarını öneriyorsun.

## Video Bilgileri
Başlık: ${title}
Açıklama: ${description ?? '(belirtilmedi)'}

## Değerlendirme Kriterleri
- Konusal uyum: Video içeriği ile blog konusu örtüşüyor mu?
- Güncellik: Blog konusu hâlâ geçerli ve güncel mi?
- Değer: Video izleyicisi bu blogu okursa faydalanır mı?

## Mevcut Blog Yazıları
${blogList}

## Görevin
Her bloğu 0-100 arası puan ver:
- 65-100: Doğrudan ilgili, kesinlikle paylaşılmalı
- 35-64: Destekleyici içerik, paylaşılabilir
- 0-34: Yetersiz ilgi, önerme

Kurallar:
1. Minimum 3, maksimum 5 öneri yap
2. Eğer 65+ puanlı 3 blog yoksa, 35+ puanlılarla tamamla
3. 35 altı puanlı blogu hiç ekleme (3'e ulaşamasan da)
4. Aynı konudan birden fazla blog önerme

Cevabı SADECE geçerli JSON array olarak döndür:
[{"id":"UUID","score":85,"reason":"Kısa Türkçe açıklama (max 15 kelime)"},...]`

  let recommendations: { id: string; score: number; reason: string }[] = []

  try {
    const model = process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash'
    const response = await getAiClient().models.generateContent({ model, contents: prompt })
    const text = response.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) recommendations = JSON.parse(match[0])
  } catch (e) {
    console.error('[blog-recommend] AI error:', e)
    // Fallback: return top pre-scored posts
    recommendations = scored.slice(0, 5).map((p, i) => ({
      id: p.id, score: Math.max(10, 60 - i * 10), reason: 'Anahtar kelime eşleşmesi',
    }))
  }

  // Enrich with full blog data
  const postMap = Object.fromEntries(posts.map((p) => [p.id, p]))
  const enriched = recommendations
    .filter((r) => postMap[r.id])
    .map((r) => ({ ...r, ...postMap[r.id] }))
    .sort((a, b) => b.score - a.score)

  return NextResponse.json({ recommendations: enriched })
}
