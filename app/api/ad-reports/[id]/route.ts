import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAdReport, deleteAdReport } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const report = await getAdReport(id, session.userId)
  if (!report) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
  return NextResponse.json({ report })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteAdReport(id, session.userId)
  return NextResponse.json({ ok: true })
}
