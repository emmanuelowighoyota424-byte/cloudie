import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(_: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireUser()
    const { token } = await context.params
    if (!token || token.length < 20) return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 })

    const invitation = await prisma.workspaceInvitation.findUnique({ where: { tokenHash: hashToken(token) } })
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    if (invitation.status !== 'PENDING') return NextResponse.json({ error: 'Invitation is no longer active' }, { status: 409 })
    if (invitation.expiresAt <= new Date()) {
      await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
      return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) return NextResponse.json({ error: 'Invitation email does not match the signed-in account' }, { status: 403 })

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date()
      const claimed = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'ACCEPTED', acceptedById: user.id, acceptedAt: now },
      })
      if (claimed.count !== 1) throw new Error('Invitation is no longer active')

      const membership = await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
        create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role },
        update: { status: 'ACTIVE', role: invitation.role },
      })
      await tx.auditLog.create({
        data: { actorId: user.id, userId: user.id, workspaceId: invitation.workspaceId, action: 'workspace.invitation_accepted', entity: 'WorkspaceInvitation', entityId: invitation.id, result: 'SUCCESS' },
      })
      return membership
    })

    return NextResponse.json({ membership: { id: result.id, workspaceId: result.workspaceId, role: result.role } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to accept invitation'
    const status = message.includes('Authentication') ? 401 : message.includes('no longer active') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
