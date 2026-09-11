import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { putPrivateObject } from '@/lib/storage'
import { isPdf, renderPdf } from '@/lib/pdf'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMember(workspaceId)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const templateId = typeof body?.templateId === 'string' ? body.templateId : ''
    const version = Number.isInteger(body?.version) ? Number(body.version) : null
    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || (typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '')
    if (!templateId || !idempotencyKey) return NextResponse.json({ error: 'templateId and Idempotency-Key are required' }, { status: 400 })
    const existing = await prisma.$queryRaw<Array<{ id: string; status: string; storageKey: string | null; metadata: any }>>(Prisma.sql`SELECT "id","status","storageKey","metadata" FROM "RenderedDocument" WHERE "workspaceId"=${workspaceId} AND "idempotencyKey"=${idempotencyKey} LIMIT 1`)
    if (existing[0]) return NextResponse.json({ renderedDocument: existing[0], replay: true })
    const templates = await prisma.$queryRaw<Array<{ id: string; versionId: string; version: number; content: any }>>(Prisma.sql`SELECT t."id",v."id" AS "versionId",v."version",v."content" FROM "DocumentTemplate" t JOIN "DocumentTemplateVersion" v ON v."templateId"=t."id" WHERE t."id"=${templateId} AND (t."workspaceId"=${workspaceId} OR t."workspaceId" IS NULL) AND t."active"=TRUE AND (${version}::integer IS NULL OR v."version"=${version}) ORDER BY v."version" DESC LIMIT 1`)
    const template = templates[0]
    if (!template) return NextResponse.json({ error: 'Template or version not found' }, { status: 404 })
    const id = crypto.randomUUID()
    const created = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO "RenderedDocument" ("id","workspaceId","templateId","templateVersionId","ownerId","status","idempotencyKey") VALUES (${id},${workspaceId},${template.id},${template.versionId},${user.id},'PROCESSING',${idempotencyKey}) ON CONFLICT DO NOTHING RETURNING "id"`)
    if (!created[0]) {
      const replay = await prisma.$queryRaw<Array<{ id: string; status: string; storageKey: string | null; metadata: any }>>(Prisma.sql`SELECT "id","status","storageKey","metadata" FROM "RenderedDocument" WHERE "workspaceId"=${workspaceId} AND "idempotencyKey"=${idempotencyKey} LIMIT 1`)
      return NextResponse.json({ renderedDocument: replay[0], replay: true })
    }
    try {
      const bytes = renderPdf(template.content)
      if (!isPdf(bytes)) throw new Error('PDF renderer produced invalid output')
      const storageKey = `workspaces/${workspaceId}/documents/rendered/${id}.pdf`
      const bodyBuffer = new Uint8Array(bytes).buffer as ArrayBuffer
      await putPrivateObject(storageKey, bodyBuffer, 'application/pdf')
      const metadata = { format: 'pdf', bytes: bytes.byteLength, version: template.version }
      await prisma.$executeRaw(Prisma.sql`UPDATE "RenderedDocument" SET "status"='COMPLETED',"storageKey"=${storageKey},"metadata"=${JSON.stringify(metadata)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`)
      await prisma.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'document.rendered', entity: 'RenderedDocument', entityId: id, metadata } })
      return NextResponse.json({ renderedDocument: { id, status: 'COMPLETED', storageKey, metadata } }, { status: 201 })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF rendering failed'
      await prisma.$executeRaw(Prisma.sql`UPDATE "RenderedDocument" SET "status"='FAILED',"metadata"=${JSON.stringify({ error: message.slice(0, 500) })}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`)
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to render document'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
