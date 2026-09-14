import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceMember } from '@/lib/authorization'

async function access(workspaceId: string, orderId: string) {
  const { user } = await requireWorkspaceMember(workspaceId)
  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId },
    select: { id: true, userId: true },
  })
  if (!order) throw new Error('Order not found')
  if (order.userId !== user.id) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      select: { role: true, status: true },
    })
    if (!member || member.status !== 'ACTIVE' || !['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF', 'VENDOR'].includes(member.role)) {
      throw new Error('Order access denied')
    }
  }
  return { user, order }
}

async function ensureConversation(workspaceId: string, orderId: string, userId: string, ownerId: string | null) {
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "OrderChatConversation" WHERE "orderId" = ${orderId} LIMIT 1
    `
    const id = existing[0]?.id ?? crypto.randomUUID()
    if (!existing[0]) {
      await tx.$executeRaw`
        INSERT INTO "OrderChatConversation"("id", "orderId", "workspaceId")
        VALUES (${id}, ${orderId}, ${workspaceId})
      `
    }
    await tx.$executeRaw`
      INSERT INTO "OrderChatParticipant"("id", "conversationId", "userId")
      VALUES (${crypto.randomUUID()}, ${id}, ${userId})
      ON CONFLICT ("conversationId", "userId") DO NOTHING
    `
    if (ownerId) {
      await tx.$executeRaw`
        INSERT INTO "OrderChatParticipant"("id", "conversationId", "userId")
        VALUES (${crypto.randomUUID()}, ${id}, ${ownerId})
        ON CONFLICT ("conversationId", "userId") DO NOTHING
      `
    }
    return id
  })
}

type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: Date
}

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; orderId: string }> }) {
  try {
    const { workspaceId, orderId } = await context.params
    const { user, order } = await access(workspaceId, orderId)
    const conversationId = await ensureConversation(workspaceId, orderId, user.id, order.userId)
    const messages = await prisma.$queryRaw<ChatMessage[]>`
      SELECT "id", "conversationId", "senderId", "body", "createdAt"
      FROM "OrderChatMessage"
      WHERE "conversationId" = ${conversationId}
      ORDER BY "createdAt" ASC
      LIMIT 500
    `
    const participant = await prisma.$queryRaw<Array<{ lastReadAt: Date | null }>>`
      SELECT "lastReadAt"
      FROM "OrderChatParticipant"
      WHERE "conversationId" = ${conversationId} AND "userId" = ${user.id}
      LIMIT 1
    `
    const lastReadAt = participant[0]?.lastReadAt ?? null
    const unread = lastReadAt
      ? await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "OrderChatMessage"
          WHERE "conversationId" = ${conversationId}
            AND "senderId" <> ${user.id}
            AND "createdAt" > ${lastReadAt}
        `
      : await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "OrderChatMessage"
          WHERE "conversationId" = ${conversationId}
            AND "senderId" <> ${user.id}
        `
    return NextResponse.json({ conversationId, messages, unread: Number(unread[0]?.count ?? 0) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load order chat'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('denied') ? 403 : 404 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; orderId: string }> }) {
  try {
    const { workspaceId, orderId } = await context.params
    const { user, order } = await access(workspaceId, orderId)
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const text = typeof body?.body === 'string' ? body.body.trim() : ''
    const clientMessageId = typeof body?.clientMessageId === 'string' ? body.clientMessageId.trim() : ''
    if (!text || text.length > 4000) return NextResponse.json({ error: 'Message must contain 1-4000 characters' }, { status: 400 })
    if (!clientMessageId || clientMessageId.length > 128) return NextResponse.json({ error: 'clientMessageId is required' }, { status: 400 })
    const conversationId = await ensureConversation(workspaceId, orderId, user.id, order.userId)
    const rows = await prisma.$queryRaw<ChatMessage[]>`
      INSERT INTO "OrderChatMessage"("id", "conversationId", "senderId", "clientMessageId", "body")
      VALUES (${crypto.randomUUID()}, ${conversationId}, ${user.id}, ${clientMessageId}, ${text})
      ON CONFLICT ("clientMessageId") DO UPDATE SET "body" = "OrderChatMessage"."body"
      RETURNING "id", "conversationId", "senderId", "body", "createdAt"
    `
    return NextResponse.json({ message: rows[0] }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send order chat message'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('denied') ? 403 : 400 })
  }
}

export async function PATCH(_request: Request, context: { params: Promise<{ workspaceId: string; orderId: string }> }) {
  try {
    const { workspaceId, orderId } = await context.params
    const { user, order } = await access(workspaceId, orderId)
    const conversationId = await ensureConversation(workspaceId, orderId, user.id, order.userId)
    await prisma.$executeRaw`
      UPDATE "OrderChatParticipant"
      SET "lastReadAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = ${conversationId} AND "userId" = ${user.id}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to mark chat read'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
