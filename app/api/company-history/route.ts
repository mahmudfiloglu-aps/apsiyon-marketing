import { NextRequest } from 'next/server'
import { getCompanyHistory } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { companies, excludeAnalysisId }: { companies: string[]; excludeAnalysisId?: string } =
    await req.json()

  if (!companies?.length) return Response.json({})

  const history = await getCompanyHistory(session.userId, companies, excludeAnalysisId)
  return Response.json(history)
}
