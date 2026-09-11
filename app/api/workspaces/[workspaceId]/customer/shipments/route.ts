import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, 'CUSTOMER')
    const customer = await prisma.customer.findFirst({ where: { workspaceId, email: { equals: user.email, mode: 'insensitive' } }, select: { id: true } })
    if (!customer) return NextResponse.json({ shipments: [] })
    const shipments = await prisma.shipment.findMany({ where: { workspaceId, customerId: customer.id }, include: { events: { orderBy: { createdAt: 'desc' }, take: 50 }, proofOfDelivery: true, documents: { select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 })
    return NextResponse.json({ shipments: shipments.map((s) => ({ ...s, documents: s.documents.map((d) => ({ ...d, sizeBytes: d.sizeBytes.toString() })) })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load customer shipments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
