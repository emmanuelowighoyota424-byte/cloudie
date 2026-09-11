import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const statuses = ['PENDING','APPROVED','SUSPENDED','REJECTED']

export async function GET() {
  try {
    await requireSuperAdmin()
    const vendors = await prisma.vendor.findMany({ include: { products: { select: { id: true, name: true, sku: true, stock: true, active: true } }, workspace: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ vendors })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load vendors'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireSuperAdmin()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id : ''
    const status = typeof body?.status === 'string' ? body.status : ''
    if (!id || !statuses.includes(status)) return NextResponse.json({ error: 'Valid vendor id and status required' }, { status: 400 })
    const vendor = await prisma.vendor.findUnique({ where: { id } })
    if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    const updated = await prisma.vendor.update({ where: { id }, data: { status } })
    await prisma.auditLog.create({ data: { actorId: admin.id, workspaceId: vendor.workspaceId, action: 'vendor.status_changed', entity: 'Vendor', entityId: id, metadata: { from: vendor.status, to: status } } })
    return NextResponse.json({ vendor: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update vendor'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
