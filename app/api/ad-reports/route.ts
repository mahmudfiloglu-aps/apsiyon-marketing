import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listAdReports, saveAdReport, getModulePermissions } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const perms = await getModulePermissions(session.userId)
  if (!perms.ad_reports) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const reports = await listAdReports(session.userId)
  return NextResponse.json({ reports })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const perms = await getModulePermissions(session.userId)
  if (!perms.ad_reports) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, tabName, source, fileName, data } = await req.json()
  if (!id || !tabName || !source || !fileName || !data) {
    return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
  }
  await saveAdReport(id, session.userId, tabName, source, fileName, data)
  return NextResponse.json({ ok: true })
}
