import { NextRequest } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { buildQualityPrompt } from '@/lib/buildQualityPrompt'
import { detectJunkLead } from '@/lib/detectJunkLead'
import type { LeadRow } from '@/types/lead'

export const maxDuration = 60

export interface QualityResult {
  leadId: string
  qualityScore: number
  tier: 'Sıcak' | 'İlgili' | 'Soğuk' | 'Uygunsuz'
  reason: string
  matchedServices: string[]
}

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

async function analyzeLeadQuality(
  lead: LeadRow,
  services: string[],
  retries = 3
): Promise<QualityResult> {
  const prompt = buildQualityPrompt(lead, services)
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
        qualityScore:
          typeof parsed.qualityScore === 'number'
            ? Math.min(10, Math.max(1, parsed.qualityScore))
            : 5,
        tier: parsed.tier as QualityResult['tier'],
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

export async function POST(req: NextRequest) {
  const { leads, services }: { leads: LeadRow[]; services: string[] } = await req.json()

  if (!leads?.length) return Response.json({ error: 'Lead listesi boş' }, { status: 400 })
  if (!services?.length) return Response.json({ error: 'Hizmet listesi boş' }, { status: 400 })

  console.log(`[quality-analyze] ${leads.length} lead, paralel işleniyor`)

  const encoder = new TextEncoder()
  const CONCURRENCY = 10

  const stream = new ReadableStream({
    async start(controller) {
      const queue = [...leads]
      let active = 0
      let completed = 0
      const total = leads.length

      await new Promise<void>((resolve) => {
        function next() {
          while (active < CONCURRENCY && queue.length > 0) {
            const lead = queue.shift()!
            active++

            const junk = detectJunkLead(lead)
            const task: Promise<QualityResult> = junk
              ? Promise.resolve({
                  leadId: lead['ID'],
                  qualityScore: 1,
                  tier: 'Uygunsuz' as const,
                  reason: junk.reason,
                  matchedServices: [],
                })
              : analyzeLeadQuality(lead, services)

            task
              .then((result) => {
                if (junk) console.log(`[quality-analyze] junk skip: ${lead['ID']} — ${lead['İlgili Kişi']}`)
                controller.enqueue(
                  encoder.encode(JSON.stringify({ id: lead['ID'], result }) + '\n')
                )
              })
              .catch((err) => {
                console.error(`[quality-analyze] hata lead ${lead['ID']}:`, err.message)
                controller.enqueue(
                  encoder.encode(JSON.stringify({ id: lead['ID'], error: err.message }) + '\n')
                )
              })
              .finally(() => {
                active--
                completed++
                console.log(`[quality-analyze] ${completed}/${total}`)
                if (completed === total) resolve()
                else next()
              })
          }
        }
        next()
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}
