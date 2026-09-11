import { NextResponse } from 'next/server'
import { ShipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'
import { canTransitionShipment } from '@/lib/shipment'
import { notifyShipmentUsers } from '@/lib/notifications'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, 'DRIVER')
    const driver = await prisma.driver.findFirst({ where: { workspaceId, userId: user.id, status: 'ACTIVE' }, select: { id: true } })
    if (!driver) return NextResponse.json({ error: 'Driver profile not found' }, { status: 403 })
    const shipments = await prisma.shipment.findMany({ where: { workspaceId, driverId: driver.id }, include: { events: { orderBy: { createdAt: 'desc' }, take: 20 }, proofOfDelivery: true, customer: true, warehouse: true }, orderBy: { updatedAt: 'desc' }, take: 100 })
    return NextResponse.json({ shipments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load driver shipments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, 'DRIVER')
    const driver = await prisma.driver.findFirst({ where: { workspaceId, userId: user.id, status: 'ACTIVE' }, select: { id: true } })
    if (!driver) return NextResponse.json({ error: 'Driver profile not found' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const shipmentId = typeof body?.shipmentId === 'string' ? body.shipmentId : null
    const nextStatus = typeof body?.status === 'string' ? body.status as ShipmentStatus : null
    if (!shipmentId || !nextStatus || !Object.values(ShipmentStatus).includes(nextStatus)) return NextResponse.json({ error: 'shipmentId and valid status are required' }, { status: 400 })
    if (!['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'].includes(nextStatus)) return NextResponse.json({ error: 'Driver cannot directly set this status' }, { status: 403 })
    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId, driverId: driver.id } })
    if (!shipment) return NextResponse.json({ error: 'Assigned shipment not found' }, { status: 404 })
    if (!canTransitionShipment(shipment.status, nextStatus)) return NextResponse.json({ error: `Invalid transition from ${shipment.status} to ${nextStatus}` }, { status: 409 })
    const location = typeof body?.location === 'string' ? body.location.trim().slice(0, 500) : undefined
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : undefined
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({ where: { id: shipmentId }, data: { status: nextStatus } })
      await tx.shipmentEvent.create({ data: { shipmentId, status: nextStatus, location, note } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'driver.shipment_status_changed', entity: 'Shipment', entityId: shipmentId, metadata: { from: shipment.status, to: nextStatus } } })
      return result
    })
    await notifyShipmentUsers(workspaceId, shipmentId, `Shipment ${nextStatus.replaceAll('_', ' ').toLowerCase()}`, `Shipment ${shipment.trackingId} is now ${nextStatus.replaceAll('_', ' ').toLowerCase()}.`)
    return NextResponse.json({ shipment: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update driver shipment'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('permissions') || message.includes('access') ? 403 : 400 })
  }
}
