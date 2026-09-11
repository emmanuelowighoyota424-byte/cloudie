import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/authorization'
import { validateUpload, sanitizeFilename, putPrivateObject } from '@/lib/storage'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user, membership } = await requirePermission(workspaceId, 'documents.read')
    let resourceFilter: Record<string, unknown> = {}
    if (membership.role === 'CUSTOMER') {
      const customer = await prisma.customer.findFirst({ where: { workspaceId, email: { equals: user.email, mode: 'insensitive' } }, select: { id: true } })
      resourceFilter = { OR: [{ customerId: customer?.id ?? '__no_customer__' }, { shipment: { customerId: customer?.id ?? '__no_customer__' } }] }
    } else if (membership.role === 'DRIVER') {
      const driver = await prisma.driver.findFirst({ where: { workspaceId, userId: user.id, status: 'ACTIVE' }, select: { id: true } })
      resourceFilter = { shipment: { driverId: driver?.id ?? '__no_driver__' } }
    } else if (membership.role === 'WAREHOUSE_STAFF') {
      const assignments = await prisma.warehouseStaffAssignment.findMany({ where: { workspaceId, userId: user.id }, select: { warehouseId: true } })
      resourceFilter = { shipment: { warehouseId: { in: assignments.map((assignment) => assignment.warehouseId) } } }
    }
    const documents = await prisma.document.findMany({
      where: { workspaceId, ...resourceFilter },
      select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true, ownerId: true, shipmentId: true, customerId: true },
      orderBy: { createdAt: 'desc' }, take: 100,
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
    const { user, membership } = await requirePermission(workspaceId, 'documents.write')
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    validateUpload(file.type, file.size)
    const shipmentId = typeof form.get('shipmentId') === 'string' && String(form.get('shipmentId')).trim() ? String(form.get('shipmentId')) : null
    const customerId = typeof form.get('customerId') === 'string' && String(form.get('customerId')).trim() ? String(form.get('customerId')) : null

    const shipment = shipmentId ? await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId }, select: { id: true, customerId: true, driverId: true, warehouseId: true } }) : null
    if (shipmentId && !shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    const customer = customerId ? await prisma.customer.findFirst({ where: { id: customerId, workspaceId }, select: { id: true, email: true } }) : null
    if (customerId && !customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    if (membership.role === 'DRIVER') {
      const driver = await prisma.driver.findFirst({ where: { workspaceId, userId: user.id, status: 'ACTIVE' }, select: { id: true } })
      if (!driver || !shipment || shipment.driverId !== driver.id) return NextResponse.json({ error: 'Driver may upload documents only for assigned shipments' }, { status: 403 })
      if (customerId && customerId !== shipment.customerId) return NextResponse.json({ error: 'Customer does not belong to the assigned shipment' }, { status: 403 })
    } else if (membership.role === 'WAREHOUSE_STAFF') {
      const allowed = shipment ? await prisma.warehouseStaffAssignment.findFirst({ where: { workspaceId, userId: user.id, warehouseId: shipment.warehouseId ?? '__none__' }, select: { id: true } }) : null
      if (!allowed) return NextResponse.json({ error: 'Warehouse staff may upload documents only for assigned warehouse shipments' }, { status: 403 })
      if (customerId && customerId !== shipment?.customerId) return NextResponse.json({ error: 'Customer does not belong to the warehouse shipment' }, { status: 403 })
    } else if (membership.role === 'CUSTOMER') {
      const ownCustomer = await prisma.customer.findFirst({ where: { workspaceId, email: { equals: user.email, mode: 'insensitive' } }, select: { id: true } })
      if (!ownCustomer || (customerId && customerId !== ownCustomer.id) || (shipment && shipment.customerId !== ownCustomer.id)) return NextResponse.json({ error: 'Customer may upload documents only for their own resources' }, { status: 403 })
    }

    const safeName = sanitizeFilename(file.name)
    const storageKey = `workspaces/${workspaceId}/documents/${crypto.randomUUID()}-${safeName}`
    const blob = await putPrivateObject(storageKey, await file.arrayBuffer(), file.type)
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: { workspaceId, ownerId: user.id, shipmentId, customerId: customerId ?? shipment?.customerId ?? null, name: safeName, mimeType: file.type, sizeBytes: BigInt(file.size), storageKey: blob.url, versions: { create: { version: 1, storageKey: blob.url, sizeBytes: BigInt(file.size), checksum: blob.etag } } },
      })
      await tx.documentAccess.create({ data: { documentId: created.id, userId: user.id, action: 'UPLOAD' } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'document.uploaded', entity: 'Document', entityId: created.id, metadata: { mimeType: file.type, sizeBytes: file.size, shipmentId, customerId: customerId ?? shipment?.customerId ?? null } } })
      return created
    })
    return NextResponse.json({ document: { ...document, sizeBytes: document.sizeBytes.toString() } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload document'
    const status = message.includes('Authentication') ? 401 : message.includes('permissions') || message.includes('access') ? 403 : message.includes('configured') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
