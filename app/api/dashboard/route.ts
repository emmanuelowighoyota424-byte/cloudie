import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPointBalance, getPointLedger } from '@/lib/points'
import { requireUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireUser()
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)

    const [balance, ledger, activeShipments, completedShipments, totalReferrals, monthlyTransactions, recentShipments, recentOrders, notifications, memberships] = await Promise.all([
      getPointBalance(user.id),
      getPointLedger(user.id, { take: 8 }),
      prisma.shipment.count({ where: { creatorId: user.id, status: { in: ['PENDING', 'CONFIRMED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
      prisma.shipment.count({ where: { creatorId: user.id, status: 'DELIVERED' } }),
      prisma.referral.count({ where: { userId: user.id } }),
      prisma.pointLedger.count({ where: { userId: user.id, createdAt: { gte: startOfMonth } } }),
      prisma.shipment.findMany({ where: { creatorId: user.id }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, trackingId: true, origin: true, destination: true, status: true, createdAt: true } }),
      prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, status: true, paymentStatus: true, total: true, createdAt: true } }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, title: true, message: true, type: true, readAt: true, createdAt: true } }),
      prisma.workspaceMember.findMany({ where: { userId: user.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 12, select: { id: true, role: true, workspace: { select: { id: true, name: true, slug: true, plan: true, subscriptionStatus: true } } } }),
    ])

    return NextResponse.json({
      ok: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, emailVerified: user.emailVerified },
        points: { balance },
        statistics: { activeShipments, completedShipments, totalReferrals, monthlyTransactions },
        recentTransactions: ledger,
        recentShipments,
        recentOrders,
        notifications,
        workspaces: memberships,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load dashboard'
    const status = message === 'Authentication required' || message === 'Account suspended' ? 401 : 500
    return NextResponse.json({ ok: false, error: { code: status === 401 ? 'UNAUTHENTICATED' : 'DASHBOARD_UNAVAILABLE', message: status === 401 ? message : 'Unable to load dashboard' } }, { status })
  }
}
