'use client'

import { useRef, useState } from 'react'
import { parseLeadsFile } from '@/lib/parseLeads'
import type { LeadRow } from '@/types/lead'

interface FileUploaderProps {
  onLeadsLoaded: (leads: LeadRow[], totalCount: number) => void
}

export default function FileUploader({ onLeadsLoaded }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
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
      setFileName(`${file.name} — ${filteredCount} / ${totalCount} lead (Uygun Bulunmadı)`)
      onLeadsLoaded(filteredRows, totalCount)
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
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
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
      <div className="text-4xl mb-3">📂</div>
      {fileName ? (
        <p className="text-sm font-medium text-green-700">{fileName}</p>
      ) : (
        <>
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
