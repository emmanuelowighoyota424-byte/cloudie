import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const user = await requireUser()
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { status: true } })
    if (!membership || membership.status !== 'ACTIVE') return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const notifications = await prisma.notification.findMany({ where: { workspaceId, userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ notifications, unread: notifications.filter((n) => !n.readAt).length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load notifications'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const user = await requireUser()
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { status: true } })
    if (!membership || membership.status !== 'ACTIVE') return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : null
    if (!id) return NextResponse.json({ error: 'notification id is required' }, { status: 400 })
    const result = await prisma.notification.updateMany({ where: { id, workspaceId, userId: user.id, readAt: null }, data: { readAt: new Date() } })
    return NextResponse.json({ read: result.count === 1 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update notification'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
