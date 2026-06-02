import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createUsersTable, getUserByEmail } from '@/lib/db'
import { createToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'E-posta ve şifre zorunludur' },
        { status: 400 }
      )
    }

    await createUsersTable()

    const user = await getUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: 'E-posta veya şifre hatalı' },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json(
        { error: 'E-posta veya şifre hatalı' },
        { status: 401 }
      )
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? 'viewer',
    })

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
    console.error('login error:', err)
    return NextResponse.json({ error: 'Giriş başarısız' }, { status: 500 })
  }
}
