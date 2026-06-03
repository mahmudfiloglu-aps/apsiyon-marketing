import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { updateBlogPostKeywords, deleteBlogPost } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !['admin', 'super_admin'].includes(session.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const { manualKeywords } = await req.json()
  if (!Array.isArray(manualKeywords)) return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 })

  await updateBlogPostKeywords(id, manualKeywords.map((k: string) => k.trim()).filter(Boolean))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !['admin', 'super_admin'].includes(session.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  await deleteBlogPost(id)
  return NextResponse.json({ ok: true })
}
