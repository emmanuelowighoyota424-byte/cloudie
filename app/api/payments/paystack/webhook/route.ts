import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { reconcilePaystackPayment, validPaystackSignature, verifyPaystackTransaction } from '@/lib/paystack'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-paystack-signature')
  if (!signature) return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
  try {
    if (!validPaystackSignature(raw, signature)) return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 })
  }

  let payload: { event?: string; data?: { id?: number; reference?: string } }
  try { payload = JSON.parse(raw) as typeof payload } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const event = typeof payload.event === 'string' ? payload.event : ''
  const transactionId = typeof payload.data?.id === 'number' ? String(payload.data.id) : ''
  const reference = typeof payload.data?.reference === 'string' ? payload.data.reference.trim() : ''
  const eventId = transactionId ? `${event}:${transactionId}` : `${event}:${reference}`
  if (!event || !eventId) return NextResponse.json({ error: 'Invalid webhook event' }, { status: 400 })

  const webhook = await prisma.webhookEvent.create({ data: { provider: 'paystack', eventId, payload: payload as Prisma.InputJsonValue } }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
    throw error
  })
  if (!webhook) return NextResponse.json({ received: true, duplicate: true })

  try {
    if (event === 'charge.success') {
      if (!reference) throw new Error('Paystack success event has no reference')
      const payment = await prisma.payment.findFirst({ where: { provider: 'paystack', providerReference: reference }, include: { order: true } })
      if (!payment) throw new Error('Cloudie payment not found')
      const verified = await verifyPaystackTransaction(reference)
      await reconcilePaystackPayment(payment.id, verified)
    }
    await prisma.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } })
    return NextResponse.json({ received: true })
  } catch (error) {
    await prisma.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: null } }).catch(() => undefined)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook processing failed' }, { status: 400 })
  }
}
