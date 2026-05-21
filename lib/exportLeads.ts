import * as XLSX from 'xlsx'
import type { AnalyzedLead } from '@/types/lead'

export function exportToXLSX(items: AnalyzedLead[]): Blob {
  const rows = items.map(({ lead, analysisResult, analysisError }) => ({
    ...lead,
    AI_Öneri: analysisResult?.suggestedStatus || analysisError || '',
    AI_Güven: analysisResult?.confidence || '',
    AI_Açıklama: analysisResult?.reason || '',
    AI_EşleşenHizmet: analysisResult?.matchedServices?.join(', ') || '',
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'AI Analiz Sonuçları')

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
