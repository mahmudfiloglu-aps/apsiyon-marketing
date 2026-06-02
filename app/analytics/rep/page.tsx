import { Suspense } from 'react'
import RepDetailClient from './RepDetailClient'

export default function RepPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Yükleniyor...</div>}>
      <RepDetailClient />
    </Suspense>
  )
}
