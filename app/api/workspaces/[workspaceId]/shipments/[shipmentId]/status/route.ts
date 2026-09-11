import { NextResponse } from 'next/server'
import { ShipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'
import { canTransitionShipment } from '@/lib/shipment'

const canManage = ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF', 'DRIVER', 'WAREHOUSE_STAFF']

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string; shipmentId: string }> }) {
  try {
    const { workspaceId, shipmentId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, canManage as never)
    const body = await request.json().catch(() => null)
    const nextStatus = typeof body?.status === 'string' ? body.status as ShipmentStatus : null
    const location = typeof body?.location === 'string' ? body.location.trim().slice(0, 500) : undefined
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : undefined
    if (!nextStatus || !Object.values(ShipmentStatus).includes(nextStatus)) return NextResponse.json({ error: 'Invalid shipment status' }, { status: 400 })

    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId } })
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    if (!canTransitionShipment(shipment.status, nextStatus)) return NextResponse.json({ error: `Invalid transition from ${shipment.status} to ${nextStatus}` }, { status: 409 })

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: nextStatus, deliveredAt: nextStatus === 'DELIVERED' ? new Date() : undefined },
      })
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: nextStatus, location, note } })
      await tx.auditLog.create({
        data: { actorId: user.id, userId: user.id, workspaceId, action: 'shipment.status_changed', entity: 'Shipment', entityId: shipment.id, result: 'SUCCESS', metadata: { from: shipment.status, to: nextStatus } },
      })
      return result
    })
    return NextResponse.json({ shipment: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update shipment'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
