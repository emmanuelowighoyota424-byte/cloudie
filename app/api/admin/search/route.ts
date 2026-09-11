import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

export async function GET(request: Request) {
  try {
    await requireSuperAdmin()
    const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) || ''
    if (query.length < 2) return NextResponse.json({ users: [], workspaces: [], shipments: [], orders: [] })
    const [users, workspaces, shipments, orders] = await Promise.all([
      prisma.user.findMany({ where: { OR: [{ email: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }] }, select: { id: true, name: true, email: true, role: true, suspendedAt: true }, take: 20 }),
      prisma.workspace.findMany({ where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { slug: { contains: query, mode: 'insensitive' } }] }, select: { id: true, name: true, slug: true, plan: true, subscriptionStatus: true }, take: 20 }),
      prisma.shipment.findMany({ where: { OR: [{ id: query }, { trackingId: { contains: query, mode: 'insensitive' } }] }, select: { id: true, trackingId: true, status: true, workspaceId: true, origin: true, destination: true }, take: 20 }),
      prisma.order.findMany({ where: { id: query }, select: { id: true, status: true, paymentStatus: true, total: true, workspaceId: true }, take: 20 }),
    ])
    return NextResponse.json({ users, workspaces, shipments, orders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to search platform data'
    return NextResponse.json({ error: message }, { status: message.includes('Super-admin') ? 403 : 401 })
  }
}
