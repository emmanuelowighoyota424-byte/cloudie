import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const roles = ['USER', 'ADMIN', 'SUPER_ADMIN'] as const

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdmin(); const { id } = await params
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = typeof body?.action === 'string' ? body.action : ''
    if (!['suspend','reactivate','role','points'].includes(action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
    if (actor.id === id && (action === 'suspend' || (action === 'role' && body?.role !== 'SUPER_ADMIN'))) return NextResponse.json({ error: 'You cannot remove your own super-admin access or suspend your own account.' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } }); if (!user) throw new Error('User not found')
      if (action === 'suspend') {
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''; if (reason.length < 3 || reason.length > 500) throw new Error('A valid suspension reason is required.')
        await tx.user.update({ where: { id }, data: { suspendedAt: new Date() } }); await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: 'USER_SUSPENDED', entity: 'User', entityId: id, metadata: { reason } } }); return { status: 'suspended' }
      }
      if (action === 'reactivate') { await tx.user.update({ where: { id }, data: { suspendedAt: null } }); await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: 'USER_REACTIVATED', entity: 'User', entityId: id } }); return { status: 'active' } }
      if (action === 'role') {
        const role = typeof body?.role === 'string' ? body.role : ''; if (!roles.includes(role as typeof roles[number])) throw new Error('Invalid role.')
        if (user.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN' && await tx.user.count({ where: { role: 'SUPER_ADMIN', suspendedAt: null } }) <= 1) throw new Error('At least one active super-admin must remain.')
        await tx.user.update({ where: { id }, data: { role: role as typeof roles[number] } }); await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: 'USER_ROLE_CHANGED', entity: 'User', entityId: id, metadata: { from: user.role, to: role } } }); return { role }
      }
      const amount = body?.amount; const description = typeof body?.description === 'string' ? body.description.trim() : ''; const reference = typeof body?.reference === 'string' ? body.reference.trim() : undefined
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0 || description.length < 3 || description.length > 500) throw new Error('Valid point amount and description are required.')
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`
      const latest = await tx.pointLedger.findFirst({ where: { userId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { balance: true } }); const previousBalance = latest?.balance ?? 0; const nextBalance = previousBalance + amount
      if (nextBalance < 0) throw new Error('Insufficient point balance.')
      const entry = await tx.pointLedger.create({ data: { userId: id, amount, balance: nextBalance, description, reference: reference || `ADMIN-${Date.now()}` } })
      await tx.auditLog.create({ data: { actorId: actor.id, userId: id, action: amount > 0 ? 'POINTS_CREDITED' : 'POINTS_DEBITED', entity: 'PointLedger', entityId: entry.id, metadata: { amount, previousBalance, nextBalance, description, reference: reference ?? null } } }); return { balance: nextBalance, entryId: entry.id }
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed.'; const status = message === 'User not found' ? 404 : message.includes('required') || message.includes('super-admin') || message.includes('Insufficient') || message.includes('cannot') || message.includes('Invalid') ? 400 : 500; return NextResponse.json({ error: message }, { status })
  }
}
