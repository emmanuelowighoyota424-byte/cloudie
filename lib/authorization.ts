import { headers } from 'next/headers'
import { WorkspaceRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Permission, roleHasPermission } from '@/lib/permissions'

export class AuthorizationError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new AuthorizationError('Authentication required')

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) throw new AuthorizationError('Authentication required')
  if (user.suspendedAt) throw new AuthorizationError('Account suspended')
  return user
}

export async function requireWorkspaceMember(workspaceId: string) {
  const user = await requireUser()
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  })
  if (!membership || membership.status !== 'ACTIVE') throw new AuthorizationError('Workspace access denied')
  return { user, membership }
}

export async function requireWorkspaceRole(workspaceId: string, roles: WorkspaceRole | WorkspaceRole[]) {
  const { user, membership } = await requireWorkspaceMember(workspaceId)
  const allowed = Array.isArray(roles) ? roles : [roles]
  if (!allowed.includes(membership.role)) throw new AuthorizationError('Insufficient workspace permissions')
  return { user, membership }
}

export async function requirePermission(workspaceId: string, permission: Permission) {
  const { user, membership } = await requireWorkspaceMember(workspaceId)
  if (!roleHasPermission(membership.role, permission)) throw new AuthorizationError('Insufficient workspace permissions')
  return { user, membership }
}

export async function requireSuperAdmin() {
  const user = await requireUser()
  if (user.role !== 'SUPER_ADMIN') throw new AuthorizationError('Super-admin access required')
  return user
}
