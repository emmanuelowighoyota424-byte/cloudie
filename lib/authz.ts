import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { WorkspaceRole } from '@prisma/client'

export class AuthorizationError extends Error {
  status = 403
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new AuthorizationError('Authentication required')
  if ((session.user as { suspendedAt?: Date | null }).suspendedAt) throw new AuthorizationError('Account suspended')
  return session.user
}

export async function requireWorkspaceMember(workspaceId: string) {
  const user = await requireUser()
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  })
  if (!membership || membership.status !== 'ACTIVE') throw new AuthorizationError('Workspace access denied')
  return { user, membership }
}

export async function requireWorkspaceRole(workspaceId: string, roles: WorkspaceRole[]) {
  const result = await requireWorkspaceMember(workspaceId)
  if (!roles.includes(result.membership.role)) throw new AuthorizationError('Insufficient workspace role')
  return result
}

export async function requireSuperAdmin() {
  const user = await requireUser()
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  if (dbUser?.role !== 'SUPER_ADMIN') throw new AuthorizationError('Super admin access required')
  return user
}

export function isWorkspaceAdmin(role: WorkspaceRole) {
  return role === 'SUPER_ADMIN' || role === 'WORKSPACE_ADMIN'
}
