import * as XLSX from 'xlsx'
import type { AnalyzedLead, SuggestedStatus } from '@/types/lead'

export function exportToXLSX(items: AnalyzedLead[], overrides: Record<string, SuggestedStatus> = {}): Blob {
  const rows = items.map(({ lead, analysisResult, analysisError }) => {
    const finalStatus = overrides[lead['ID']] ?? analysisResult?.suggestedStatus ?? analysisError ?? ''
    return {
      ...lead,
      AI_Öneri: finalStatus,
      AI_Öneri_Manuel: overrides[lead['ID']] ? 'Evet' : '',
      AI_Güven: analysisResult?.confidence || '',
      AI_Kalite: analysisResult?.qualityScore != null ? `${analysisResult.qualityScore}/10` : '',
      AI_Açıklama: analysisResult?.reason || '',
      AI_EşleşenHizmet: analysisResult?.matchedServices?.join(', ') || '',
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'AI Analiz Sonuçları')

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
