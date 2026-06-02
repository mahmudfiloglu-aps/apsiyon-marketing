'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

type PermMap = Record<string, boolean>

export function usePermissions() {
  const { user } = useAuth()
  const [perms, setPerms] = useState<PermMap | null>(null)

  useEffect(() => {
    if (!user) return
    fetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d) => setPerms(d.permissions ?? null))
      .catch(() => {})
  }, [user])

  const can = (module: string) => {
    if (perms === null) return true // loading — show by default
    return perms[module] !== false
  }

  return { perms, can }
}
