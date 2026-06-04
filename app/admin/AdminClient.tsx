'use client'

import { useEffect, useState, useCallback } from 'react'

const MODULES = [
  { key: 'lead_analysis', label: 'Lead Analizi' },
  { key: 'lead_quality', label: 'Lead Kalitesi' },
  { key: 'analytics', label: 'Analitik' },
  { key: 'keywords', label: 'Negatif Kelimeler' },
  { key: 'ad_reports', label: 'Reklam Raporları' },
  { key: 'blog_tools', label: 'Blog Araçları' },
  { key: 'settings', label: 'Ayarlar' },
]

const ROLES = ['super_admin', 'admin', 'viewer'] as const
type Role = typeof ROLES[number]

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Süper Admin',
  admin: 'Admin',
  viewer: 'Görüntüleyici',
}

interface UserRow {
  id: string
  email: string
  name: string
  role: string
  created_at: string
}

interface Props {
  currentUserRole: string
}

interface PasswordModal {
  userId: string
  userName: string
}

export default function AdminClient({ currentUserRole }: Props) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [sitemapSaving, setSitemapSaving] = useState(false)
  const [pwModal, setPwModal] = useState<PasswordModal | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const load = useCallback(async () => {
    const [uRes, pRes, sRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/permissions'),
      fetch('/api/blog-settings'),
    ])
    if (uRes.ok) setUsers((await uRes.json()).users ?? [])
    if (pRes.ok) setPermissions((await pRes.json()).permissions ?? {})
    if (sRes.ok) setSitemapUrl((await sRes.json()).sitemapUrl ?? '')
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 3000)
  }

  const saveSitemapUrl = async () => {
    setSitemapSaving(true)
    const res = await fetch('/api/blog-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitemapUrl }),
    })
    if (res.ok) flash('Sitemap URL kaydedildi')
    setSitemapSaving(false)
  }

  const getEffectivePerm = (userId: string, module: string) => {
    const userPerms = permissions[userId]
    if (!userPerms || !(module in userPerms)) return true
    return userPerms[module]
  }

  const changeRole = async (userId: string, role: string) => {
    setSaving(userId + '_role')
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
      flash('Rol güncellendi')
    }
    setSaving(null)
  }

  const togglePerm = async (userId: string, module: string, current: boolean) => {
    const key = userId + '_' + module
    setSaving(key)
    const isEnabled = !current
    const res = await fetch('/api/admin/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, module, isEnabled }),
    })
    if (res.ok) {
      setPermissions((prev) => ({
        ...prev,
        [userId]: { ...(prev[userId] ?? {}), [module]: isEnabled },
      }))
    }
    setSaving(null)
  }

  const submitPasswordReset = async () => {
    if (!pwModal) return
    if (newPassword.length < 6) { flash('Şifre en az 6 karakter olmalı', 'error'); return }
    setPwSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pwModal.userId, password: newPassword }),
    })
    if (res.ok) {
      flash(`${pwModal.userName} şifresi güncellendi`)
      setPwModal(null)
      setNewPassword('')
    } else {
      const data = await res.json()
      flash(data.error || 'Hata oluştu', 'error')
    }
    setPwSaving(false)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Kullanıcı Yönetimi</h1>
        <p className="text-sm text-slate-500 mt-1">Roller ve modül izinlerini buradan düzenleyin.</p>
      </div>

      {msg && (
        <div className={`mb-4 border text-sm rounded-lg px-4 py-2 ${
          msgType === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {msg}
        </div>
      )}

      {/* Sitemap URL setting */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Blog Sitemap URL</h2>
        <p className="text-xs text-slate-400 mb-3">Blog Araçları modülünün veri kaynağı. Senkronizasyon bu URL&apos;den çalışır.</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://example.com/sitemap.xml"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={saveSitemapUrl}
            disabled={sitemapSaving || !sitemapUrl.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {sitemapSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Kullanıcı</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Rol</th>
              {MODULES.map((m) => (
                <th key={m.key} className="px-3 py-3 font-semibold text-slate-600 text-center whitespace-nowrap">
                  <span className="text-xs">{m.label}</span>
                </th>
              ))}
              {currentUserRole === 'super_admin' && (
                <th className="px-4 py-3 font-semibold text-slate-600 text-center whitespace-nowrap">
                  <span className="text-xs">Şifre</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => changeRole(user.id, e.target.value)}
                    disabled={saving === user.id + '_role' || (user.role === 'super_admin' && currentUserRole !== 'super_admin')}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} disabled={r === 'super_admin' && currentUserRole !== 'super_admin'}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                {MODULES.map((m) => {
                  const enabled = getEffectivePerm(user.id, m.key)
                  const key = user.id + '_' + m.key
                  return (
                    <td key={m.key} className="px-3 py-3 text-center">
                      <button
                        onClick={() => togglePerm(user.id, m.key, enabled)}
                        disabled={saving === key}
                        title={enabled ? 'Aktif — devre dışı bırak' : 'Pasif — etkinleştir'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          width: 36,
                          height: 20,
                          borderRadius: 999,
                          padding: 2,
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          background: enabled ? '#3b82f6' : '#cbd5e1',
                          opacity: saving === key ? 0.5 : 1,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            transition: 'transform 0.2s',
                            transform: enabled ? 'translateX(16px)' : 'translateX(0)',
                          }}
                        />
                      </button>
                    </td>
                  )
                })}
                {currentUserRole === 'super_admin' && (
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => { setPwModal({ userId: user.id, userName: user.name }); setNewPassword('') }}
                      className="text-xs text-slate-400 hover:text-orange-600 border border-slate-200 hover:border-orange-300 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Yenile
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={2 + MODULES.length + (currentUserRole === 'super_admin' ? 1 : 0)} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Kullanıcı bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Password reset modal */}
      {pwModal && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) { setPwModal(null); setNewPassword('') } }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Şifre Yenile</h2>
            <p className="text-sm text-slate-500 mb-4">
              <span className="font-medium text-slate-700">{pwModal.userName}</span> için yeni şifre belirle.
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPasswordReset() }}
              placeholder="Yeni şifre (en az 6 karakter)"
              autoFocus
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPwModal(null); setNewPassword('') }}
                className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={submitPasswordReset}
                disabled={pwSaving || newPassword.length < 6}
                className="text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {pwSaving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
