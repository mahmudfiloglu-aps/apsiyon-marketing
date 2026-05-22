import { NextRequest } from 'next/server'
import { analyzeLead } from '@/lib/analyzeLeads'
import type { LeadRow } from '@/types/lead'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { leads, services }: { leads: LeadRow[]; services: string[] } = await req.json()

  if (!leads?.length) return Response.json({ error: 'Lead listesi boş' }, { status: 400 })
  if (!services?.length) return Response.json({ error: 'Hizmet listesi boş' }, { status: 400 })

  console.log(`[analyze] ${leads.length} lead, paralel işleniyor`)

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
            analyzeLead(lead, services)
              .then((result) => {
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
