import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { deleteReportFile } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { fileId } = await params
  await deleteReportFile(fileId, session.userId)
  return NextResponse.json({ ok: true })
}
