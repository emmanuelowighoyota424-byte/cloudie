import { NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validateUpload, sanitizeFilename, putPrivateObject } from '@/lib/storage'

const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif'])

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMember(workspaceId)
    const assets = await prisma.$queryRaw(Prisma.sql`SELECT "id","filename","mimeType","sizeBytes","url","width","height","createdAt" FROM "CloudieAsset" WHERE "workspaceId"=${workspaceId} AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 200`)
    return NextResponse.json({ assets, viewer: user.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load assets'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMember(workspaceId)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: 'A supported image file is required' }, { status: 400 })
    validateUpload(file.type, file.size)
    const safeName = sanitizeFilename(file.name)
    const storageKey = `workspaces/${workspaceId}/assets/${crypto.randomUUID()}-${safeName}`
    const blob = await putPrivateObject(storageKey, await file.arrayBuffer(), file.type)
    const id = crypto.randomUUID()
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "CloudieAsset" ("id","workspaceId","ownerId","filename","mimeType","sizeBytes","storageKey","url") VALUES (${id},${workspaceId},${user.id},${safeName},${file.type},${file.size},${storageKey},${blob.url})`)
    await prisma.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'asset.uploaded', entity: 'CloudieAsset', entityId: id, metadata: { mimeType: file.type, sizeBytes: file.size } } })
    return NextResponse.json({ id, filename: safeName, mimeType: file.type, sizeBytes: file.size, url: blob.url }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload image'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('configured') ? 503 : 400 })
  }
}
