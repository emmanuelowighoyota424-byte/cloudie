import { NextResponse } from 'next/server'
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { createDispute, listDisputes, updateDispute } from '@/lib/platform-db'

const allowed = new Set(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CANCELLED'])

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user, membership } = await requireWorkspaceMember(workspaceId)
    const disputes = await listDisputes(workspaceId, user.id, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF'].includes(membership.role))
    return NextResponse.json({ disputes })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load disputes'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user, membership } = await requireWorkspaceMember(workspaceId)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = body?.action === 'update' ? 'update' : 'create'
    if (action === 'update') {
      if (!['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF'].includes(membership.role)) return NextResponse.json({ error: 'Admin review required' }, { status: 403 })
      const id = typeof body?.id === 'string' ? body.id : ''
      const status = typeof body?.status === 'string' ? body.status : ''
      if (!id || !allowed.has(status)) return NextResponse.json({ error: 'Invalid dispute transition' }, { status: 400 })
      const current = (await prisma.$queryRaw<{ status: string }[]>`SELECT "status" FROM "MarketplaceDispute" WHERE "id"=${id} AND "workspaceId"=${workspaceId} LIMIT 1`)[0]
      if (!current) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
      const transitions: Record<string, string[]> = { OPEN: ['UNDER_REVIEW','CANCELLED'], UNDER_REVIEW: ['RESOLVED','REJECTED'], RESOLVED: [], REJECTED: [], CANCELLED: [] }
      if (!transitions[current.status]?.includes(status)) return NextResponse.json({ error: `Invalid transition from ${current.status} to ${status}` }, { status: 409 })
      const dispute = await updateDispute(id, workspaceId, user.id, status, typeof body?.resolution === 'string' ? body.resolution.trim() : null)
      await prisma.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'dispute.status_changed', entity: 'MarketplaceDispute', entityId: id, metadata: { from: current.status, to: status } } })
      return NextResponse.json({ dispute })
    }

    const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const orderItemId = typeof body?.orderItemId === 'string' ? body.orderItemId : null
    if (!orderId || !reason || !description) return NextResponse.json({ error: 'orderId, reason and description are required' }, { status: 400 })
    const order = await prisma.order.findFirst({ where: { id: orderId, workspaceId }, include: { items: { include: { product: true } } } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const ownsOrder = order.userId === user.id
    const ownsVendorItem = membership.role === 'VENDOR' && order.items.some((item) => item.product.vendorId && item.product.vendorId === body?.vendorId)
    if (!ownsOrder && !ownsVendorItem && !['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'].includes(membership.role)) return NextResponse.json({ error: 'Dispute access denied' }, { status: 403 })
    const selected = orderItemId ? order.items.find((item) => item.id === orderItemId) : undefined
    if (orderItemId && !selected) return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
    const dispute = await createDispute({ id: crypto.randomUUID(), workspaceId, orderId, orderItemId, customerId: order.customerId, vendorId: selected?.product.vendorId ?? null, openedById: user.id, reason, description })
    await prisma.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'dispute.created', entity: 'MarketplaceDispute', entityId: dispute.id, metadata: { orderId, orderItemId } } })
    return NextResponse.json({ dispute }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process dispute'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
