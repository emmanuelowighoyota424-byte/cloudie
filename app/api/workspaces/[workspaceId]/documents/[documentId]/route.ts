import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deletePrivateObject, getPrivateObject } from '@/lib/storage'
import { requireUser } from '@/lib/authorization'

async function authorizedDocument(workspaceId: string, documentId: string) {
  const user = await requireUser()
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
  if (!membership || membership.status !== 'ACTIVE') throw new Error('Workspace access denied')
  const document = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    include: {
      shipment: { select: { customer: { select: { email: true } }, driver: { select: { userId: true } }, warehouseId: true } },
      customer: { select: { email: true } },
    },
  })
  if (!document) throw new Error('Document not found')
  const privileged = ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF'].includes(membership.role)
  const isOwner = document.ownerId === user.id
  const isDriver = membership.role === 'DRIVER' && document.shipment?.driver?.userId === user.id
  const isWarehouseStaff = membership.role === 'WAREHOUSE_STAFF' && document.shipment?.warehouseId
    ? Boolean(await prisma.warehouseStaffAssignment.findFirst({ where: { workspaceId, userId: user.id, warehouseId: document.shipment.warehouseId } }))
    : false
  const customerEmail = document.customer?.email ?? document.shipment?.customer?.email
  const isCustomer = membership.role === 'CUSTOMER' && customerEmail?.toLowerCase() === user.email.toLowerCase()
  if (!privileged && !isOwner && !isDriver && !isWarehouseStaff && !isCustomer) throw new Error('Document access denied')
  return { user, membership, document }
}

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; documentId: string }> }) {
  try {
    const { workspaceId, documentId } = await context.params
    const { user, document } = await authorizedDocument(workspaceId, documentId)
    const response = await getPrivateObject(document.storageKey)
    await prisma.documentAccess.create({ data: { documentId, userId: user.id, action: 'READ' } })
    return new Response(response.body, { status: 200, headers: { 'content-type': document.mimeType, 'content-disposition': `inline; filename="${document.name.replace(/"/g, '')}"`, 'cache-control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retrieve document'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('not found') ? 404 : 403 })
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ workspaceId: string; documentId: string }> }) {
  try {
    const { workspaceId, documentId } = await context.params
    const { user, membership, document } = await authorizedDocument(workspaceId, documentId)
    if (!['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'].includes(membership.role)) return NextResponse.json({ error: 'Insufficient workspace permissions' }, { status: 403 })
    await deletePrivateObject(document.storageKey)
    await prisma.$transaction(async (tx) => {
      await tx.documentAccess.create({ data: { documentId, userId: user.id, action: 'DELETE' } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'document.deleted', entity: 'Document', entityId: documentId } })
      await tx.document.delete({ where: { id: documentId } })
    })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete document'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('not found') ? 404 : 403 })
  }
}
