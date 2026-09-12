import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const PAYSTACK_API = 'https://api.paystack.co'

export type PaystackTransaction = { id: number; status: string; reference: string; amount: number; currency: string; paid_at?: string | null; gateway_response?: string | null; authorization?: Record<string, unknown> | null }

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim()
  if (!key) throw new Error('Paystack secret key is not configured')
  return key
}

export function getPaystackCallbackUrl() {
  const configured = process.env.PAYSTACK_CALLBACK_URL?.trim()
  if (configured) return configured
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (!base) throw new Error('PAYSTACK_CALLBACK_URL is not configured')
  return `${base.startsWith('http') ? base : `https://${base}`}/payments/paystack/callback`
}

export function createCloudiePaymentReference() { return `CLD-${Date.now().toString(36).toUpperCase()}-${randomBytes(8).toString('hex').toUpperCase()}` }

export function paystackAmount(decimal: Prisma.Decimal, currency: string) {
  const normalized = currency.toUpperCase()
  const minorUnits: Record<string, number> = { NGN: 100, USD: 100, GHS: 100, ZAR: 100, KES: 100, XOF: 1, XAF: 1 }
  const multiplier = minorUnits[normalized]
  if (!multiplier) throw new Error(`Unsupported Paystack currency: ${normalized}`)
  const minor = decimal.mul(multiplier)
  if (!minor.isInteger() || minor.lte(0)) throw new Error('Payment amount must be a positive valid currency amount')
  const value = Number(minor.toString())
  if (!Number.isSafeInteger(value)) throw new Error('Payment amount is too large')
  return value
}

export function validPaystackSignature(raw: string, signature: string, secret = secretKey()) {
  const expected = createHmac('sha512', secret).update(raw).digest('hex')
  const a = Buffer.from(signature.trim(), 'utf8'); const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

async function paystackRequest<T>(path: string, init: RequestInit) {
  const response = await fetch(`${PAYSTACK_API}${path}`, { ...init, headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, cache: 'no-store' })
  const body = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null
  if (!response.ok || !body?.status) throw new Error(body?.message || `Paystack request failed (${response.status})`)
  return body.data as T
}

export async function initializePaystackTransaction(input: { email: string; amount: number; currency: string; reference: string; callback_url: string; metadata: Record<string, string> }) {
  return paystackRequest<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', { method: 'POST', body: JSON.stringify(input) })
}

export async function verifyPaystackTransaction(reference: string) { return paystackRequest<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' }) }

export async function reconcilePaystackPayment(paymentId: string, verified: PaystackTransaction) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } })
    if (!payment) throw new Error('Payment not found')
    const expectedMinor = paystackAmount(payment.amount, payment.currency)
    if (verified.reference !== payment.providerReference) throw new Error('Paystack reference mismatch')
    if (verified.amount !== expectedMinor) throw new Error('Paystack amount mismatch')
    if (verified.currency.toUpperCase() !== payment.currency.toUpperCase()) throw new Error('Paystack currency mismatch')
    const normalized = verified.status.toLowerCase()
    const status = normalized === 'success' ? 'PAID' : normalized === 'abandoned' ? 'ABANDONED' : 'FAILED'

    // The conditional update is the idempotency gate. Under concurrent webhook/callback
    // replay, exactly one transaction owns the state transition and emits the audit event.
    const transitioned = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: status } },
      data: { status, verifiedAt: new Date() },
    })

    if (transitioned.count === 0) {
      const current = await tx.payment.findUnique({ where: { id: payment.id } })
      return { payment: current, orderId: payment.orderId, workspaceId: payment.order.workspaceId, userId: payment.order.userId, duplicate: true }
    }

    if (status === 'PAID') {
      await tx.order.updateMany({ where: { id: payment.orderId, paymentStatus: { not: 'PAID' } }, data: { paymentStatus: 'PAID', status: 'PROCESSING' } })
    }
    await tx.auditLog.create({ data: { userId: payment.order.userId ?? undefined, workspaceId: payment.order.workspaceId, action: `payment.paystack.${status.toLowerCase()}`, entity: 'Payment', entityId: payment.id, metadata: { provider: 'paystack', reference: payment.providerReference, transactionId: verified.id, gatewayResponse: verified.gateway_response || null } } })
    const updated = await tx.payment.findUnique({ where: { id: payment.id } })
    return { payment: updated, orderId: payment.orderId, workspaceId: payment.order.workspaceId, userId: payment.order.userId, duplicate: false }
  })
}
