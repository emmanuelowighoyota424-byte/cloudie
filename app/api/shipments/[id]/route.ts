import { NextResponse } from 'next/server'
import { ShipmentStatus } from '@prisma/client'
import { requirePermission, requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { notifyShipmentUsers } from '@/lib/notifications'
import { canTransitionShipment } from '@/lib/shipment'

const STATUS_VALUES = new Set(Object.values(ShipmentStatus))
function statusFor(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message === 'Authentication required' || message === 'Account suspended') return 401; if (message.includes('access denied') || message.includes('permissions')) return 403; return 500 }

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const shipment = await prisma.shipment.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'desc' } }, customer: true, driver: true, warehouse: true } })
    if (!shipment) return NextResponse.json({ ok:false, error:{ code:'NOT_FOUND', message:'Shipment not found' } }, { status:404 })
    const { user, membership } = await requireWorkspaceMember(shipment.workspaceId)
    if (membership.role === 'CUSTOMER' && shipment.creatorId !== user.id) return NextResponse.json({ ok:false, error:{ code:'FORBIDDEN', message:'Shipment access denied' } }, { status:403 })
    return NextResponse.json({ ok:true, data:{ shipment } })
  } catch (error) { return NextResponse.json({ ok:false, error:{ code:'SHIPMENT_READ_FAILED', message:error instanceof Error ? error.message : 'Unable to load shipment' } }, { status:statusFor(error) }) }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const shipment = await prisma.shipment.findUnique({ where:{ id }, select:{ id:true, workspaceId:true, status:true, trackingId:true } })
    if (!shipment) return NextResponse.json({ ok:false, error:{ code:'NOT_FOUND', message:'Shipment not found' } }, { status:404 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const status = typeof body?.status === 'string' ? body.status : ''
    const location = typeof body?.location === 'string' ? body.location.trim().slice(0,300) : null
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0,1000) : null
    if (!STATUS_VALUES.has(status as ShipmentStatus)) return NextResponse.json({ ok:false, error:{ code:'INVALID_STATUS', message:'Invalid shipment status' } }, { status:400 })
    const { user } = await requirePermission(shipment.workspaceId, 'shipments.update')
    if (!canTransitionShipment(shipment.status, status as ShipmentStatus)) return NextResponse.json({ ok:false, error:{ code:'INVALID_TRANSITION', message:`Cannot move shipment from ${shipment.status} to ${status}` } }, { status:422 })
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.shipment.update({ where:{ id }, data:{ status:status as ShipmentStatus, deliveredAt:status === 'DELIVERED' ? new Date() : undefined } })
      const event = await tx.shipmentEvent.create({ data:{ shipmentId:id, status:status as ShipmentStatus, location, note } })
      await tx.auditLog.create({ data:{ actorId:user.id, userId:user.id, workspaceId:shipment.workspaceId, action:'shipment.status_changed', entity:'Shipment', entityId:id, metadata:{ from:shipment.status, to:status, location, note } } })
      return { updated, event }
    })
    await notifyShipmentUsers(shipment.workspaceId, id, 'Shipment updated', `${shipment.trackingId} is now ${status.replaceAll('_',' ')}.`).catch(() => {})
    return NextResponse.json({ ok:true, data:{ shipment:result.updated, event:result.event } })
  } catch (error) { return NextResponse.json({ ok:false, error:{ code:'SHIPMENT_UPDATE_FAILED', message:error instanceof Error ? error.message : 'Unable to update shipment' } }, { status:statusFor(error) }) }
}
