import { Suspense } from 'react'
import QualityClient from './QualityClient'

export default function QualityPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Yükleniyor...</div>}>
      <QualityClient />
    </Suspense>
  )
}
