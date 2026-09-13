import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('role'), role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']) }),
  z.object({ action: z.literal('points'), amount: z.number().int().refine((v) => v !== 0), description: z.string().trim().min(3).max(500), reference: z.string().trim().max(120).optional() }),
])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdmin()
    const { id } = await params
    const body = actionSchema.parse(await request.json())

    if (actor.id === id && (body.action === 'suspend' || (body.action === 'role' && body.role !== 'SUPER_ADMIN'))) {
      return NextResponse.json({ error: 'You cannot remove your own super-admin access or suspend your own account.' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, suspendedAt: true } })
      if (!user) throw new Error('User not found')

      if (body.action === 'suspend') {
        await tx.user.update({ where: { id }, data: { suspendedAt: new Date() } })
        await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: 'USER_SUSPENDED', entity: 'User', entityId: id, metadata: { reason: body.reason } } })
        return { status: 'suspended' }
      }

      if (body.action === 'reactivate') {
        await tx.user.update({ where: { id }, data: { suspendedAt: null } })
        await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: 'USER_REACTIVATED', entity: 'User', entityId: id } })
        return { status: 'active' }
      }

      if (body.action === 'role') {
        if (user.role === 'SUPER_ADMIN' && body.role !== 'SUPER_ADMIN') {
          const count = await tx.user.count({ where: { role: 'SUPER_ADMIN', suspendedAt: null } })
          if (count <= 1) throw new Error('At least one active super-admin must remain.')
        }
        await tx.user.update({ where: { id }, data: { role: body.role } })
        await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: 'USER_ROLE_CHANGED', entity: 'User', entityId: id, metadata: { from: user.role, to: body.role } } })
        return { role: body.role }
      }

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`
      const latest = await tx.pointLedger.findFirst({ where: { userId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { balance: true } })
      const previousBalance = latest?.balance ?? 0
      const nextBalance = previousBalance + body.amount
      if (nextBalance < 0) throw new Error('Insufficient point balance.')
      const entry = await tx.pointLedger.create({ data: { userId: id, amount: body.amount, balance: nextBalance, description: body.description, reference: body.reference || `ADMIN-${Date.now()}` } })
      await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: body.amount > 0 ? 'POINTS_CREDITED' : 'POINTS_DEBITED', entity: 'PointLedger', entityId: entry.id, metadata: { amount: body.amount, previousBalance, nextBalance, description: body.description, reference: body.reference ?? null } } })
      return { balance: nextBalance, entryId: entry.id }
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof z.ZodError ? 'Invalid request.' : error instanceof Error ? error.message : 'Operation failed.'
    const status = message === 'User not found' ? 404 : message.includes('super-admin') || message.includes('Insufficient') || message.includes('cannot') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
