import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  createUsersTable,
  getUserByEmail,
  createPasswordResetTokensTable,
  createResetToken,
} from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'E-posta zorunludur' }, { status: 400 })
    }

    await createUsersTable()
    await createPasswordResetTokensTable()

    const user = await getUserByEmail(email)
    // Kullanıcı bulunamasa bile başarılı dön — e-posta varlığını açığa çıkarma
    if (!user) {
      return NextResponse.json({ success: true })
    }

    const token = crypto.randomBytes(32).toString('hex')
    await createResetToken(user.id, token)

    const host = req.headers.get('host') || ''
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('RESEND_API_KEY tanımlı değil')
      return NextResponse.json({ error: 'Mail servisi yapılandırılmamış' }, { status: 500 })
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@apsiyon.com'

    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Apsiyon Marketing <${fromEmail}>`,
        to: email,
        subject: 'Şifre Sıfırlama',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <h2 style="color:#00A5DF;margin-bottom:8px;">Şifre Sıfırlama</h2>
            <p style="color:#334155;">Merhaba ${user.name},</p>
            <p style="color:#334155;">Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Bu bağlantı <strong>1 saat</strong> geçerlidir.</p>
            <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:#00A5DF;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Şifremi Sıfırla</a>
            <p style="color:#94a3b8;font-size:13px;">Bu isteği siz yapmadıysanız bu e-postasını görmezden gelebilirsiniz.</p>
          </div>
        `,
      }),
    })

    if (!mailRes.ok) {
      const err = await mailRes.text()
      console.error('Resend error:', err)
      return NextResponse.json({ error: 'Mail gönderilemedi' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('forgot-password error:', err)
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 })
  }
}
