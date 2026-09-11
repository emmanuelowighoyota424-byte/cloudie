import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    await requireSuperAdmin()
    const url = new URL(request.url)
    const status = url.searchParams.get('status')?.trim()
    const workspaceId = url.searchParams.get('workspaceId')?.trim()
    const orderId = url.searchParams.get('orderId')?.trim()
    const customerId = url.searchParams.get('customerId')?.trim()
    const payments = await prisma.payment.findMany({
      where: { ...(status ? { status } : {}), ...(workspaceId ? { order: { workspaceId } } : {}), ...(orderId ? { orderId } : {}), ...(customerId ? { order: { userId: customerId } } : {}) },
      include: { order: { select: { id: true, workspaceId: true, userId: true, total: true, paymentStatus: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    })
    return NextResponse.json({ payments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list payments'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
