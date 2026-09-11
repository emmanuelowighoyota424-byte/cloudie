import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/authorization'
import { requireEntitlement } from '@/lib/entitlements'
import { generateTrackingNumber } from '@/lib/shipment'
import { notifyShipmentUsers } from '@/lib/notifications'

async function uniqueTrackingNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const trackingId = generateTrackingNumber()
    const exists = await prisma.shipment.findUnique({ where: { trackingId }, select: { id: true } })
    if (!exists) return trackingId
  }
  throw new Error('Unable to allocate a unique tracking number')
}

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requirePermission(workspaceId, 'shipments.read')
    const shipments = await prisma.shipment.findMany({ where: { workspaceId }, include: { customer: true, driver: true, warehouse: true, events: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ shipments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load shipments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requirePermission(workspaceId, 'shipments.create')
    await requireEntitlement(workspaceId, 'shipments')
    const body = await request.json().catch(() => null)
    const origin = typeof body?.origin === 'string' ? body.origin.trim() : ''
    const destination = typeof body?.destination === 'string' ? body.destination.trim() : ''
    const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined
    const driverId = typeof body?.driverId === 'string' ? body.driverId : undefined
    const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId : undefined
    if (!origin || !destination || origin.length > 500 || destination.length > 500) return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 })
    const [customer, driver, warehouse] = await Promise.all([
      customerId ? prisma.customer.findFirst({ where: { id: customerId, workspaceId }, select: { id: true } }) : null,
      driverId ? prisma.driver.findFirst({ where: { id: driverId, workspaceId, status: 'ACTIVE' }, select: { id: true } }) : null,
      warehouseId ? prisma.warehouse.findFirst({ where: { id: warehouseId, workspaceId, status: 'ACTIVE' }, select: { id: true } }) : null,
    ])
    if (customerId && !customer) return NextResponse.json({ error: 'Customer not found in workspace' }, { status: 400 })
    if (driverId && !driver) return NextResponse.json({ error: 'Driver not found in workspace' }, { status: 400 })
    if (warehouseId && !warehouse) return NextResponse.json({ error: 'Warehouse not found in workspace' }, { status: 400 })
    const trackingId = await uniqueTrackingNumber()
    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({ data: { workspaceId, creatorId: user.id, trackingId, origin, destination, customerId, driverId, warehouseId } })
      await tx.shipmentEvent.create({ data: { shipmentId: created.id, status: created.status, note: 'Shipment created' } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'shipment.created', entity: 'Shipment', entityId: created.id, result: 'SUCCESS' } })
      return created
    })
    await notifyShipmentUsers(workspaceId, shipment.id, 'Shipment created', `Shipment ${shipment.trackingId} was created.`)
    return NextResponse.json({ shipment }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create shipment'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : message.includes('limit reached') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
