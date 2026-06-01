import { GoogleGenAI } from '@google/genai'
import type { LeadRow, AnalysisResult } from '@/types/lead'
import { buildPrompt } from './buildPrompt'

function getClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not configured')

  const credEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  let googleAuthOptions: Record<string, unknown> | undefined

  if (credEnv?.trim().startsWith('{')) {
    try {
      googleAuthOptions = { credentials: JSON.parse(credEnv) }
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS geçerli JSON değil')
    }
  }

  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function analyzeLead(
  lead: LeadRow,
  services: string[],
  retries = 3
): Promise<AnalysisResult> {
  const prompt = buildPrompt(lead, services)
  const modelName = process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash'

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model: modelName,
        contents: prompt,
      })
      const text = response.text ?? ''

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('rate')) {
          throw new Error('429')
        }
        throw new Error('AI yanıtı JSON içermiyor: ' + text.slice(0, 80))
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

      return {
        leadId: lead['ID'],
        originalStatus: 'Uygun Bulunmadı' as const,
        originalDetail: lead['Durum Detayı'],
        suggestedStatus: parsed.suggestedStatus as AnalysisResult['suggestedStatus'],
        confidence: parsed.confidence as AnalysisResult['confidence'],
        reason: parsed.reason as string,
        matchedServices: (parsed.matchedServices as string[]) || [],
        qualityScore: typeof parsed.qualityScore === 'number' ? Math.min(10, Math.max(1, parsed.qualityScore)) : 5,
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
