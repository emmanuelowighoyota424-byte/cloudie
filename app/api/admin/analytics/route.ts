import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    await requireSuperAdmin()
    const url = new URL(request.url)
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 30)))
    const since = new Date(Date.now() - days * 86400000)
    const [orders, users, tenants, shipments, payments, points, kyc, emails, jobs] = await Promise.all([
      prisma.order.aggregate({ where: { createdAt: { gte: since } }, _count: true, _sum: { total: true } }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.workspace.count({ where: { createdAt: { gte: since } } }),
      prisma.shipment.count({ where: { createdAt: { gte: since } } }),
      prisma.payment.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: true }),
      prisma.pointLedger.aggregate({ where: { createdAt: { gte: since } }, _sum: { amount: true } }),
      prisma.kYCVerification.groupBy({ by: ['status'], where: { submittedAt: { gte: since } }, _count: true }),
      prisma.$queryRaw(Prisma.sql`SELECT "status", COUNT(*)::int AS count FROM "EmailMessage" WHERE "createdAt">=${since} GROUP BY "status"`),
      prisma.$queryRaw(Prisma.sql`SELECT "status", COUNT(*)::int AS count FROM "CloudieJob" WHERE "createdAt">=${since} GROUP BY "status"`),
    ])
    return NextResponse.json({ period: { days, since }, revenue: orders._sum.total?.toString() ?? '0', orders: orders._count, customers: users, tenants, shipments, payments, pointsActivity: points._sum.amount ?? 0, kyc, emails, jobs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load analytics'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
