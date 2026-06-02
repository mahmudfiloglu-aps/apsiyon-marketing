import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { upsertReportFile } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: projectId } = await params
  const { id, fileType, isPrevious, fileName, data } = await req.json()
  if (!id || !fileType || !fileName || !data) return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
  await upsertReportFile(id, projectId, fileType, isPrevious ?? false, fileName, data)
  return NextResponse.json({ ok: true })
}
