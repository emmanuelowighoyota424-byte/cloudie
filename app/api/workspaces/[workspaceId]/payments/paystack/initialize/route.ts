import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceMember } from '@/lib/authorization'
import { createCloudiePaymentReference, getPaystackCallbackUrl, initializePaystackTransaction, paystackAmount } from '@/lib/paystack'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user, membership } = await requireWorkspaceMember(workspaceId)
    if (membership.role !== 'CUSTOMER') return NextResponse.json({ error: 'Customer access required' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })

    const order = await prisma.order.findFirst({ where: { id: orderId, workspaceId, userId: user.id }, include: { payments: { orderBy: { createdAt: 'desc' } } } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.paymentStatus === 'PAID') return NextResponse.json({ error: 'Order is already paid' }, { status: 409 })
    if (order.total.lte(0)) return NextResponse.json({ error: 'Order total must be positive' }, { status: 400 })

    const currency = (process.env.PAYSTACK_CURRENCY?.trim() || 'NGN').toUpperCase()
    const amount = paystackAmount(order.total, currency)
    const existing = order.payments.find((payment) => payment.provider === 'paystack' && ['PENDING', 'PROCESSING'].includes(payment.status))
    const payment = existing || await prisma.payment.create({ data: { orderId: order.id, provider: 'paystack', providerReference: createCloudiePaymentReference(), status: 'PENDING', amount: order.total, currency } })
    const reference = payment.providerReference!
    const callbackUrl = getPaystackCallbackUrl()

    try {
      const initialized = await initializePaystackTransaction({ email: user.email, amount, currency, reference, callback_url: callbackUrl, metadata: { cloudiePaymentId: payment.id, orderId: order.id, workspaceId } })
      if (payment.status !== 'PROCESSING') await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } })
      return NextResponse.json({ authorizationUrl: initialized.authorization_url, reference, paymentId: payment.id })
    } catch (error) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }).catch(() => undefined)
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to initialize Paystack payment'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') ? 403 : 400 })
  }
}
