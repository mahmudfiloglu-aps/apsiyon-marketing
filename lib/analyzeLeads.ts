import { VertexAI } from '@google-cloud/vertexai'
import * as fs from 'fs'
import type { LeadRow, AnalysisResult } from '@/types/lead'
import { buildPrompt } from './buildPrompt'

function getClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not configured')

  // GOOGLE_APPLICATION_CREDENTIALS: dosya yolu veya JSON içeriği olabilir
  const credEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  let googleAuthOptions: Record<string, unknown> | undefined

  if (credEnv) {
    if (credEnv.trim().startsWith('{')) {
      // JSON içeriği doğrudan verilmiş
      googleAuthOptions = { credentials: JSON.parse(credEnv) }
    } else if (fs.existsSync(credEnv)) {
      // Dosya yolu verilmiş
      googleAuthOptions = { credentials: JSON.parse(fs.readFileSync(credEnv, 'utf-8')) }
    }
  }

  return new VertexAI({
    project,
    location,
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function analyzeLead(
  lead: LeadRow,
  services: string[],
  retries = 3
): Promise<AnalysisResult> {
  const prompt = buildPrompt(lead, services)
  const modelName = process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash'

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const model = getClient().getGenerativeModel({ model: modelName })
      const result = await model.generateContent(prompt)
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || ''

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
        originalStatus: 'Uygun Bulunmadı' as const,
        originalDetail: lead['Durum Detayı'],
        suggestedStatus: parsed.suggestedStatus as AnalysisResult['suggestedStatus'],
        confidence: parsed.confidence as AnalysisResult['confidence'],
        reason: parsed.reason as string,
        matchedServices: (parsed.matchedServices as string[]) || [],
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
    if (i + BATCH_SIZE < leads.length) await sleep(500)
  }

  return results
}
