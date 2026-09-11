import { prisma } from '@/lib/prisma'

export async function notifyUsers(input: { workspaceId: string; userIds: string[]; title: string; message: string; type?: string; dedupeKey?: string }) {
  const userIds = [...new Set(input.userIds)].filter(Boolean)
  if (!userIds.length) return
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, workspaceId: input.workspaceId, title: input.title.slice(0, 160), message: input.message.slice(0, 1000), type: input.type ?? 'INFO' })),
  })
}

export async function notifyWorkspaceRole(input: { workspaceId: string; roles: string[]; title: string; message: string; type?: string }) {
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId: input.workspaceId, status: 'ACTIVE', role: { in: input.roles as never[] } }, select: { userId: true } })
  await notifyUsers({ ...input, userIds: members.map((m) => m.userId) })
}

export async function notifyShipmentUsers(workspaceId: string, shipmentId: string, title: string, message: string, type = 'SHIPMENT') {
  const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, workspaceId }, select: { creatorId: true, customer: { select: { email: true } }, driver: { select: { userId: true } } } })
  if (!shipment) return
  const ids = [shipment.creatorId, shipment.driver?.userId].filter((id): id is string => Boolean(id))
  if (shipment.customer?.email) {
    const customerUser = await prisma.user.findUnique({ where: { email: shipment.customer.email.toLowerCase() }, select: { id: true } })
    if (customerUser) ids.push(customerUser.id)
  }
  await notifyUsers({ workspaceId, userIds: ids, title, message, type })
}
