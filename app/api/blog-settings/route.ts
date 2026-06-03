import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getBlogSetting, setBlogSetting } from '@/lib/db'

export async function GET() {
  const sitemapUrl = await getBlogSetting('sitemap_url')
  return NextResponse.json({ sitemapUrl: sitemapUrl ?? '' })
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'super_admin'].includes(session.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { sitemapUrl } = await req.json()
  if (!sitemapUrl?.trim()) return NextResponse.json({ error: 'URL gerekli' }, { status: 400 })

  await setBlogSetting('sitemap_url', sitemapUrl.trim())
  return NextResponse.json({ ok: true })
}
