import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

export async function GET() {
  try {
    await requireSuperAdmin()
    const [users, activeUsers, workspaces, members, invitations, subscriptions, shipments, orders, paidOrders, documents, auditLogs] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { suspendedAt: null } }),
      prisma.workspace.count(),
      prisma.workspaceMember.count({ where: { status: 'ACTIVE' } }),
      prisma.workspaceInvitation.count({ where: { status: 'PENDING' } }),
      prisma.subscription.count(),
      prisma.shipment.count(),
      prisma.order.count(),
      prisma.order.count({ where: { paymentStatus: 'PAID' } }),
      prisma.document.count(),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    ])
    return NextResponse.json({ metrics: { users, activeUsers, workspaces, members, invitations, subscriptions, shipments, orders, paidOrders, documents }, auditLogs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load admin overview'
    return NextResponse.json({ error: message }, { status: message.includes('Super-admin') ? 403 : 401 })
  }
}
