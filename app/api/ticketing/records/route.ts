import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const TYPES = new Set(['flight', 'hotel', 'booking', 'invoice', 'financial_record'])
const clean = (value: unknown, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const workspaceId = clean(url.searchParams.get('workspaceId'), 100)
    const type = clean(url.searchParams.get('type'), 30)
    const q = clean(url.searchParams.get('q'), 120)
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    await requireWorkspaceMember(workspaceId)
    const rows = await prisma.$queryRaw<Array<{ id:string; type:string; title:string; payload:unknown; documentId:string|null; pointsCharged:number; createdAt:Date }>>(Prisma.sql`
      SELECT "id","type","title","payload","documentId","pointsCharged","createdAt"
      FROM "TicketingDocument"
      WHERE "workspaceId"=${workspaceId}
        ${type && TYPES.has(type) ? Prisma.sql`AND "type"=${type}` : Prisma.empty}
        ${q ? Prisma.sql`AND ("title" ILIKE ${`%${q}%`} OR "payload"::text ILIKE ${`%${q}%`})` : Prisma.empty}
      ORDER BY "createdAt" DESC
      LIMIT 100
    `)
    return NextResponse.json({ records: rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load ticketing records'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') || message.includes('access denied') ? 401 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const workspaceId = clean(body?.workspaceId, 100)
    const type = clean(body?.type, 30)
    const title = clean(body?.title, 180)
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : {}
    const idempotencyKey = clean(body?.idempotencyKey, 180)
    if (!workspaceId || !TYPES.has(type) || !title || !idempotencyKey) return NextResponse.json({ error: 'workspaceId, type, title and idempotencyKey are required' }, { status: 400 })
    const { user } = await requireWorkspaceMember(workspaceId)
    const existing = await prisma.$queryRaw<Array<{ id:string }>>(Prisma.sql`SELECT "id" FROM "TicketingDocument" WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1`)
    if (existing[0]) return NextResponse.json({ id: existing[0].id, idempotent: true })
    const id = crypto.randomUUID()
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "TicketingDocument" ("id","workspaceId","userId","type","title","payload","pointsCharged","idempotencyKey") VALUES (${id},${workspaceId},${user.id},${type},${title},${JSON.stringify(payload)}::jsonb,0,${idempotencyKey})`)
    await prisma.auditLog.create({ data: { userId:user.id, actorId:user.id, workspaceId, action:'TICKETING_RECORD_CREATED', entity:'TicketingDocument', entityId:id, metadata:{ type } } })
    return NextResponse.json({ id, type, title }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create ticketing record'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') || message.includes('access denied') ? 401 : 500 })
  }
}
