import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'
import { reconcilePaystackPayment, verifyPaystackTransaction } from '@/lib/paystack'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const reference = url.searchParams.get('reference')?.trim() || url.searchParams.get('trxref')?.trim()
  if (!reference) return NextResponse.json({ error: 'Missing Paystack reference' }, { status: 400 })
  try {
    const user = await requireUser()
    const payment = await prisma.payment.findFirst({ where: { provider: 'paystack', providerReference: reference, order: { userId: user.id } }, include: { order: true } })
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    const verified = await verifyPaystackTransaction(reference)
    const result = await reconcilePaystackPayment(payment.id, verified)
    const target = new URL('/dashboard', url.origin)
    target.searchParams.set('payment', result.payment.status.toLowerCase())
    target.searchParams.set('reference', reference)
    return NextResponse.redirect(target)
  } catch (error) {
    const target = new URL('/dashboard', url.origin)
    target.searchParams.set('payment', 'failed')
    target.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 120) : 'verification_failed')
    return NextResponse.redirect(target)
  }
}
