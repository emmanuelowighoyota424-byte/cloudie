import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/authorization'
import { validateUpload, sanitizeFilename, putPrivateObject } from '@/lib/storage'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requirePermission(workspaceId, 'documents.read')
    const documents = await prisma.document.findMany({
      where: { workspaceId },
      select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true, ownerId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ documents: documents.map((d) => ({ ...d, sizeBytes: d.sizeBytes.toString() })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list documents'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requirePermission(workspaceId, 'documents.write')
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    validateUpload(file.type, file.size)

    const shipmentId = typeof form.get('shipmentId') === 'string' ? String(form.get('shipmentId')) : null
    const customerId = typeof form.get('customerId') === 'string' ? String(form.get('customerId')) : null
    if (shipmentId) {
      const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId } })
      if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, workspaceId } })
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const safeName = sanitizeFilename(file.name)
    const storageKey = `workspaces/${workspaceId}/documents/${crypto.randomUUID()}-${safeName}`
    const blob = await putPrivateObject(storageKey, await file.arrayBuffer(), file.type)
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          workspaceId,
          ownerId: user.id,
          name: safeName,
          mimeType: file.type,
          sizeBytes: BigInt(file.size),
          storageKey: blob.url,
          versions: { create: { version: 1, storageKey: blob.url, sizeBytes: BigInt(file.size), checksum: blob.etag } },
        },
      })
      await tx.documentAccess.create({ data: { documentId: created.id, userId: user.id, action: 'UPLOAD' } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'document.uploaded', entity: 'Document', entityId: created.id, metadata: { mimeType: file.type, sizeBytes: file.size, shipmentId, customerId } } })
      return created
    })
    return NextResponse.json({ document: { ...document, sizeBytes: document.sizeBytes.toString() } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload document'
    const status = message.includes('Authentication') ? 401 : message.includes('permissions') || message.includes('access') ? 403 : message.includes('configured') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
