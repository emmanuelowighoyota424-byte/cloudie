import { requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const user = await requireUser()
  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      send('ready', { userId: user.id })
      let lastId: string | null = null
      const tick = async () => {
        if (closed) return
        try {
          const rows = await prisma.notification.findMany({ where: { userId: user.id, ...(lastId ? { id: { gt: lastId } } : {}) }, orderBy: { createdAt: 'asc' }, take: 20 })
          for (const notification of rows) {
            lastId = notification.id
            send('notification', notification)
          }
          send('heartbeat', { at: new Date().toISOString() })
        } catch (error) {
          send('error', { message: error instanceof Error ? error.message : 'Realtime query failed' })
        }
      }
      await tick()
      const timer = setInterval(() => void tick(), 5000)
      const cleanup = () => { closed = true; clearInterval(timer); controller.close() }
      requestSignal?.addEventListener('abort', cleanup, { once: true })
    },
    cancel() { closed = true },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
}

const requestSignal: AbortSignal | null = null
