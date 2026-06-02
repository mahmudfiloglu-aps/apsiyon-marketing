import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { saveDecisions } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { analysisId, decisions } = await req.json() as {
    analysisId: string
    decisions: { leadId: string; aiStatus: string; userDecision: string; userNote?: string }[]
  }

  if (!analysisId || !decisions?.length) return Response.json({ ok: true })

  await saveDecisions(analysisId, decisions)
  return Response.json({ ok: true })
}
