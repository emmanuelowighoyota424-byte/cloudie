import { Plan } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type Entitlement = 'users' | 'shipments' | 'documents' | 'products' | 'orders'

const limits: Record<Plan, Record<Entitlement, number>> = {
  FREE: { users: 3, shipments: 50, documents: 25, products: 25, orders: 50 },
  STARTER: { users: 10, shipments: 500, documents: 250, products: 250, orders: 500 },
  BUSINESS: { users: 50, shipments: 5000, documents: 2500, products: 2500, orders: 5000 },
  ENTERPRISE: { users: Number.MAX_SAFE_INTEGER, shipments: Number.MAX_SAFE_INTEGER, documents: Number.MAX_SAFE_INTEGER, products: Number.MAX_SAFE_INTEGER, orders: Number.MAX_SAFE_INTEGER },
}

export async function requireEntitlement(workspaceId: string, entitlement: Entitlement) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } })
  if (!workspace) throw new Error('Workspace not found')

  const limit = limits[workspace.plan][entitlement]
  const count = entitlement === 'users'
    ? await prisma.workspaceMember.count({ where: { workspaceId, status: 'ACTIVE' } })
    : entitlement === 'shipments'
      ? await prisma.shipment.count({ where: { workspaceId } })
      : entitlement === 'documents'
        ? await prisma.document.count({ where: { workspaceId } })
        : entitlement === 'products'
          ? await prisma.product.count({ where: { workspaceId } })
          : await prisma.order.count({ where: { workspaceId } })

  if (count >= limit) throw new Error(`${entitlement} limit reached for the ${workspace.plan} plan`)
  return { plan: workspace.plan, count, limit }
}
