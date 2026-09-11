import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  try {
    const { user } = await requireWorkspaceRole(workspaceId, [WorkspaceRole.SUPER_ADMIN, WorkspaceRole.WORKSPACE_ADMIN])
    const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = typeof body?.role === 'string' && Object.values(WorkspaceRole).includes(body.role as WorkspaceRole)
      ? body.role as WorkspaceRole
      : WorkspaceRole.STAFF

    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    if (role === WorkspaceRole.SUPER_ADMIN) return NextResponse.json({ error: 'SUPER_ADMIN cannot be granted by invitation' }, { status: 400 })

    const existingMember = await prisma.workspaceMember.findFirst({ where: { workspaceId, user: { email } } })
    if (existingMember) return NextResponse.json({ error: 'User is already a workspace member' }, { status: 409 })

    const pending = await prisma.workspaceInvitation.findFirst({ where: { workspaceId, email, status: 'PENDING', expiresAt: { gt: new Date() } } })
    if (pending) return NextResponse.json({ error: 'A pending invitation already exists' }, { status: 409 })

    const token = randomBytes(32).toString('base64url')
    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: user.id,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    })

    await prisma.auditLog.create({
      data: { actorId: user.id, workspaceId, action: 'workspace.invitation.created', entity: 'WorkspaceInvitation', entityId: invitation.id, result: 'SUCCESS' },
    })

    const origin = process.env.BETTER_AUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || request.headers.get('origin') || ''
    const base = origin.startsWith('http') ? origin : origin ? `https://${origin}` : ''
    return NextResponse.json({ invitation, acceptUrl: base ? `${base}/invite/${token}` : undefined }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create invitation'
    const status = message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
