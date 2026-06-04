import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth'
import { listUsers, updateUserRole, updateUserPassword } from '@/lib/db'

function isAdmin(role: string) {
  return role === 'super_admin' || role === 'admin'
}

export async function GET() {
  const session = await getSession()
  if (!session || !isAdmin(session.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await listUsers()
  return NextResponse.json({ users })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session || !isAdmin(session.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId, role } = await req.json()
  if (!userId || !role) return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
  const allowed = ['super_admin', 'admin', 'viewer']
  if (!allowed.includes(role)) return NextResponse.json({ error: 'Geçersiz rol' }, { status: 400 })
  // Only super_admin can set super_admin role
  if (role === 'super_admin' && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  await updateUserRole(userId, role)
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const { userId, password } = await req.json()
  if (!userId || !password || password.length < 6) {
    return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 })
  }
  const hash = await bcrypt.hash(password, 10)
  await updateUserPassword(userId, hash)
  return NextResponse.json({ ok: true })
}
