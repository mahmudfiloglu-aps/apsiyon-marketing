import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 60

export interface AgendaSuggestion {
  newsTitle: string
  newsUrl: string
  pubDate: string
  priority: 'high' | 'medium' | 'low'
  priorityReason: string
  contentTypes: ('blog' | 'social')[]
  blogTitle: string
  blogAngle: string
  socialCaption: string
}

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

interface RSSItem { title: string; link: string; pubDate: string }

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() || ''
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
      || block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1]?.trim() || ''
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || ''
    if (title && title.length > 5) items.push({ title, link, pubDate })
  }
  return items
}

async function fetchNews(): Promise<RSSItem[]> {
  const queries = [
    'emlak konut gayrimenkul',
    'site yönetimi apartman kat mülkiyeti',
    'kentsel dönüşüm yapı konut kredisi',
  ]
  const results: RSSItem[] = []
  const seen = new Set<string>()

  await Promise.allSettled(
    queries.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`
      try {
        const res = await fetch(url, {
          next: { revalidate: 0 },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        })
        if (!res.ok) {
          console.error(`agenda RSS fetch failed for "${q}": HTTP ${res.status}`)
          return
        }
        const xml = await res.text()
        const items = parseRSS(xml)
        for (const item of items) {
          if (!seen.has(item.title)) {
            seen.add(item.title)
            results.push(item)
          }
        }
      } catch (err) {
        console.error(`agenda RSS fetch threw for "${q}":`, err)
      }
    })
  )

  return results.slice(0, 20)
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const news = await fetchNews()
    if (!news.length) {
      return NextResponse.json({ error: 'Haberler alınamadı' }, { status: 500 })
    }

    const newsText = news
      .map((n, i) => `${i + 1}. "${n.title}" (${n.pubDate ? new Date(n.pubDate).toLocaleDateString('tr-TR') : 'bugün'})`)
      .join('\n')

    const prompt = `Sen Apsiyon'un içerik pazarlama uzmanısın. Apsiyon, Türkiye'nin lider site ve apartman yönetim yazılımı sağlayıcısıdır. Hedef kitlesi: site yöneticileri, apartman sakinleri, emlak profesyonelleri, yönetim kurulu başkanları.\n\nAşağıdaki güncel Türkçe haberleri inceleyerek Apsiyon için içerik fırsatları belirle. Her haber için hem blog yazısı hem sosyal medya (LinkedIn odaklı) önerisi üret.\n\nHaberler:\n${newsText}\n\nYanıtını SADECE aşağıdaki JSON formatında ver, başka açıklama ekleme:\n[\n  {\n    "newsTitle": "haber başlığı",\n    "newsUrl": "",\n    "pubDate": "",\n    "priority": "high|medium|low",\n    "priorityReason": "neden öncelikli olduğunu 1 cümlede açıkla",\n    "contentTypes": ["blog", "social"],\n    "blogTitle": "önerilen blog yazısı başlığı",\n    "blogAngle": "blog açısı ve ana mesaj (2-3 cümle)",\n    "socialCaption": "LinkedIn paylaşımı için hazır metin (150-200 karakter, emojisiz)"\n  }\n]\n\nÖncelik kriterleri:\n- high: Apsiyon'un temel ürünüyle (site/apartman yönetimi) doğrudan ilişkili, zamanlı\n- medium: Emlak/konut sektörüyle ilgili, dolaylı bağlantılı\n- low: Genel sektör haberi, zayıf bağlantı\n\nSadece Apsiyon için anlamlı olan haberleri dahil et (en az 5, en fazla 10 öneri). Haber başlığını olduğu gibi kopyala.`

    const ai = getAiClient()
    const modelName = process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash'

    const result = await Promise.race([
      ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.4 },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
    ])

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI yanıtı ayrıştırılamadı' }, { status: 500 })
    }

    let suggestions: AgendaSuggestion[]
    try {
      suggestions = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error('agenda JSON.parse error:', parseErr, 'raw:', jsonMatch[0].slice(0, 500))
      return NextResponse.json({ error: 'AI yanıtı ayrıştırılamadı', detail: parseErr instanceof Error ? parseErr.message : String(parseErr) }, { status: 500 })
    }

    // Attach URLs from fetched news
    for (const s of suggestions) {
      const found = news.find(n => n.title.includes(s.newsTitle.slice(0, 30)))
      if (found) {
        s.newsUrl = found.link
        s.pubDate = found.pubDate
      }
    }

    return NextResponse.json({ suggestions, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('agenda error:', err)
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Bir hata oluştu', detail }, { status: 500 })
  }
}
