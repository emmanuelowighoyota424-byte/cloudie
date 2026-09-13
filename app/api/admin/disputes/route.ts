import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireSuperAdmin()
    const items = await prisma.$queryRaw(Prisma.sql`SELECT d."id",d."orderId",d."workspaceId",d."reason",d."description",d."status",d."resolution",d."createdAt",d."updatedAt",u."email" AS "openedByEmail",o."status" AS "orderStatus",o."paymentStatus",o."total" FROM "MarketplaceDispute" d JOIN "User" u ON u."id"=d."openedById" JOIN "Order" o ON o."id"=d."orderId" ORDER BY d."createdAt" DESC LIMIT 200`)
    return NextResponse.json({ items })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load disputes' }, { status: 403 }) }
}

export async function POST(request: Request) {
  try {
    const actor = await requireSuperAdmin()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const disputeId = typeof body?.disputeId === 'string' ? body.disputeId : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    const resolution = typeof body?.resolution === 'string' ? body.resolution.trim() : ''
    if (!disputeId || !['resolve','refund'].includes(action) || !resolution) return NextResponse.json({ error: 'disputeId, action and resolution are required.' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id:string; status:string; orderId:string; workspaceId:string }>>(Prisma.sql`SELECT "id","status","orderId","workspaceId" FROM "MarketplaceDispute" WHERE "id"=${disputeId} FOR UPDATE`)
      const dispute = rows[0]
      if (!dispute) throw new Error('Dispute not found')
      if (!['OPEN','UNDER_REVIEW'].includes(dispute.status)) throw new Error('Dispute is already resolved')
      await tx.$executeRaw(Prisma.sql`UPDATE "MarketplaceDispute" SET "status"='RESOLVED',"resolution"=${resolution},"resolvedById"=${actor.id},"resolvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${disputeId}`)
      if (action === 'refund') await tx.order.update({ where: { id: dispute.orderId }, data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' } })
      await tx.auditLog.create({ data: { actorId: actor.id, workspaceId: dispute.workspaceId, action: action === 'refund' ? 'DISPUTE_REFUND_APPROVED' : 'DISPUTE_RESOLVED', entity: 'MarketplaceDispute', entityId: disputeId, metadata: { resolution, orderId: dispute.orderId, refund: action === 'refund' } } })
      return { status: 'RESOLVED', refund: action === 'refund' }
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) { const message = error instanceof Error ? error.message : 'Resolution failed'; return NextResponse.json({ error: message }, { status: message === 'Dispute not found' ? 404 : 400 }) }
}
