import { prisma } from '@/lib/prisma'

export async function getWorkspaceSnapshot(userId: string) {
  const [shipments, pointLedger, notifications] = await Promise.all([
    prisma.shipment.findMany({ where: { userId }, include: { events: true }, orderBy: { createdAt: 'desc' } }),
    prisma.pointLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
  ])

  return { shipments, pointLedger, notifications }
}

export async function createShipment(userId: string, input: { trackingId: string; customer: string; origin: string; destination: string }) {
  return prisma.shipment.create({ data: { ...input, userId, events: { create: { status: 'PENDING', location: input.origin, note: 'Shipment created' } } } })
}

export async function getAdminSnapshot() {
  const [users, shipments, vendors, auditLogs] = await Promise.all([
    prisma.user.count(),
    prisma.shipment.count(),
    prisma.vendor.findMany({ orderBy: { name: 'asc' } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ])
  return { users, shipments, vendors, auditLogs }
}
