import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { getPrivateObject } from '@/lib/storage'

export const runtime = 'nodejs'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; renderedId: string }> }) {
  try {
    const { workspaceId, renderedId } = await context.params
    await requireWorkspaceMember(workspaceId)
    const rows = await prisma.$queryRaw<Array<{ storageKey: string | null; status: string }>>(Prisma.sql`SELECT "storageKey","status" FROM "RenderedDocument" WHERE "id"=${renderedId} AND "workspaceId"=${workspaceId} LIMIT 1`)
    const document = rows[0]
    if (!document) return NextResponse.json({ error: 'Rendered document not found' }, { status: 404 })
    if (document.status !== 'COMPLETED' || !document.storageKey) return NextResponse.json({ error: 'Rendered document is not available' }, { status: 409 })
    const response = await getPrivateObject(document.storageKey)
    return new Response(response.body, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="cloudie-${renderedId}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load rendered document'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
