import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notifications'

export function validPaymentSignature(raw: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(signature.trim(), 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim()
  if (!secret) return NextResponse.json({ error: 'Payment webhook is not configured' }, { status: 503 })
  const raw = await request.text()
  const signature = request.headers.get('x-payment-signature')
  const provider = request.headers.get('x-payment-provider')?.trim().slice(0, 64)
  const eventId = request.headers.get('x-payment-event-id')?.trim().slice(0, 128)
  if (!signature || !provider || !eventId || !validPaymentSignature(raw, signature, secret)) return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  let payload: Record<string, unknown>
  try { payload = JSON.parse(raw) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  try {
    const webhook = await prisma.webhookEvent.create({ data: { provider, eventId, payload: payload as Prisma.InputJsonValue } }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
      throw error
    })
    if (!webhook) return NextResponse.json({ received: true, duplicate: true })
    const status = typeof payload.status === 'string' ? payload.status.toUpperCase() : ''
    const providerReference = typeof payload.reference === 'string' ? payload.reference.trim() : ''
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : ''
    const currency = typeof payload.currency === 'string' ? payload.currency.toUpperCase() : ''
    const amount = typeof payload.amount === 'number' || typeof payload.amount === 'string' ? new Prisma.Decimal(String(payload.amount)) : null
    if (!providerReference || !orderId || !amount || !currency || !['PAID', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status)) return NextResponse.json({ error: 'Invalid payment event payload' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true } })
      if (!order) throw new Error('Order not found')
      if (order.total.toString() !== amount.toString()) throw new Error('Payment amount mismatch')
      const existingPayment = order.payments.find((payment) => payment.provider === provider && payment.providerReference === providerReference)
      const payment = existingPayment
        ? await tx.payment.update({ where: { id: existingPayment.id }, data: { status, verifiedAt: status === 'PAID' ? new Date() : undefined } })
        : await tx.payment.create({ data: { orderId, provider, providerReference, amount, currency, status, verifiedAt: status === 'PAID' ? new Date() : undefined } })
      const nextOrderStatus = status === 'PAID' ? 'PROCESSING' : status === 'REFUNDED' ? 'REFUNDED' : status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status, status: nextOrderStatus } })
      await tx.auditLog.create({ data: { userId: order.userId ?? undefined, workspaceId: order.workspaceId, action: `payment.${status.toLowerCase()}`, entity: 'Payment', entityId: payment.id, metadata: { provider, providerReference, orderId } } })
      await tx.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } })
      return { orderId, workspaceId: order.workspaceId, userId: order.userId }
    })
    if (status === 'PAID' && result.userId) await notifyUsers({ workspaceId: result.workspaceId, userIds: [result.userId], title: 'Payment completed', message: `Payment for order ${result.orderId} was verified.`, type: 'PAYMENT' })
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed'
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
}
