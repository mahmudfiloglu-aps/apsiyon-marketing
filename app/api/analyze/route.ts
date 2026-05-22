import { NextRequest, NextResponse } from 'next/server'
import { analyzeLeadsBatch } from '@/lib/analyzeLeads'
import type { LeadRow, AnalysisResult } from '@/types/lead'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  console.log('[analyze] env check:', {
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    GEMINI_CLASSIFICATION_MODEL: process.env.GEMINI_CLASSIFICATION_MODEL,
    HAS_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  })

  try {
    const body = await req.json()
    const { leads, services }: { leads: LeadRow[]; services: string[] } = body

    if (!leads?.length) {
      return NextResponse.json({ error: 'Lead listesi boş' }, { status: 400 })
    }
    if (!services?.length) {
      return NextResponse.json({ error: 'Hizmet listesi boş' }, { status: 400 })
    }

    console.log(`[analyze] ${leads.length} lead işleniyor...`)
    const t0 = Date.now()

    const resultsMap = await analyzeLeadsBatch(leads, services, (done, total) => {
      console.log(`[analyze] ilerleme: ${done}/${total}`)
    })

    const results: Record<string, AnalysisResult | { error: string }> = {}
    let successCount = 0
    let errorCount = 0
    resultsMap.forEach((value, key) => {
      if (value instanceof Error) {
        results[key] = { error: value.message }
        console.error(`[analyze] hata - lead ${key}:`, value.message)
        errorCount++
      } else {
        results[key] = value
        successCount++
      }
    })

    console.log(`[analyze] tamamlandı: ${successCount} başarılı, ${errorCount} hatalı, ${Date.now() - t0}ms`)
    return NextResponse.json({ results })
  } catch (err) {
    console.error('Analyze route error:', err)
    return NextResponse.json(
      { error: 'Sunucu hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen') },
      { status: 500 }
    )
  }
}
