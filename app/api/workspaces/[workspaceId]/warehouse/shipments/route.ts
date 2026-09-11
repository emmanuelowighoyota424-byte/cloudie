import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'
import { canTransitionShipment } from '@/lib/shipment'
import { notifyShipmentUsers } from '@/lib/notifications'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, 'WAREHOUSE_STAFF')
    const assignments = await prisma.warehouseStaffAssignment.findMany({ where: { workspaceId, userId: user.id }, select: { warehouseId: true } })
    const warehouseIds = assignments.map((assignment) => assignment.warehouseId)
    if (!warehouseIds.length) return NextResponse.json({ shipments: [] })
    const shipments = await prisma.shipment.findMany({ where: { workspaceId, warehouseId: { in: warehouseIds } }, include: { warehouse: true, events: { orderBy: { createdAt: 'desc' }, take: 10 }, customer: true }, orderBy: { updatedAt: 'desc' }, take: 100 })
    return NextResponse.json({ shipments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load warehouse shipments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, 'WAREHOUSE_STAFF')
    const body = await request.json().catch(() => null)
    const shipmentId = typeof body?.shipmentId === 'string' ? body.shipmentId : null
    const action = typeof body?.action === 'string' ? body.action : null
    if (!shipmentId || !['RECEIVE', 'DISPATCH'].includes(action ?? '')) return NextResponse.json({ error: 'shipmentId and action RECEIVE|DISPATCH are required' }, { status: 400 })
    const assignment = await prisma.warehouseStaffAssignment.findFirst({ where: { workspaceId, userId: user.id, warehouse: { status: 'ACTIVE' } }, select: { warehouseId: true } })
    if (!assignment) return NextResponse.json({ error: 'No active warehouse assignment' }, { status: 403 })
    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId, warehouseId: assignment.warehouseId }, include: { warehouse: true } })
    if (!shipment) return NextResponse.json({ error: 'Shipment is not assigned to your warehouse' }, { status: 403 })
    const nextStatus = action === 'DISPATCH' ? 'IN_TRANSIT' : shipment.status
    if (action === 'DISPATCH' && !canTransitionShipment(shipment.status, 'IN_TRANSIT')) return NextResponse.json({ error: `Shipment cannot be dispatched from ${shipment.status}` }, { status: 409 })
    const note = action === 'RECEIVE' ? 'Shipment received at warehouse' : 'Shipment dispatched from warehouse'
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({ where: { id: shipmentId }, data: { status: nextStatus } })
      await tx.shipmentEvent.create({ data: { shipmentId, status: nextStatus, note } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: `warehouse.shipment_${action.toLowerCase()}`, entity: 'Shipment', entityId: shipmentId } })
      return result
    })
    await notifyShipmentUsers(workspaceId, shipmentId, action === 'RECEIVE' ? 'Shipment received' : 'Shipment dispatched', `Shipment ${shipment.trackingId} was ${action === 'RECEIVE' ? 'received at' : 'dispatched from'} the warehouse.`)
    return NextResponse.json({ shipment: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update warehouse shipment'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('permissions') || message.includes('access') ? 403 : 400 })
  }
}
