import { requireUser } from '@/lib/authorization'
import { getPointBalance } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import { ShipmentsWorkspace } from '../ShipmentsWorkspace'

export const dynamic = 'force-dynamic'

export default async function CustomerShipmentCreatePage() {
  const user = await requireUser()
  const [points, memberships] = await Promise.all([
    getPointBalance(user.id),
    prisma.workspaceMember.findMany({
      where: { userId: user.id, status: 'ACTIVE', role: 'CUSTOMER' },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return <ShipmentsWorkspace
    points={points}
    workspaces={memberships.map(m => ({ id: m.workspaceId, name: m.workspace.name, role: m.role }))}
  />
}
