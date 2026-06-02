import { Suspense } from 'react'
import SettingsClient from './SettingsClient'

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Yükleniyor...</div>}>
      <SettingsClient />
    </Suspense>
  )
}
