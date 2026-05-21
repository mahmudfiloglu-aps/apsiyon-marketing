import { NextRequest, NextResponse } from 'next/server'
import { analyzeLeadsBatch } from '@/lib/analyzeLeads'
import type { LeadRow, AnalysisResult } from '@/types/lead'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leads, services }: { leads: LeadRow[]; services: string[] } = body

    if (!leads?.length) {
      return NextResponse.json({ error: 'Lead listesi boş' }, { status: 400 })
    }
    if (!services?.length) {
      return NextResponse.json({ error: 'Hizmet listesi boş' }, { status: 400 })
    }

    const resultsMap = await analyzeLeadsBatch(leads, services)

    const results: Record<string, AnalysisResult | { error: string }> = {}
    resultsMap.forEach((value, key) => {
      if (value instanceof Error) {
        results[key] = { error: value.message }
      } else {
        results[key] = value
      }
    })

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Analyze route error:', err)
    return NextResponse.json(
      { error: 'Sunucu hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen') },
      { status: 500 }
    )
  }
}
