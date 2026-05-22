import OpenAI from 'openai'
import type { LeadRow, AnalysisResult } from '@/types/lead'
import { buildPrompt } from './buildPrompt'

function getClient() {
  return new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function analyzeLead(
  lead: LeadRow,
  services: string[],
  retries = 3
): Promise<AnalysisResult> {
  const prompt = buildPrompt(lead, services)

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await getClient().chat.completions.create({
        model: 'gemini-2.0-flash',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.choices[0]?.message?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('rate')) {
          throw new Error('429')
        }
        throw new Error('AI yanıtı JSON içermiyor: ' + text.slice(0, 80))
      }

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        throw new Error('JSON parse hatası: ' + jsonMatch[0].slice(0, 80))
      }

      return {
        leadId: lead['ID'],
        originalStatus: 'Uygun Bulunmadı',
        originalDetail: lead['Durum Detayı'],
        suggestedStatus: parsed.suggestedStatus,
        confidence: parsed.confidence,
        reason: parsed.reason,
        matchedServices: parsed.matchedServices || [],
      }
    } catch (err) {
      const is429 =
        err instanceof Error &&
        (err.message.includes('429') || err.message.includes('rate'))

      if (is429 && attempt < retries - 1) {
        await sleep(4000 * (attempt + 1))
        continue
      }
      throw err
    }
  }

  throw new Error('Maksimum deneme sayısına ulaşıldı')
}

export async function analyzeLeadsBatch(
  leads: LeadRow[],
  services: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, AnalysisResult | Error>> {
  const results = new Map<string, AnalysisResult | Error>()
  const BATCH_SIZE = 3

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

    // Gemini free tier: dakikada 15 istek — batch arası bekleme
    if (i + BATCH_SIZE < leads.length) {
      await sleep(2000)
    }
  }

  return results
}
