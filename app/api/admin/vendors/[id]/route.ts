import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const schema = z.object({ action: z.enum(['approve', 'reject', 'suspend', 'reactivate']), reason: z.string().trim().max(500).optional() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSuperAdmin()
    const { id } = await params
    const body = schema.parse(await request.json())
    if ((body.action === 'reject' || body.action === 'suspend') && !body.reason) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })
    const vendor = await prisma.vendor.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!vendor) return NextResponse.json({ error: 'Vendor not found.' }, { status: 404 })
    const status = body.action === 'approve' ? 'APPROVED' : body.action === 'reactivate' ? 'AVAILABLE' : body.action === 'suspend' ? 'SUSPENDED' : 'REJECTED'
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id }, data: { status } })
      await tx.auditLog.create({ data: { actorId: actor.id, action: `VENDOR_${body.action.toUpperCase()}`, entity: 'Vendor', entityId: id, workspaceId: (await tx.vendor.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId, metadata: { from: vendor.status, to: status, reason: body.reason ?? null } } })
    })
    return NextResponse.json({ ok: true, status })
  } catch (error) {
    const message = error instanceof z.ZodError ? 'Invalid request.' : error instanceof Error ? error.message : 'Operation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
