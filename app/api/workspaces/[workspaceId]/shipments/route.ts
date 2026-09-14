import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission, requireWorkspaceMember } from '@/lib/authorization'
import { requireEntitlement } from '@/lib/entitlements'
import { generateTrackingNumber } from '@/lib/shipment'
import { notifyShipmentUsers } from '@/lib/notifications'
import { chargeForAction } from '@/lib/billing'
import { creditPoints } from '@/lib/points'

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
    const { user, membership } = await requireWorkspaceMember(workspaceId)
    if (!['CUSTOMER', 'SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF', 'DRIVER', 'WAREHOUSE_STAFF'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient workspace permissions' }, { status: 403 })
    }
    const where = membership.role === 'CUSTOMER' ? { workspaceId, creatorId: user.id } : { workspaceId }
    const shipments = await prisma.shipment.findMany({
      where,
      include: { customer: true, driver: true, warehouse: true, events: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ shipments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load shipments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  let charged = 0
  let userId = ''
  let workspaceId = ''
  try {
    ({ workspaceId } = await context.params)
    const { user, membership } = await requirePermission(workspaceId, 'shipments.create')
    userId = user.id
    await requireEntitlement(workspaceId, 'shipments')
    const body = await request.json().catch(() => null)
    const origin = typeof body?.origin === 'string' ? body.origin.trim() : ''
    const destination = typeof body?.destination === 'string' ? body.destination.trim() : ''
    const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined
    const driverId = typeof body?.driverId === 'string' ? body.driverId : undefined
    const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId : undefined

    if (!origin || !destination || origin.length > 500 || destination.length > 500) {
      return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 })
    }

    let resolvedCustomerId = customerId
    if (membership.role === 'CUSTOMER') {
      if (customerId || driverId || warehouseId) return NextResponse.json({ error: 'Customers cannot assign shipment resources' }, { status: 403 })
      const existingCustomer = await prisma.customer.findFirst({ where: { workspaceId, email: user.email }, select: { id: true } })
      const customer = existingCustomer ?? await prisma.customer.create({ data: { workspaceId, name: user.name, email: user.email }, select: { id: true } })
      resolvedCustomerId = customer.id
    }

    const [customer, driver, warehouse] = await Promise.all([
      resolvedCustomerId ? prisma.customer.findFirst({ where: { id: resolvedCustomerId, workspaceId }, select: { id: true } }) : null,
      driverId ? prisma.driver.findFirst({ where: { id: driverId, workspaceId, status: 'ACTIVE' }, select: { id: true } }) : null,
      warehouseId ? prisma.warehouse.findFirst({ where: { id: warehouseId, workspaceId, status: 'ACTIVE' }, select: { id: true } }) : null,
    ])
    if (resolvedCustomerId && !customer) return NextResponse.json({ error: 'Customer not found in workspace' }, { status: 400 })
    if (driverId && !driver) return NextResponse.json({ error: 'Driver not found in workspace' }, { status: 400 })
    if (warehouseId && !warehouse) return NextResponse.json({ error: 'Warehouse not found in workspace' }, { status: 400 })

    const trackingId = await uniqueTrackingNumber()
    const reference = `shipment:create:${trackingId}`
    const charge = await chargeForAction({ userId, workspaceId, action: 'shipments.create', description: 'Shipment created', reference })
    charged = charge.amount

    let shipment
    try {
      shipment = await prisma.$transaction(async tx => {
        const created = await tx.shipment.create({ data: { workspaceId, creatorId: userId, trackingId, origin, destination, customerId: resolvedCustomerId, driverId, warehouseId } })
        await tx.shipmentEvent.create({ data: { shipmentId: created.id, status: created.status, note: 'Shipment created' } })
        await tx.auditLog.create({ data: { actorId: userId, userId, workspaceId, action: 'shipment.created', entity: 'Shipment', entityId: created.id, result: 'SUCCESS', metadata: { pointsCharged: charge.amount, customerCreated: membership.role === 'CUSTOMER' } } })
        return created
      })
    } catch (error) {
      if (charged) await creditPoints({ userId, amount: charged, description: 'Refund for failed shipment creation', reference: `${reference}:rollback`, workspace: workspaceId }).catch(() => {})
      throw error
    }

    await notifyShipmentUsers(workspaceId, shipment.id, 'Shipment created', `Shipment ${shipment.trackingId} was created.`)
    return NextResponse.json({ shipment, pointsCharged: charged }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create shipment'
    const status = message.includes('Insufficient points') ? 402 : message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : message.includes('limit reached') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
