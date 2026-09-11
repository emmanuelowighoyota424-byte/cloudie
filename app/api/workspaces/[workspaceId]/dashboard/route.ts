import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceMember } from '@/lib/authorization'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requireWorkspaceMember(workspaceId)

    const [shipmentCount, deliveredShipments, pendingShipments, activeShipments, customers, vendors, orders, paidRevenue, recentShipments] = await Promise.all([
      prisma.shipment.count({ where: { workspaceId } }),
      prisma.shipment.count({ where: { workspaceId, status: 'DELIVERED' } }),
      prisma.shipment.count({ where: { workspaceId, status: 'PENDING' } }),
      prisma.shipment.count({ where: { workspaceId, status: { in: ['CONFIRMED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
      prisma.customer.count({ where: { workspaceId } }),
      prisma.vendor.count({ where: { workspaceId } }),
      prisma.order.count({ where: { workspaceId } }),
      prisma.order.aggregate({ where: { workspaceId, paymentStatus: 'PAID' }, _sum: { total: true } }),
      prisma.shipment.findMany({
        where: { workspaceId },
        select: { id: true, trackingId: true, origin: true, destination: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    return NextResponse.json({
      metrics: {
        shipmentCount,
        deliveredShipments,
        pendingShipments,
        activeShipments,
        customers,
        vendors,
        orders,
        revenue: paidRevenue._sum.total?.toString() ?? '0.00',
      },
      recentShipments,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load dashboard'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
