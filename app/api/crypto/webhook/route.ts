import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCryptoProvider } from '@/lib/crypto/provider'

export async function POST(request: Request) {
  const configured = process.env.CRYPTO_WEBHOOK_SECRET
  const supplied = request.headers.get('x-cloudie-crypto-secret')
  if (!configured || !supplied || supplied !== configured) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const normalized = getCryptoProvider().normalizeWebhook(payload)
  if (!normalized) return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  const event = await prisma.webhookEvent.upsert({ where: { provider_eventId: { provider: 'crypto', eventId: normalized.eventId } }, create: { provider: 'crypto', eventId: normalized.eventId, payload: payload as object }, update: {} })
  if (event.processedAt) return NextResponse.json({ ok: true, duplicate: true })
  if (!normalized.txHash && !normalized.reference) return NextResponse.json({ error: 'Webhook lacks verification reference' }, { status: 400 })
  try {
    const deposit = normalized.reference ? (await prisma.$queryRaw<Array<{ id: string; asset: string; network: string; expectedAmount: string | null; status: string }>>(Prisma.sql`SELECT "id","asset","network","expectedAmount","status" FROM "CryptoDeposit" WHERE "providerReference"=${normalized.reference} LIMIT 1`))[0] : (await prisma.$queryRaw<Array<{ id: string; asset: string; network: string; expectedAmount: string | null; status: string }>>(Prisma.sql`SELECT "id","asset","network","expectedAmount","status" FROM "CryptoDeposit" WHERE "txHash"=${normalized.txHash} LIMIT 1`))[0]
    if (!deposit) throw new Error('Deposit not found')
    const verified = await getCryptoProvider().verifyTransaction({ txHash: normalized.txHash ?? '', asset: deposit.asset, network: deposit.network, expectedAmount: deposit.expectedAmount ?? undefined })
    const status = ['CONFIRMED','CONFIRMING','DETECTED','FAILED','REJECTED'].includes(verified.status) ? verified.status : 'PENDING'
    await prisma.$executeRaw(Prisma.sql`UPDATE "CryptoDeposit" SET "status"=${status},"txHash"=${verified.txHash},"confirmations"=${verified.confirmations ?? 0},"updatedAt"=CURRENT_TIMESTAMP,"confirmedAt"=CASE WHEN ${status}='CONFIRMED' THEN CURRENT_TIMESTAMP ELSE "confirmedAt" END WHERE "id"=${deposit.id}`)
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('crypto webhook processing failed', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
