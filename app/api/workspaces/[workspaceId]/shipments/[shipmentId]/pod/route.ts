import { NextResponse } from 'next/server'
import { ShipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'
import { canTransitionShipment } from '@/lib/shipment'

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; shipmentId: string }> }) {
  try {
    const { workspaceId, shipmentId } = await context.params
    const user = await requireUser()
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
    if (!membership || membership.status !== 'ACTIVE') return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId }, include: { driver: { select: { userId: true } }, proofOfDelivery: true } })
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    const privileged = ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'].includes(membership.role)
    const isAssignedDriver = membership.role === 'DRIVER' && shipment.driver?.userId === user.id
    if (!privileged && !isAssignedDriver) return NextResponse.json({ error: 'Only the assigned driver or an authorized manager can complete delivery' }, { status: 403 })
    if (shipment.proofOfDelivery || shipment.status === 'DELIVERED') return NextResponse.json({ error: 'Delivery has already been completed' }, { status: 409 })
    if (!canTransitionShipment(shipment.status, ShipmentStatus.DELIVERED)) return NextResponse.json({ error: `Shipment cannot be delivered from ${shipment.status}` }, { status: 409 })

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const recipient = typeof body?.recipient === 'string' ? body.recipient.trim().slice(0, 160) : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : null
    const signatureDocumentId = typeof body?.signatureDocumentId === 'string' ? body.signatureDocumentId : null
    const photoDocumentId = typeof body?.photoDocumentId === 'string' ? body.photoDocumentId : null
    if (!recipient) return NextResponse.json({ error: 'recipient is required' }, { status: 400 })

    const documentIds = [signatureDocumentId, photoDocumentId].filter((id): id is string => Boolean(id))
    if (documentIds.length) {
      const docs = await prisma.document.findMany({ where: { id: { in: documentIds }, workspaceId, shipmentId }, select: { id: true } })
      if (docs.length !== documentIds.length) return NextResponse.json({ error: 'POD evidence must belong to this shipment and workspace' }, { status: 400 })
    }

    const completed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.proofOfDelivery.create({
        data: {
          shipmentId,
          recipient,
          notes,
          deliveredAt: new Date(),
          signatureUrl: signatureDocumentId ? `/api/workspaces/${workspaceId}/documents/${signatureDocumentId}` : null,
          photoUrl: photoDocumentId ? `/api/workspaces/${workspaceId}/documents/${photoDocumentId}` : null,
        },
      })
      const updated = await tx.shipment.update({ where: { id: shipmentId }, data: { status: 'DELIVERED', deliveredAt: claimed.deliveredAt } })
      await tx.shipmentEvent.create({ data: { shipmentId, status: 'DELIVERED', note: `Delivered to ${recipient}${notes ? ` — ${notes}` : ''}` } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'shipment.delivered', entity: 'Shipment', entityId: shipmentId, metadata: { proofOfDeliveryId: claimed.id } } })
      return { claimed, updated }
    })
    return NextResponse.json({ proofOfDelivery: completed.claimed, shipment: completed.updated }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete delivery'
    const status = message.includes('Authentication') ? 401 : message.includes('already exists') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
