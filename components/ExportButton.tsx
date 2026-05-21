'use client'

import { exportToXLSX } from '@/lib/exportLeads'
import type { AnalyzedLead } from '@/types/lead'

interface ExportButtonProps {
  leads: AnalyzedLead[]
  disabled?: boolean
}

export default function ExportButton({ leads, disabled }: ExportButtonProps) {
  const handleExport = () => {
    const blob = exportToXLSX(leads)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lead-analiz-sonuclari-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled || leads.length === 0}
      className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
    >
      <span>⬇️</span>
      XLSX İndir ({leads.length} lead)
    </button>
  )
}
