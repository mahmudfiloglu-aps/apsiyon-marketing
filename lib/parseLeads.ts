import * as XLSX from 'xlsx'
import type { LeadRow } from '@/types/lead'

export function parseLeadsFile(buffer: ArrayBuffer): {
  allRows: LeadRow[]
  filteredRows: LeadRow[]
  totalCount: number
  filteredCount: number
} {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rows = XLSX.utils.sheet_to_json<LeadRow>(sheet, {
    defval: '',
    raw: false,
  })

  const allRows = rows as LeadRow[]
  const filteredRows = allRows.filter(
    (row) =>
      row['Kayıt Tipi']?.trim() === 'Lead' &&
      row['Durumu']?.trim() === 'Uygun Bulunmadı'
  )

  return {
    allRows,
    filteredRows,
    totalCount: allRows.length,
    filteredCount: filteredRows.length,
  }
}
