import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'
import { DashboardClient } from '@/components/dashboard-client'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/login')

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  })

  const workspaces = memberships.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, slug: workspace.slug, plan: workspace.plan, role }))
  const workspaceId = workspaces[0]?.id
  let metrics = null
  let recentShipments: Array<{ id: string; trackingId: string; origin: string; destination: string; status: string; createdAt: string }> = []

  if (workspaceId) {
    const [shipmentCount, deliveredShipments, pendingShipments, activeShipments, customers, vendors, orders, paidRevenue, shipments] = await Promise.all([
      prisma.shipment.count({ where: { workspaceId } }),
      prisma.shipment.count({ where: { workspaceId, status: 'DELIVERED' } }),
      prisma.shipment.count({ where: { workspaceId, status: 'PENDING' } }),
      prisma.shipment.count({ where: { workspaceId, status: { in: ['CONFIRMED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
      prisma.customer.count({ where: { workspaceId } }),
      prisma.vendor.count({ where: { workspaceId } }),
      prisma.order.count({ where: { workspaceId } }),
      prisma.order.aggregate({ where: { workspaceId, paymentStatus: 'PAID' }, _sum: { total: true } }),
      prisma.shipment.findMany({ where: { workspaceId }, select: { id: true, trackingId: true, origin: true, destination: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ])
    metrics = { shipmentCount, deliveredShipments, pendingShipments, activeShipments, customers, vendors, orders, revenue: paidRevenue._sum.total?.toString() ?? '0.00' }
    recentShipments = shipments.map((shipment) => ({ ...shipment, createdAt: shipment.createdAt.toISOString() }))
  }

  return <main className="min-h-screen bg-muted/40 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><DashboardClient userName={user.name} workspaces={workspaces} initialMetrics={metrics} initialShipments={recentShipments} /></div></main>
}
