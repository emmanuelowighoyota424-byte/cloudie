import { NextResponse } from 'next/server'
import { ShipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission, requireUser } from '@/lib/authorization'
import { canTransitionShipment } from '@/lib/shipment'
import { notifyShipmentUsers } from '@/lib/notifications'

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string; shipmentId: string }> }) {
  try {
    const { workspaceId, shipmentId } = await context.params
    const user = await requireUser()
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
    if (!membership || membership.status !== 'ACTIVE') return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const nextStatus = typeof body?.status === 'string' ? body.status as ShipmentStatus : null
    const location = typeof body?.location === 'string' ? body.location.trim().slice(0, 500) : undefined
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : undefined
    if (!nextStatus || !Object.values(ShipmentStatus).includes(nextStatus)) return NextResponse.json({ error: 'Invalid shipment status' }, { status: 400 })
    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId }, include: { driver: { select: { userId: true } } } })
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })

    if (membership.role === 'DRIVER') {
      if (shipment.driver?.userId !== user.id) return NextResponse.json({ error: 'Shipment is not assigned to this driver' }, { status: 403 })
      if (!['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'].includes(nextStatus)) return NextResponse.json({ error: 'Driver cannot set this status' }, { status: 403 })
    } else if (membership.role === 'WAREHOUSE_STAFF') {
      if (!shipment.warehouseId) return NextResponse.json({ error: 'Shipment is not assigned to a warehouse' }, { status: 403 })
      if (!['IN_TRANSIT'].includes(nextStatus)) return NextResponse.json({ error: 'Warehouse staff must use the warehouse workflow' }, { status: 403 })
    } else {
      await requirePermission(workspaceId, 'shipments.update')
    }
    if (!canTransitionShipment(shipment.status, nextStatus)) return NextResponse.json({ error: `Invalid transition from ${shipment.status} to ${nextStatus}` }, { status: 409 })

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({ where: { id: shipment.id }, data: { status: nextStatus, deliveredAt: nextStatus === 'DELIVERED' ? new Date() : undefined } })
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: nextStatus, location, note } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'shipment.status_changed', entity: 'Shipment', entityId: shipment.id, result: 'SUCCESS', metadata: { from: shipment.status, to: nextStatus } } })
      return result
    })
    await notifyShipmentUsers(workspaceId, shipmentId, `Shipment ${nextStatus.replaceAll('_', ' ').toLowerCase()}`, `Shipment ${shipment.trackingId} is now ${nextStatus.replaceAll('_', ' ').toLowerCase()}.`)
    return NextResponse.json({ shipment: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update shipment'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}
