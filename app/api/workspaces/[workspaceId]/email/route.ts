import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceRole } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { enqueueEmail, enqueueJob } from '@/lib/jobs'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'])
    const messages = await prisma.$queryRaw(Prisma.sql`SELECT "id","recipient","subject","template","status","attempts","lastError","sentAt","createdAt" FROM "EmailMessage" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC LIMIT 100`)
    const campaigns = await prisma.$queryRaw(Prisma.sql`SELECT * FROM "EmailCampaign" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC LIMIT 100`)
    return NextResponse.json({ messages, campaigns })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load email activity'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'])
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = body?.action
    if (action === 'email') {
      const to = typeof body?.to === 'string' ? body.to.trim() : ''
      const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
      const template = typeof body?.template === 'string' ? body.template.trim() : 'generic'
      if (!to || !subject) return NextResponse.json({ error: 'Recipient and subject are required' }, { status: 400 })
      const id = await enqueueEmail({ to, subject, template, payload: { html: typeof body?.html === 'string' ? body.html : undefined, text: typeof body?.text === 'string' ? body.text : '' }, workspaceId, userId: user.id, idempotencyKey: request.headers.get('idempotency-key') ?? undefined })
      return NextResponse.json({ id, status: 'QUEUED' }, { status: 202 })
    }
    if (action === 'campaign') {
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
      const template = typeof body?.template === 'string' ? body.template.trim() : 'generic'
      const audience = Array.isArray(body?.audience) ? body.audience.filter((value): value is string => typeof value === 'string') : []
      const scheduledAt = typeof body?.scheduledAt === 'string' ? new Date(body.scheduledAt) : null
      if (!name || !subject || !audience.length || (scheduledAt && Number.isNaN(scheduledAt.getTime()))) return NextResponse.json({ error: 'name, subject and audience are required' }, { status: 400 })
      const id = crypto.randomUUID()
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "EmailCampaign" ("id","workspaceId","createdById","name","subject","template","audience","scheduledAt","status") VALUES (${id},${workspaceId},${user.id},${name},${subject},${template},${JSON.stringify(audience)}::jsonb,${scheduledAt},${scheduledAt ? 'SCHEDULED' : 'DRAFT'})`)
      if (scheduledAt) await enqueueJob('campaign.send', { campaignId: id }, { workspaceId, runAt: scheduledAt, idempotencyKey: `campaign:${id}` })
      return NextResponse.json({ id, status: scheduledAt ? 'SCHEDULED' : 'DRAFT' }, { status: 201 })
    }
    return NextResponse.json({ error: 'Unsupported email action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue email operation'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
