import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceMember } from '@/lib/authorization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.session?.id || !session.user?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : null
    if (workspaceId) await requireWorkspaceMember(workspaceId)

    const raw = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    const tokenHash = createHash('sha256').update(raw).digest('hex')
    await prisma.$executeRaw`
      INSERT INTO "RealtimeTicket"("id","tokenHash","sessionId","userId","workspaceId","expiresAt")
      VALUES (${randomUUID()},${tokenHash},${session.session.id},${session.user.id},${workspaceId},CURRENT_TIMESTAMP + INTERVAL '60 seconds')
    `
    return NextResponse.json({ ticket: raw, expiresIn: 60 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create realtime ticket'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
