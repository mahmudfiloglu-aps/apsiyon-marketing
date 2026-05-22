import OpenAI from 'openai'
import type { LeadRow, AnalysisResult } from '@/types/lead'
import { buildPrompt } from './buildPrompt'

function getClient() {
  return new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  })
}

async function analyzeLead(
  lead: LeadRow,
  services: string[]
): Promise<AnalysisResult> {
  const prompt = buildPrompt(lead, services)

  const response = await getClient().chat.completions.create({
    model: 'gemini-2.0-flash',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.choices[0]?.message?.content || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI yanıtı JSON içermiyor')

  const parsed = JSON.parse(jsonMatch[0])

  return {
    leadId: lead['ID'],
    originalStatus: 'Uygun Bulunmadı',
    originalDetail: lead['Durum Detayı'],
    suggestedStatus: parsed.suggestedStatus,
    confidence: parsed.confidence,
    reason: parsed.reason,
    matchedServices: parsed.matchedServices || [],
  }
}

export async function analyzeLeadsBatch(
  leads: LeadRow[],
  services: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, AnalysisResult | Error>> {
  const results = new Map<string, AnalysisResult | Error>()
  const BATCH_SIZE = 5

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map((lead) => analyzeLead(lead, services))
    )

    batchResults.forEach((result, idx) => {
      const lead = batch[idx]
      if (result.status === 'fulfilled') {
        results.set(lead['ID'], result.value)
      } else {
        results.set(lead['ID'], new Error(result.reason?.message || 'Bilinmeyen hata'))
      }
    })

    onProgress?.(Math.min(i + BATCH_SIZE, leads.length), leads.length)
  }

  return results
}
