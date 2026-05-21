'use client'

import { useState } from 'react'

const DEFAULT_SERVICES = [
  'Plaka Tanıma Sistemi (PTS) Kiralama',
  'Apsiyon Site Yönetim Yazılımı',
  'Tur Kontrol Sistemi',
  'QR Kod Geçiş Sistemi',
  'Kazan Otomasyon Sistemi',
  'Saha Mobil Uygulaması',
]

interface ServiceConfigProps {
  onChange: (services: string[]) => void
}

export default function ServiceConfig({ onChange }: ServiceConfigProps) {
  const [services, setServices] = useState<string[]>(DEFAULT_SERVICES)
  const [newService, setNewService] = useState('')

  const update = (updated: string[]) => {
    setServices(updated)
    onChange(updated.filter(Boolean))
  }

  const add = () => {
    if (newService.trim()) {
      update([...services, newService.trim()])
      setNewService('')
    }
  }

  const remove = (index: number) => {
    update(services.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') add()
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 text-gray-800">Hizmet Listesi</h2>
      <p className="text-sm text-gray-500 mb-4">
        AI bu hizmetlerle lead'leri karşılaştıracak.
      </p>
      <ul className="space-y-2 mb-4">
        {services.map((service, i) => (
          <li
            key={i}
            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
          >
            <span className="text-sm text-gray-700">{service}</span>
            <button
              onClick={() => remove(i)}
              className="text-red-400 hover:text-red-600 text-xs ml-2"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          type="text"
          value={newService}
          onChange={(e) => setNewService(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Yeni hizmet ekle..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={add}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          Ekle
        </button>
      </div>
    </div>
  )
}
