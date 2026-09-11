import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'

const inviteRoles: WorkspaceRole[] = ['MANAGER', 'STAFF', 'DRIVER', 'WAREHOUSE_STAFF', 'CUSTOMER', 'VENDOR']
function hashToken(token: string) { return createHash('sha256').update(token).digest('hex') }

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN'] as WorkspaceRole[])
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = typeof body?.role === 'string' ? body.role as WorkspaceRole : 'STAFF'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    if (!inviteRoles.includes(role)) return NextResponse.json({ error: 'Invalid invitation role' }, { status: 400 })
    const existingMember = await prisma.workspaceMember.findFirst({ where: { workspaceId, user: { email } }, select: { id: true } })
    if (existingMember) return NextResponse.json({ error: 'User is already a workspace member' }, { status: 409 })
    await prisma.workspaceInvitation.updateMany({ where: { workspaceId, email, status: 'PENDING' }, data: { status: 'REVOKED', revokedAt: new Date() } })
    const token = randomBytes(32).toString('base64url')
    const invitation = await prisma.workspaceInvitation.create({ data: { id: crypto.randomUUID(), workspaceId, email, role, tokenHash: hashToken(token), invitedById: user.id, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 72) }, select: { id: true, email: true, role: true, expiresAt: true } })
    await prisma.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'workspace.invitation_created', entity: 'WorkspaceInvitation', entityId: invitation.id, result: 'SUCCESS' } })
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000'
    return NextResponse.json({ invitation, acceptUrl: `${baseUrl}/invite/${token}` }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create invitation'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
