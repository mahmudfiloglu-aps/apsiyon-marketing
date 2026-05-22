import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createUser, createUsersTable, getUserByEmail } from '@/lib/db'
import { createToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Tüm alanlar zorunludur' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Şifre en az 6 karakter olmalıdır' },
        { status: 400 }
      )
    }

    await createUsersTable()

    const existing = await getUserByEmail(email)
    if (existing) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi zaten kayıtlı' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await createUser(email, passwordHash, name)
    const token = await createToken({ userId: user.id, email: user.email, name: user.name })

    const res = NextResponse.json({ success: true })
    const isProd = process.env.NODE_ENV === 'production'
    res.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
    return res
  } catch (err) {
    console.error('signup error:', err)
    return NextResponse.json({ error: 'Kayıt başarısız' }, { status: 500 })
  }
}
