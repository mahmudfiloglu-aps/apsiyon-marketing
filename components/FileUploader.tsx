'use client'

import { useRef, useState } from 'react'
import { parseLeadsFile } from '@/lib/parseLeads'
import type { LeadRow } from '@/types/lead'

interface FileUploaderProps {
  onLeadsLoaded: (leads: LeadRow[], totalCount: number, fileName: string) => void
}

export default function FileUploader({ onLeadsLoaded }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const processFile = async (file: File) => {
    setError('')
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      setError('Sadece .xlsx veya .csv dosyası yükleyebilirsiniz.')
      return
    }
    const buffer = await file.arrayBuffer()
    try {
      const { filteredRows, totalCount, filteredCount } = parseLeadsFile(buffer)
      setLabel(
        `${file.name} — ${filteredCount} / ${totalCount} lead (Uygun Bulunmadı)`
      )
      onLeadsLoaded(filteredRows, totalCount, file.name)
    } catch {
      setError('Dosya okunamadı. Lütfen formatı kontrol edin.')
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
        isDragging
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/30'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={handleFile}
      />
      {label ? (
        <>
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-green-700">{label}</p>
        </>
      ) : (
        <>
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.872 11.095H6.75Z" />
          </svg>
          <p className="font-medium text-gray-700">
            Lead___Firma_Detay.xlsx dosyasını sürükleyin veya seçin
          </p>
          <p className="text-sm text-gray-500 mt-1">.xlsx veya .csv desteklenir</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  )
}
