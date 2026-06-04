import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import {
  createPasswordResetTokensTable,
  getResetToken,
  markResetTokenUsed,
  updateUserPassword,
} from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token ve şifre zorunludur' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Şifre en az 6 karakter olmalıdır' }, { status: 400 })
    }

    await createPasswordResetTokensTable()

    const resetToken = await getResetToken(token)
    if (!resetToken) {
      return NextResponse.json({ error: 'Geçersiz veya süresi dolmuş bağlantı' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await updateUserPassword(resetToken.user_id, passwordHash)
    await markResetTokenUsed(token)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 })
  }
}
