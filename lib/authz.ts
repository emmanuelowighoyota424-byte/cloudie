import type { MembershipRole, UserRole } from '@prisma/client'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return user
}

export async function requireWorkspaceMembership(workspaceId: string) {
  const user = await requireUser()
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { id: true, workspaceId: true, userId: true, role: true },
  })

  if (!membership) throw new Error('FORBIDDEN')
  return { user, membership }
}

const roleRank: Record<MembershipRole, number> = {
  VIEWER: 10,
  MEMBER: 20,
  ADMIN: 30,
  OWNER: 40,
}

export async function requireWorkspaceRole(
  workspaceId: string,
  minimumRole: MembershipRole,
) {
  const result = await requireWorkspaceMembership(workspaceId)
  if (roleRank[result.membership.role] < roleRank[minimumRole]) {
    throw new Error('FORBIDDEN')
  }
  return result
}

export async function requireAdmin() {
  const user = await requireUser()
  const role = user.role as UserRole
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') throw new Error('FORBIDDEN')
  return user
}

export function isAuthorizationError(error: unknown) {
  return error instanceof Error && (error.message === 'UNAUTHENTICATED' || error.message === 'FORBIDDEN')
}
