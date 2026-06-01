import { NextRequest } from 'next/server'
import { analyzeLead } from '@/lib/analyzeLeads'
import { detectJunkLead } from '@/lib/detectJunkLead'
import { getSession } from '@/lib/auth'
import { getRejectedExamples } from '@/lib/db'
import type { LeadRow } from '@/types/lead'
import type { ReanalysisContext, RejectedExample } from '@/lib/buildPrompt'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { leads, services, reanalysis }: {
    leads: LeadRow[]
    services: string[]
    reanalysis?: ReanalysisContext
  } = await req.json()

  if (!leads?.length) return Response.json({ error: 'Lead listesi boş' }, { status: 400 })
  if (!services?.length) return Response.json({ error: 'Hizmet listesi boş' }, { status: 400 })

  let rejectedExamples: RejectedExample[] = []
  if (!reanalysis) {
    try {
      const session = await getSession()
      if (session) rejectedExamples = await getRejectedExamples(session.userId, 10)
    } catch {}
  }

  console.log(`[analyze] ${leads.length} lead${reanalysis ? ' (yeniden analiz)' : ''}, ${rejectedExamples.length} red örneği, paralel işleniyor`)

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
            // Yeniden analiz isteklerinde junk kontrolü atla
            const junk = reanalysis ? null : detectJunkLead(lead)
            const task = junk
              ? Promise.resolve(junk)
              : analyzeLead(lead, services, 3, reanalysis, rejectedExamples)
            task
              .then((result) => {
                if (junk) console.log(`[analyze] junk skip: ${lead['ID']} — ${lead['İlgili Kişi']}`)
                controller.enqueue(
                  encoder.encode(JSON.stringify({ id: lead['ID'], result }) + '\n')
                )
              })
              .catch((err) => {
                console.error(`[analyze] hata lead ${lead['ID']}:`, err.message)
                controller.enqueue(
                  encoder.encode(JSON.stringify({ id: lead['ID'], error: err.message }) + '\n')
                )
              })
              .finally(() => {
                active--
                completed++
                console.log(`[analyze] ${completed}/${total}`)
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
