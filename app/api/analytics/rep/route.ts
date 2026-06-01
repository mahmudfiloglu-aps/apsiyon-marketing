import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { getRepLeads } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const name = req.nextUrl.searchParams.get('name')
  if (!name) return Response.json({ error: 'name required' }, { status: 400 })
  const leads = await getRepLeads(session.userId, name)
  return Response.json({ leads })
}
