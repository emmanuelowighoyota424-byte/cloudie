import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const actor = await requireSuperAdmin()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : ''
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{id:string;type:string;status:string;attempts:number;maxAttempts:number;workspaceId:string|null}>>(Prisma.sql`SELECT "id","type","status","attempts","maxAttempts","workspaceId" FROM "CloudieJob" WHERE "id"=${jobId} FOR UPDATE`)
      const job = rows[0]
      if (!job) throw new Error('Job not found')
      if (job.status !== 'FAILED') throw new Error('Only FAILED jobs can be requeued')
      await tx.$executeRaw(Prisma.sql`UPDATE "CloudieJob" SET "status"='PENDING',"runAt"=CURRENT_TIMESTAMP,"startedAt"=NULL,"finishedAt"=NULL,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId}`)
      await tx.auditLog.create({ data: { actorId: actor.id, workspaceId: job.workspaceId, action: 'JOB_REQUEUED', entity: 'CloudieJob', entityId: jobId, metadata: { type: job.type, previousStatus: job.status, attempts: job.attempts, maxAttempts: job.maxAttempts } } })
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to requeue job'
    return NextResponse.json({ error: message }, { status: message === 'Job not found' ? 404 : 400 })
  }
}
