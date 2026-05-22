import { NextRequest } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { buildKeywordPrompt } from '@/lib/buildKeywordPrompt'

export const maxDuration = 60

function getClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not configured')
  const credEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  let googleAuthOptions: Record<string, unknown> | undefined
  if (credEnv?.trim().startsWith('{')) {
    googleAuthOptions = { credentials: JSON.parse(credEnv) }
  }
  return new GoogleGenAI({ vertexai: true, project, location, ...(googleAuthOptions ? { googleAuthOptions } : {}) })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function classifyBatch(terms: string[], retries = 3): Promise<{ i: number; category: string }[]> {
  const model = process.env.GEMINI_CLASSIFICATION_MODEL || 'gemini-2.5-flash'
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: buildKeywordPrompt(terms),
      })
      const text = response.text ?? ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('JSON array bulunamadı')
      return JSON.parse(jsonMatch[0])
    } catch (err) {
      const is429 = err instanceof Error && (err.message.includes('429') || err.message.includes('rate'))
      if (is429 && attempt < retries - 1) { await sleep(4000 * (attempt + 1)); continue }
      throw err
    }
  }
  throw new Error('Maksimum deneme aşıldı')
}

export async function POST(req: NextRequest) {
  const { terms }: { terms: string[] } = await req.json()
  if (!terms?.length) return Response.json({ error: 'Terim listesi boş' }, { status: 400 })

  const BATCH_SIZE = 80
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let done = 0
      for (let i = 0; i < terms.length; i += BATCH_SIZE) {
        const batch = terms.slice(i, i + BATCH_SIZE)
        try {
          const results = await classifyBatch(batch)
          results.forEach(({ i: idx, category }) => {
            const term = batch[idx - 1]
            if (term) {
              controller.enqueue(encoder.encode(
                JSON.stringify({ term, category }) + '\n'
              ))
            }
          })
        } catch (err) {
          batch.forEach(term => {
            controller.enqueue(encoder.encode(
              JSON.stringify({ term, category: 'İncelenmeli', error: true }) + '\n'
            ))
          })
        }
        done += batch.length
        console.log(`[keywords] ${done}/${terms.length}`)
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}
