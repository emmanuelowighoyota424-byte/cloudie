import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { debitPoints } from '@/lib/points'

const TYPES = new Set(['flight', 'hotel'])
const clean = (value: unknown, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const workspaceId = clean(body?.workspaceId, 100)
    const type = clean(body?.type, 20).toLowerCase()
    const title = clean(body?.title, 180)
    const idempotencyKey = clean(body?.idempotencyKey, 180) || clean(request.headers.get('idempotency-key'), 180)
    const points = Number(body?.points ?? 0)
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
    if (!workspaceId || !TYPES.has(type) || !title || !idempotencyKey || !Number.isSafeInteger(points) || points < 0) return NextResponse.json({ ok:false, error:{ code:'INVALID_BOOKING', message:'workspaceId, type, title, idempotencyKey and non-negative points are required' } }, { status:400 })
    const { user } = await requireWorkspaceMember(workspaceId)
    const existing = await prisma.$queryRaw<Array<{ id:string; pointsCharged:number; title:string; type:string }>>(Prisma.sql`SELECT "id","pointsCharged","title","type" FROM "TicketingDocument" WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1`)
    if (existing[0]) return NextResponse.json({ ok:true, data:{ bookingId:existing[0].id, pointsCharged:existing[0].pointsCharged, idempotent:true } })
    const bookingId = crypto.randomUUID()
    const reference = `ticketing:booking:${bookingId}`
    const charge = points > 0 ? await debitPoints({ userId:user.id, workspace:workspaceId, amount:points, description:`${type === 'flight' ? 'Flight' : 'Hotel'} booking`, reference }) : null
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw(Prisma.sql`INSERT INTO "TicketingDocument" ("id","workspaceId","userId","type","title","payload","pointsCharged","idempotencyKey") VALUES (${bookingId},${workspaceId},${user.id},${type},${title},${JSON.stringify(payload)}::jsonb,${points},${idempotencyKey})`)
        await tx.auditLog.create({ data:{ actorId:user.id, userId:user.id, workspaceId, action:'ticketing.booking_created', entity:'TicketingDocument', entityId:bookingId, metadata:{ type, pointsCharged:points, reference } } })
      })
    } catch (error) {
      if (charge && !charge.idempotent) await debitPoints({ userId:user.id, workspace:workspaceId, amount:points, description:'Booking debit rollback', reference:`${reference}:rollback` }).catch(() => {})
      throw error
    }
    return NextResponse.json({ ok:true, data:{ bookingId, type, title, pointsCharged:points, reference, receipt:{ type:'booking_receipt', bookingId, pointsCharged:points } } }, { status:201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create booking'
    const code = message.includes('Insufficient points') ? 'INSUFFICIENT_POINTS' : message.includes('access denied') ? 'FORBIDDEN' : 'BOOKING_FAILED'
    const status = code === 'INSUFFICIENT_POINTS' ? 422 : code === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ ok:false, error:{ code, message: code === 'BOOKING_FAILED' ? 'Unable to create booking' : message } }, { status })
  }
}
