import { PrismaClient, UserRole, WorkspaceRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) {
    console.log('No BOOTSTRAP_ADMIN_EMAIL configured; nothing to seed.')
    return
  }

  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Cloudie Administrator'
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.SUPER_ADMIN },
    create: { id: randomUUID(), email, name, role: UserRole.SUPER_ADMIN },
  })

  const slug = `${user.id.slice(-12).toLowerCase()}-workspace`
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    update: { ownerId: user.id },
    create: {
      name: process.env.BOOTSTRAP_WORKSPACE_NAME?.trim() || `${name}'s Workspace`,
      slug,
      ownerId: user.id,
      members: { create: { userId: user.id, role: WorkspaceRole.WORKSPACE_ADMIN } },
      subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
    },
  })

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: WorkspaceRole.WORKSPACE_ADMIN, status: 'ACTIVE' },
    create: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.WORKSPACE_ADMIN },
  })

  console.log(`Bootstrapped administrator workspace: ${workspace.id}`)
}

main().catch((error) => {
  console.error('Seed failed:', error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
