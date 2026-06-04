'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Geçersiz bağlantı')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Şifreler eşleşmiyor')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/sign-in'), 3000)
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-[#00A5DF] rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">A</span>
          </div>
        </div>

        {success ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Şifre Güncellendi</h1>
            <p className="text-sm text-gray-500 mb-6">
              Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz...
            </p>
            <Link href="/sign-in" className="text-[#00A5DF] hover:underline text-sm font-medium">
              Giriş Yap →
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Yeni Şifre</h1>
              <p className="text-sm text-gray-500 mt-2">Yeni şifrenizi belirleyin.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Yeni Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00A5DF]"
                  placeholder="En az 6 karakter"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Şifre Tekrar</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00A5DF]"
                  placeholder="••••••"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full bg-[#00A5DF] text-white py-3 rounded-xl font-medium hover:bg-[#0090c4] transition-colors disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Güncelleniyor...' : 'Şifremi Güncelle'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              <Link href="/sign-in" className="text-[#00A5DF] hover:underline font-medium">
                ← Giriş sayfasına dön
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
