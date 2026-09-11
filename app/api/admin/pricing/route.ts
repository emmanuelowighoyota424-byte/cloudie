import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { setPointPricing } from '@/lib/point-pricing'

export async function GET() {
  try {
    await requireSuperAdmin()
    const rules = await prisma.$queryRaw(Prisma.sql`SELECT * FROM "PointPricingRule" ORDER BY "action" ASC, "effectiveFrom" DESC LIMIT 500`)
    return NextResponse.json({ rules })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load pricing'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = typeof body?.action === 'string' ? body.action.trim() : ''
    const pointCost = Number(body?.pointCost)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : undefined
    const enabled = body?.enabled !== false
    if (!action || !Number.isInteger(pointCost) || pointCost < 0 || !reason) return NextResponse.json({ error: 'action, non-negative integer pointCost and reason are required' }, { status: 400 })
    if (workspaceId && !(await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }))) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    const id = await setPointPricing({ workspaceId, action, pointCost, enabled, reason, createdById: user.id })
    await prisma.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'points.pricing_changed', entity: 'PointPricingRule', entityId: id, metadata: { action, pointCost, enabled, reason } } })
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update pricing'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
