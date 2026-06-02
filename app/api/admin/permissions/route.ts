import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllUserPermissions, setModulePermission, getModulePermissions } from '@/lib/db'

function isAdmin(role: string) {
  return role === 'super_admin' || role === 'admin'
}

export async function GET() {
  const session = await getSession()
  if (!session || !isAdmin(session.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await getAllUserPermissions()
  return NextResponse.json({ permissions })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session || !isAdmin(session.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId, module, isEnabled } = await req.json()
  if (!userId || !module || typeof isEnabled !== 'boolean') {
    return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
  }
  await setModulePermission(userId, module, isEnabled)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = await req.json()
  const targetId = userId ?? session.userId
  const permissions = await getModulePermissions(targetId)
  return NextResponse.json({ permissions })
}
