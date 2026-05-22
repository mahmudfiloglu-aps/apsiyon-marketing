import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAnalysis, deleteAnalysis } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await getAnalysis(id, session.userId)
  if (!row) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })

  return NextResponse.json({ analysis: row })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteAnalysis(id, session.userId)
  return NextResponse.json({ ok: true })
}
