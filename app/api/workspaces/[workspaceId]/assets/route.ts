import { NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validateUpload, sanitizeFilename, putPrivateObject, deletePrivateObject } from '@/lib/storage'

const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp'])

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
    if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: 'A supported JPEG, PNG or WebP image is required' }, { status: 400 })
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

export async function DELETE(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMember(workspaceId)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const asset = (await prisma.$queryRaw<Array<{ id: string; url: string; ownerId: string }>>(Prisma.sql`SELECT "id","url","ownerId" FROM "CloudieAsset" WHERE "id"=${id} AND "workspaceId"=${workspaceId} AND "deletedAt" IS NULL LIMIT 1`))[0]
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
    if (asset.ownerId !== user.id && !['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'].includes(membership?.role ?? '')) return NextResponse.json({ error: 'Asset access denied' }, { status: 403 })
    if (asset.url) await deletePrivateObject(asset.url)
    await prisma.$executeRaw(Prisma.sql`UPDATE "CloudieAsset" SET "deletedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "workspaceId"=${workspaceId}`)
    await prisma.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'asset.deleted', entity: 'CloudieAsset', entityId: id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete asset'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
