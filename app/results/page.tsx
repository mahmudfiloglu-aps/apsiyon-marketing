import { Suspense } from 'react'
import ResultsClient from './ResultsClient'

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Yükleniyor...</p>
      </div>
    }>
      <ResultsClient />
    </Suspense>
  )
}
