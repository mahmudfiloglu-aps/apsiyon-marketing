'use client'

import { useEffect, useState } from 'react'

interface Rule {
  id: string
  rule_text: string
  is_active: boolean
  created_at: string
}

export default function SettingsClient() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [newRule, setNewRule] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/rules')
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const addRule = async () => {
    if (!newRule.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleText: newRule.trim() }),
      })
      const data = await res.json()
      if (data.rule) {
        setRules((prev) => [data.rule as Rule, ...prev])
        setNewRule('')
      }
    } catch {}
    finally { setSaving(false) }
  }

  const deleteRule = async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id))
    await fetch('/api/rules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  }

  const toggleRule = async (id: string, isActive: boolean) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, is_active: isActive } : r))
    await fetch('/api/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    }).catch(() => {})
  }

  return (
    <div className="py-8 px-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Özel Kurallar</h1>
        <p className="text-sm text-gray-500 mt-1">Bu kurallar her analizde AI&apos;ya otomatik olarak iletilir.</p>
      </div>

      {/* Add new rule */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <label className="text-sm font-semibold text-gray-700 mb-2 block">Yeni Kural Ekle</label>
        <textarea
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          placeholder="Örn: Emlak sektöründen gelen leadler → her zaman Yeniden Değerlendir"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-3"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addRule()
          }}
        />
        <button
          onClick={addRule}
          disabled={saving || !newRule.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Ekleniyor...' : 'Ekle'}
        </button>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {loading && (
          <p className="text-sm text-gray-400">Yükleniyor...</p>
        )}
        {!loading && rules.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-400">Henüz kural eklenmedi.</p>
          </div>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`bg-white border rounded-xl p-4 flex items-start gap-3 transition-opacity ${
              rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
            }`}
          >
            <label className="flex items-center mt-0.5 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.is_active}
                onChange={(e) => toggleRule(rule.id, e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </label>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${rule.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                {rule.rule_text}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(rule.created_at).toLocaleDateString('tr-TR')}
                {!rule.is_active && <span className="ml-2 text-gray-300">(devre dışı)</span>}
              </p>
            </div>
            <button
              onClick={() => deleteRule(rule.id)}
              className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-sm"
              title="Sil"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
