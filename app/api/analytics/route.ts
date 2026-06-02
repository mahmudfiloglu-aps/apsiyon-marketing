import { getSession } from '@/lib/auth'
import { getAnalytics, getDecisionAccuracy } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [analytics, accuracy] = await Promise.all([
    getAnalytics(session.userId),
    getDecisionAccuracy(session.userId),
  ])

  return Response.json({ ...analytics, accuracy })
}
