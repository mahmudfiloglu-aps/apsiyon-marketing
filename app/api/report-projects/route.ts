import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listReportProjects, createReportProject } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projects = await listReportProjects(session.userId)
  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, projectName, periodType } = await req.json()
  if (!id || !projectName) return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
  await createReportProject(id, session.userId, projectName, periodType ?? 'monthly')
  return NextResponse.json({ ok: true })
}
