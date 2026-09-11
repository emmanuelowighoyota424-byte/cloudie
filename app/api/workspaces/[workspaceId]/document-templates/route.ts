import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceRole } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','CUSTOMER'])
    const templates = await prisma.$queryRaw(Prisma.sql`SELECT t.*, v."version", v."content" FROM "DocumentTemplate" t LEFT JOIN LATERAL (SELECT "version","content" FROM "DocumentTemplateVersion" WHERE "templateId"=t."id" ORDER BY "version" DESC LIMIT 1) v ON TRUE WHERE (t."workspaceId"=${workspaceId} OR t."workspaceId" IS NULL) AND t."active"=TRUE ORDER BY t."createdAt" DESC`)
    return NextResponse.json({ templates })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load templates'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'])
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const documentType = typeof body?.documentType === 'string' ? body.documentType.trim() : ''
    const content = body?.content
    if (!name || !documentType || !content || typeof content !== 'object') return NextResponse.json({ error: 'name, documentType and object content are required' }, { status: 400 })
    const templateId = crypto.randomUUID()
    const versionId = crypto.randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "DocumentTemplate" ("id","workspaceId","name","documentType","createdById") VALUES (${templateId},${workspaceId},${name},${documentType},${user.id})`)
      await tx.$executeRaw(Prisma.sql`INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","content","createdById") VALUES (${versionId},${templateId},1,${JSON.stringify(content)}::jsonb,${user.id})`)
      await tx.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'document_template.created', entity: 'DocumentTemplate', entityId: templateId } })
    })
    return NextResponse.json({ templateId, versionId }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create template'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
