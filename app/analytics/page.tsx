import { Suspense } from 'react'
import AnalyticsClient from './AnalyticsClient'

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Yükleniyor...</div>}>
      <AnalyticsClient />
    </Suspense>
  )
}
