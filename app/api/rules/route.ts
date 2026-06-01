import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCustomRules, saveCustomRule, deleteCustomRule, toggleCustomRule } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const rules = await getCustomRules(session.userId)
  return Response.json({ rules })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { ruleText } = await req.json()
  if (!ruleText?.trim()) return Response.json({ error: 'ruleText required' }, { status: 400 })
  const rule = await saveCustomRule(session.userId, ruleText.trim())
  return Response.json({ rule })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await deleteCustomRule(session.userId, id)
  return Response.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, isActive } = await req.json()
  await toggleCustomRule(session.userId, id, isActive)
  return Response.json({ ok: true })
}
