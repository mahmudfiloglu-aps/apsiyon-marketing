import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createAnalysesTable, listAnalyses, saveAnalysis } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await createAnalysesTable()
  const rows = await listAnalyses(session.userId)
  return NextResponse.json({ analyses: rows })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, fileName, filteredCount, totalCount, results } = await req.json()
  if (!id || !fileName || !results) {
    return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
  }

  await createAnalysesTable()
  await saveAnalysis(id, session.userId, fileName, filteredCount ?? 0, totalCount ?? 0, results)
  return NextResponse.json({ ok: true })
}
