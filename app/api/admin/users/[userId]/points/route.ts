import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { creditPoints, debitPoints } from '@/lib/points'

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireSuperAdmin()
    const { userId } = await context.params
    const body = await request.json().catch(() => null)
    const amount = Number(body?.amount)
    const operation = body?.operation === 'DEBIT' ? 'DEBIT' : body?.operation === 'CREDIT' ? 'CREDIT' : null
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const reference = typeof body?.reference === 'string' && body.reference.trim()
      ? body.reference.trim()
      : `admin:${actor.id}:${userId}:${crypto.randomUUID()}`

    if (!operation) return NextResponse.json({ error: 'operation must be CREDIT or DEBIT' }, { status: 400 })
    if (!Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ error: 'amount must be a positive integer' }, { status: 400 })
    if (reason.length < 3) return NextResponse.json({ error: 'A reason is required for every admin point adjustment' }, { status: 400 })

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const entry = operation === 'CREDIT'
      ? await creditPoints({ userId, amount, description: `Admin credit: ${reason}`, reference })
      : await debitPoints({ userId, amount, description: `Admin debit: ${reason}`, reference })

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        userId,
        action: `POINTS_${operation}`,
        entity: 'PointLedger',
        entityId: entry.id,
        result: 'SUCCESS',
        metadata: { amount, reason, reference, idempotent: entry.idempotent },
      },
    })

    return NextResponse.json({ success: true, entry })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to adjust points'
    const status = message === 'Insufficient points' ? 409 : message.includes('Authentication') || message.includes('Super-admin') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
