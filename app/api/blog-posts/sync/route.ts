import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getBlogSetting, upsertBlogPost } from '@/lib/db'

export const maxDuration = 60

const TR_STOPWORDS = new Set([
  've', 'ile', 'icin', 'için', 'bu', 'bir', 'de', 'da', 'ne', 'mi', 'ya',
  'diye', 'gibi', 'olan', 'olarak', 'veya', 'ki', 'hem', 'ise', 'nasil',
  'nasıl', 'neden', 'hangi', 'kac', 'kaç', 'en', 'daha', 'cok', 'çok',
  'az', 'her', 'bazi', 'bazı', 'hic', 'hiç', 'tum', 'tüm', 'hep', 'zaten',
  'artik', 'artık', 'yani', 'sadece', 'bile', 'ancak', 'fakat', 'lakin',
  'oysa', 'sonra', 'once', 'önce', 'gore', 'göre', 'kadar', 'beri',
  'ama', 'vs', 'ile', 'olan', 'olmak', 'olur', 'oldu', 'olarak',
  'var', 'yok', 'daha', 'cok', 'cok', 'olan', 'olan',
])

function extractKeywords(slug: string): string[] {
  return [...new Set(
    slug.split('-')
      .map((w) => w.toLowerCase().trim())
      .filter((w) => w.length >= 3 && !TR_STOPWORDS.has(w) && !/^\d+$/.test(w))
  )]
}

function slugToTitle(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

async function fetchSitemapUrls(url: string): Promise<string[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'ApsiyonBot/1.0' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Sitemap alınamadı: ${res.status}`)
  const xml = await res.text()

  // Sitemap index: contains <sitemap> entries
  const isSitemapIndex = xml.includes('<sitemapindex')
  if (isSitemapIndex) {
    const subUrls = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/g)].map((m) => m[1].trim())
    const nested = await Promise.all(subUrls.map((u) => fetchSitemapUrls(u).catch(() => [] as string[])))
    return nested.flat()
  }

  return [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/g)].map((m) => m[1].trim())
}

export async function POST() {
  const session = await getSession()
  if (!session || !['admin', 'super_admin'].includes(session.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const sitemapUrl = await getBlogSetting('sitemap_url')
  if (!sitemapUrl) return NextResponse.json({ error: 'Sitemap URL ayarlanmamış' }, { status: 400 })

  let allUrls: string[]
  try {
    allUrls = await fetchSitemapUrls(sitemapUrl)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  // Filter blog URLs
  const blogUrls = allUrls.filter((u) => u.includes('/blog'))
  if (!blogUrls.length) return NextResponse.json({ error: 'Blog URL bulunamadı', total: allUrls.length }, { status: 404 })

  let synced = 0
  for (const url of blogUrls) {
    try {
      // Extract slug: everything after /blog/
      const match = url.match(/\/blog\/(.+?)\/?$/)
      const slug = match ? match[1].replace(/\/$/, '') : url.split('/').filter(Boolean).pop() ?? ''
      if (!slug) continue
      const title = slugToTitle(slug)
      const keywords = extractKeywords(slug)
      await upsertBlogPost(url, slug, title, keywords)
      synced++
    } catch {}
  }

  return NextResponse.json({ ok: true, synced, total: blogUrls.length })
}
