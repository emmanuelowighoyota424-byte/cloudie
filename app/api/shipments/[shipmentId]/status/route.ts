import { NextResponse } from 'next/server'
import { ShipmentStatus, WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'
import { canTransitionShipment } from '@/lib/shipment'

const ROLES = [WorkspaceRole.SUPER_ADMIN, WorkspaceRole.WORKSPACE_ADMIN, WorkspaceRole.MANAGER, WorkspaceRole.STAFF, WorkspaceRole.DRIVER]

export async function POST(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await params
  try {
    const body = await request.json().catch(() => null) as { workspaceId?: unknown; status?: unknown; location?: unknown; note?: unknown } | null
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    const nextStatus = typeof body?.status === 'string' && Object.values(ShipmentStatus).includes(body.status as ShipmentStatus) ? body.status as ShipmentStatus : null
    if (!workspaceId || !nextStatus) return NextResponse.json({ error: 'workspaceId and valid status are required' }, { status: 400 })
    const { user } = await requireWorkspaceRole(workspaceId, ROLES)
    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId } })
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    if (!canTransitionShipment(shipment.status, nextStatus)) return NextResponse.json({ error: `Invalid shipment transition from ${shipment.status} to ${nextStatus}` }, { status: 409 })
    if (shipment.status === nextStatus) return NextResponse.json({ shipment })
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({ where: { id: shipment.id }, data: { status: nextStatus, deliveredAt: nextStatus === ShipmentStatus.DELIVERED ? new Date() : shipment.deliveredAt, events: { create: { status: nextStatus, location: typeof body.location === 'string' ? body.location.slice(0, 200) : undefined, note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined } } } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'shipment.status_changed', entity: 'Shipment', entityId: shipment.id, result: 'SUCCESS', metadata: { from: shipment.status, to: nextStatus } } })
      return result
    })
    return NextResponse.json({ shipment: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update shipment'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}
