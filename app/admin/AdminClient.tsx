'use client'

import { useEffect, useState, useCallback } from 'react'

const MODULES = [
  { key: 'lead_analysis', label: 'Lead Analizi' },
  { key: 'lead_quality', label: 'Lead Kalitesi' },
  { key: 'analytics', label: 'Analitik' },
  { key: 'keywords', label: 'Negatif Kelimeler' },
  { key: 'ad_reports', label: 'Reklam Raporları' },
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

export default function AdminClient({ currentUserRole }: Props) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [uRes, pRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/permissions'),
    ])
    if (uRes.ok) setUsers((await uRes.json()).users ?? [])
    if (pRes.ok) setPermissions((await pRes.json()).permissions ?? {})
  }, [])

  useEffect(() => { load() }, [load])

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
      setMsg('Rol güncellendi')
    }
    setSaving(null)
    setTimeout(() => setMsg(''), 2000)
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Kullanıcı Yönetimi</h1>
        <p className="text-sm text-slate-500 mt-1">Roller ve modül izinlerini buradan düzenleyin.</p>
      </div>

      {msg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
          {msg}
        </div>
      )}

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
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={2 + MODULES.length} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Kullanıcı bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
