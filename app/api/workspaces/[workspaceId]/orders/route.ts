import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'
import { notifyWorkspaceRole } from '@/lib/notifications'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const user = await requireUser()
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
    if (!membership || membership.status !== 'ACTIVE') return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const where = membership.role === 'CUSTOMER' ? { workspaceId, userId: user.id } : { workspaceId }
    const orders = await prisma.order.findMany({ where, include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } }, payments: true, customer: true }, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ orders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list orders'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const user = await requireUser()
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
    if (!membership || membership.status !== 'ACTIVE') return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    if (!['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'].includes(membership.role)) return NextResponse.json({ error: 'Insufficient workspace permissions' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const items = Array.isArray(body?.items) ? body.items : []
    if (!items.length || items.length > 100) return NextResponse.json({ error: 'items must contain 1-100 entries' }, { status: 400 })
    const idempotencyKey = request.headers.get('idempotency-key')?.trim().slice(0, 128) || (typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 128) : null)
    if (!idempotencyKey) return NextResponse.json({ error: 'Idempotency-Key header is required' }, { status: 400 })
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } })
    if (existing && existing.workspaceId === workspaceId && existing.userId === user.id) return NextResponse.json({ order: existing, reused: true })
    if (existing) return NextResponse.json({ error: 'Idempotency key already belongs to another request' }, { status: 409 })

    const requestedCustomerId = typeof body?.customerId === 'string' ? body.customerId : null
    const customer = requestedCustomerId ? await prisma.customer.findFirst({ where: { id: requestedCustomerId, workspaceId } }) : membership.role === 'CUSTOMER' ? await prisma.customer.findFirst({ where: { workspaceId, email: { equals: user.email, mode: 'insensitive' } } }) : null
    if (membership.role === 'CUSTOMER' && !customer) return NextResponse.json({ error: 'Customer profile not found' }, { status: 400 })
    if (membership.role === 'CUSTOMER' && requestedCustomerId !== customer?.id) return NextResponse.json({ error: 'Customer ownership mismatch' }, { status: 403 })
    if (requestedCustomerId && !customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const productIds = items.map((item) => typeof item?.productId === 'string' ? item.productId : '').filter(Boolean)
    if (productIds.length !== items.length || new Set(productIds).size !== productIds.length) return NextResponse.json({ error: 'Each item requires a unique productId' }, { status: 400 })
    const products = await prisma.product.findMany({ where: { workspaceId, id: { in: productIds }, active: true } })
    if (products.length !== productIds.length) return NextResponse.json({ error: 'One or more products are unavailable' }, { status: 400 })
    const byId = new Map(products.map((p) => [p.id, p]))
    const normalized = items.map((item) => {
      const product = byId.get(String(item.productId))!
      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error('Invalid quantity')
      if (product.stock < quantity) throw new Error(`Insufficient stock for ${product.sku}`)
      return { product, quantity, unitPrice: product.price }
    })
    const subtotal = normalized.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0))
    const order = await prisma.$transaction(async (tx) => {
      for (const item of normalized) {
        const updated = await tx.product.updateMany({ where: { id: item.product.id, workspaceId, stock: { gte: item.quantity }, active: true }, data: { stock: { decrement: item.quantity } } })
        if (updated.count !== 1) throw new Error(`Stock changed for ${item.product.sku}; retry the order`)
      }
      const created = await tx.order.create({ data: { workspaceId, customerId: customer?.id, userId: user.id, idempotencyKey, status: 'PENDING', paymentStatus: 'PENDING', subtotal, total: subtotal, commission: new Prisma.Decimal(0), items: { create: normalized.map((item) => ({ productId: item.product.id, quantity: item.quantity, unitPrice: item.unitPrice })) } }, include: { items: true } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'order.created', entity: 'Order', entityId: created.id, metadata: { total: subtotal.toString(), itemCount: normalized.length } } })
      return created
    })
    await notifyWorkspaceRole({ workspaceId, roles: ['WORKSPACE_ADMIN', 'MANAGER', 'STAFF'], title: 'New order created', message: `Order ${order.id} is awaiting payment.` })
    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create order'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('ownership') ? 403 : 400 })
  }
}
