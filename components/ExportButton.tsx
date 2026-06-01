'use client'

import { exportToXLSX } from '@/lib/exportLeads'
import type { AnalyzedLead } from '@/types/lead'

interface ExportButtonProps {
  leads: AnalyzedLead[]
  disabled?: boolean
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportButton({ leads, disabled }: ExportButtonProps) {
  const date = new Date().toISOString().slice(0, 10)
  const reeval = leads.filter((l) => l.analysisResult?.suggestedStatus === 'Yeniden Değerlendir')

  return (
    <div className="flex gap-2">
      <button
        onClick={() => download(exportToXLSX(reeval), `yeniden-degerlendir-${date}.xlsx`)}
        disabled={disabled || reeval.length === 0}
        className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
      >
        ⬇ Yeniden Değerlendir ({reeval.length})
      </button>
      <button
        onClick={() => download(exportToXLSX(leads), `lead-analiz-sonuclari-${date}.xlsx`)}
        disabled={disabled || leads.length === 0}
        className="bg-green-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
      >
        ⬇ Tümü ({leads.length})
      </button>
    </div>
  )
}
