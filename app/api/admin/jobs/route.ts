import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

function errorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'Authentication required') return 401
  if (message.includes('access required') || message.includes('Forbidden')) return 403
  return fallback
}

export async function GET() {
  try {
    await requireSuperAdmin()
    const jobs = await prisma.$queryRaw(Prisma.sql`SELECT "id","type","workspaceId","status","attempts","maxAttempts","runAt","startedAt","finishedAt","lastError","createdAt","updatedAt" FROM "CloudieJob" ORDER BY "createdAt" DESC LIMIT 200`)
    return NextResponse.json({ jobs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load jobs'
    return NextResponse.json({ error: message }, { status: errorStatus(error, 403) })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`UPDATE "CloudieJob" SET "status"='RETRY',"runAt"=CURRENT_TIMESTAMP,"finishedAt"=NULL,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "status" IN ('FAILED','CANCELLED') RETURNING "id","status"`)
    if (!rows[0]) return NextResponse.json({ error: 'Job not found or not retryable' }, { status: 409 })
    await prisma.auditLog.create({ data: { actorId: user.id, action: 'job.retried', entity: 'CloudieJob', entityId: id } })
    return NextResponse.json({ job: rows[0] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retry job'
    return NextResponse.json({ error: message }, { status: errorStatus(error) })
  }
}
