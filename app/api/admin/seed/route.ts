import { NextResponse } from 'next/server'
import { setSuperAdmin, createUsersTable } from '@/lib/db'

// One-time endpoint to promote marketing@apsiyon.com to super_admin
// Protected by a secret key
export async function POST() {
  const secret = process.env.SEED_SECRET
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 403 })
  await createUsersTable()
  await setSuperAdmin('marketing@apsiyon.com')
  return NextResponse.json({ ok: true })
}
