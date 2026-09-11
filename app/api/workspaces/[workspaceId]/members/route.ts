import { NextResponse } from 'next/server'
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'] as WorkspaceRole[])
    const members = await prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true, email: true, image: true, suspendedAt: true } } }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ members })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load members'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user, membership: actorMembership } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN'] as WorkspaceRole[])
    const body = await request.json().catch(() => null)
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const role = typeof body?.role === 'string' ? body.role as WorkspaceRole : null
    const status = typeof body?.status === 'string' ? body.status as WorkspaceMemberStatus : null
    if (!userId || (!role && !status)) return NextResponse.json({ error: 'userId and a role or status are required' }, { status: 400 })
    if (role && !Object.values(WorkspaceRole).includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    if (status && !Object.values(WorkspaceMemberStatus).includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (target.userId === user.id) return NextResponse.json({ error: 'You cannot modify your own membership here' }, { status: 409 })
    if (target.role === 'SUPER_ADMIN' && actorMembership.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Only a super admin can modify another super admin' }, { status: 403 })
    if (role === 'SUPER_ADMIN' && actorMembership.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Only a super admin can grant super-admin role' }, { status: 403 })

    const updated = await prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.update({ where: { id: target.id }, data: { ...(role ? { role } : {}), ...(status ? { status } : {}) } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'workspace.member_updated', entity: 'WorkspaceMember', entityId: target.id, result: 'SUCCESS', metadata: { userId, ...(role ? { role } : {}), ...(status ? { status } : {}) } } })
      return member
    })
    return NextResponse.json({ member: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update member'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
