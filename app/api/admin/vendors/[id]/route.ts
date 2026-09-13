import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const actions = ['approve', 'reject', 'suspend', 'reactivate'] as const
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdmin(); const { id } = await params; const body = await request.json().catch(() => null) as Record<string, unknown> | null; const action = typeof body?.action === 'string' ? body.action : ''
    if (!actions.includes(action as typeof actions[number])) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if ((action === 'reject' || action === 'suspend') && !reason) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })
    const vendor = await prisma.vendor.findUnique({ where: { id }, select: { id: true, status: true, workspaceId: true } }); if (!vendor) return NextResponse.json({ error: 'Vendor not found.' }, { status: 404 })
    const status = action === 'approve' ? 'APPROVED' : action === 'reactivate' ? 'AVAILABLE' : action === 'suspend' ? 'SUSPENDED' : 'REJECTED'
    await prisma.$transaction(async tx => { await tx.vendor.update({ where: { id }, data: { status } }); await tx.auditLog.create({ data: { actorId: actor.id, workspaceId: vendor.workspaceId, action: `VENDOR_${action.toUpperCase()}`, entity: 'Vendor', entityId: id, metadata: { from: vendor.status, to: status, reason: reason || null } } }) })
    return NextResponse.json({ ok: true, status })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Operation failed.' }, { status: 500 }) }
}
