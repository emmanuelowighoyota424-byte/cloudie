import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

type RouteContext = { params: Promise<{ path: string[] }> }

type Body = Record<string, unknown>

async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Prisma.InputJsonValue = {},
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      result: 'SUCCESS',
      metadata,
    },
  })
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    await requireSuperAdmin()
    const { path } = await params
    const [resource, id] = path
    const q = new URL(req.url).searchParams.get('q') ?? ''

    if (resource === 'users') {
      if (id) {
        const item = await prisma.user.findUnique({
          where: { id },
          include: {
            pointLedger: { orderBy: { createdAt: 'desc' }, take: 100 },
            shipmentsCreated: { orderBy: { createdAt: 'desc' }, take: 25 },
            orders: { orderBy: { createdAt: 'desc' }, take: 25 },
            auditActorLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
          },
        })
        return item ? json(item) : json({ error: 'USER_NOT_FOUND' }, 404)
      }

      const items = await prisma.user.findMany({
        where: q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { id: { contains: q } },
              ],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return json({ items })
    }

    if (resource === 'vendors') {
      const items = await prisma.vendor.findMany({
        where: q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { category: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
        include: {
          workspace: { select: { id: true, name: true } },
          products: { select: { id: true, name: true, active: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return json({ items })
    }

    if (resource === 'shipments') {
      const items = await prisma.shipment.findMany({
        where: q
          ? {
              OR: [
                { trackingId: { contains: q, mode: 'insensitive' } },
                { origin: { contains: q, mode: 'insensitive' } },
                { destination: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
        include: {
          workspace: { select: { id: true, name: true } },
          events: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return json({ items })
    }

    if (resource === 'documents') {
      const items = await prisma.document.findMany({
        where: q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { mimeType: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          updatedAt: true,
          workspaceId: true,
          ownerId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return json({ items })
    }

    if (resource === 'transactions') {
      const items = await prisma.pointLedger.findMany({
        where: q
          ? {
              OR: [
                { userId: { contains: q } },
                { description: { contains: q, mode: 'insensitive' } },
                { reference: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return json({ items })
    }

    if (resource === 'audit') {
      return json({ items: await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) })
    }

    if (resource === 'analytics') {
      const [users, shipments, orders, documents, workspaces, points] = await Promise.all([
        prisma.user.count(),
        prisma.shipment.count(),
        prisma.order.count(),
        prisma.document.count(),
        prisma.workspace.count(),
        prisma.pointLedger.aggregate({ _sum: { amount: true } }),
      ])
      return json({ users, shipments, orders, documents, workspaces, netPoints: points._sum.amount ?? 0 })
    }

    if (resource === 'system-health') {
      const [users, rows] = await Promise.all([
        prisma.user.count(),
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "CloudieJob"
          WHERE "status" = 'FAILED'
        `,
      ])
      const failed = Number(rows[0]?.count ?? 0)
      return json({
        database: { status: 'healthy', checkedAt: new Date().toISOString() },
        application: { status: 'healthy' },
        backgroundJobs: { status: failed ? 'degraded' : 'healthy', failed },
        users,
      })
    }

    return json({ error: 'NOT_FOUND' }, 404)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'FORBIDDEN' }, 403)
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const admin = await requireSuperAdmin()
    const { path } = await params
    const [resource, id, action] = path
    const body = (await req.json().catch(() => ({}))) as Body

    if (resource === 'users' && id && (action === 'credit' || action === 'debit')) {
      const amount = Number(body.amount)
      const reason = String(body.reason ?? '').trim()
      if (!Number.isInteger(amount) || amount <= 0 || reason.length < 3) {
        return json({ error: 'INVALID_INPUT' }, 400)
      }

      const latest = await prisma.pointLedger.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
      })
      const current = latest?.balance ?? 0
      if (action === 'debit' && current < amount) {
        return json({ error: 'INSUFFICIENT_POINTS' }, 400)
      }

      const entry = await prisma.$transaction(
        async (tx) => {
          const saved = await tx.pointLedger.create({
            data: {
              userId: id,
              amount: action === 'credit' ? amount : -amount,
              balance: current + (action === 'credit' ? amount : -amount),
              description: reason,
              reference: typeof body.reference === 'string' ? body.reference : null,
            },
          })
          await tx.auditLog.create({
            data: {
              actorId: admin.id,
              userId: id,
              action: action === 'credit' ? 'POINTS_CREDITED' : 'POINTS_DEDUCTED',
              entity: 'User',
              entityId: id,
              metadata: { amount, reason },
              result: 'SUCCESS',
            },
          })
          return saved
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      return json({ ok: true, entry })
    }

    if (resource === 'vendors' && id && ['approve', 'reject', 'suspend', 'reactivate'].includes(action ?? '')) {
      const status = ({
        approve: 'APPROVED',
        reject: 'REJECTED',
        suspend: 'SUSPENDED',
        reactivate: 'APPROVED',
      } as Record<string, string>)[action!]
      const vendor = await prisma.vendor.update({ where: { id }, data: { status } })
      await audit(admin.id, `VENDOR_${action!.toUpperCase()}`, 'Vendor', id, {
        reason: body.reason ?? null,
      })
      return json({ ok: true, vendor })
    }

    if (resource === 'tenants' && id && (action === 'lock' || action === 'unlock')) {
      const locked = action === 'lock'
      if (locked) {
        await prisma.$executeRaw`
          INSERT INTO "TenantProfile" ("id", "workspaceId", "lockedAt")
          VALUES (${crypto.randomUUID()}, ${id}, CURRENT_TIMESTAMP)
          ON CONFLICT ("workspaceId") DO UPDATE
          SET "lockedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        `
      } else {
        await prisma.$executeRaw`
          UPDATE "TenantProfile"
          SET "lockedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "workspaceId" = ${id}
        `
      }
      await audit(admin.id, locked ? 'TENANT_SITE_LOCKED' : 'TENANT_SITE_UNLOCKED', 'TenantProfile', id)
      return json({ ok: true, locked })
    }

    return json({ error: 'NOT_FOUND' }, 404)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'OPERATION_FAILED' }, 400)
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const admin = await requireSuperAdmin()
    const { path } = await params
    const [resource, id] = path
    const body = (await req.json().catch(() => ({}))) as Body

    if (resource === 'users' && id) {
      const data: { suspendedAt?: Date | null; role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN' } = {}
      if (body.status === 'SUSPENDED') data.suspendedAt = new Date()
      if (body.status === 'ACTIVE') data.suspendedAt = null
      if (['USER', 'ADMIN', 'SUPER_ADMIN'].includes(String(body.role))) {
        data.role = body.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'
      }

      const user = await prisma.user.update({ where: { id }, data })
      await audit(
        admin.id,
        body.status === 'SUSPENDED'
          ? 'USER_SUSPENDED'
          : body.status === 'ACTIVE'
            ? 'USER_REACTIVATED'
            : 'USER_ROLE_CHANGED',
        'User',
        id,
        { status: body.status ?? null, role: body.role ?? null },
      )
      return json({ ok: true, user })
    }

    return json({ error: 'NOT_FOUND' }, 404)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'OPERATION_FAILED' }, 400)
  }
}
