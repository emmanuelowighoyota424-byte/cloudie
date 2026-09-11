import { NextResponse } from 'next/server'
import { ShipmentStatus, WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'
import { generateTrackingNumber } from '@/lib/shipment'

const CREATE_ROLES = [WorkspaceRole.SUPER_ADMIN, WorkspaceRole.WORKSPACE_ADMIN, WorkspaceRole.MANAGER, WorkspaceRole.STAFF]

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  try {
    await requireWorkspaceRole(workspaceId, Object.values(WorkspaceRole))
    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      select: { id: true, trackingId: true, origin: true, destination: true, status: true, createdAt: true, updatedAt: true, customer: { select: { id: true, name: true } }, driver: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ shipments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load shipments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  try {
    const { user } = await requireWorkspaceRole(workspaceId, CREATE_ROLES)
    const origin = typeof body?.origin === 'string' ? body.origin.trim() : ''
    const destination = typeof body?.destination === 'string' ? body.destination.trim() : ''
    if (!origin || !destination || origin.length > 200 || destination.length > 200) return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 })
    const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined
    const driverId = typeof body?.driverId === 'string' ? body.driverId : undefined
    const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId : undefined

    const trackingId = await (async () => {
      for (let i = 0; i < 8; i++) {
        const candidate = generateTrackingNumber()
        if (!(await prisma.shipment.findUnique({ where: { trackingId: candidate }, select: { id: true } }))) return candidate
      }
      throw new Error('Unable to allocate a unique tracking number')
    })()

    const shipment = await prisma.$transaction(async (tx) => {
      if (customerId && !(await tx.customer.findFirst({ where: { id: customerId, workspaceId }, select: { id: true } }))) throw new Error('Customer does not belong to workspace')
      if (driverId && !(await tx.driver.findFirst({ where: { id: driverId, workspaceId }, select: { id: true } }))) throw new Error('Driver does not belong to workspace')
      if (warehouseId && !(await tx.warehouse.findFirst({ where: { id: warehouseId, workspaceId }, select: { id: true } }))) throw new Error('Warehouse does not belong to workspace')
      const created = await tx.shipment.create({ data: { workspaceId, trackingId, creatorId: user.id, customerId, driverId, warehouseId, origin, destination, events: { create: { status: ShipmentStatus.PENDING, location: origin, note: 'Shipment created' } } } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'shipment.created', entity: 'Shipment', entityId: created.id, result: 'SUCCESS' } })
      return created
    })
    return NextResponse.json({ shipment }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create shipment'
    const status = message.includes('Authentication') ? 401 : message.includes('permissions') || message.includes('access') ? 403 : message.includes('belong') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
