import { NextResponse } from 'next/server'
import { debitPoints, creditPoints, PointsError } from '@/lib/points'
import { requireUser, requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as { operation?: unknown; amount?: unknown; description?: unknown; reference?: unknown; workspaceId?: unknown } | null
    const operation = body?.operation
    const amount = body?.amount
    const description = body?.description
    const reference = body?.reference
    const workspaceId = body?.workspaceId

    if (operation !== 'CREDIT' && operation !== 'DEBIT') return NextResponse.json({ ok: false, error: { code: 'INVALID_OPERATION', message: 'Operation must be CREDIT or DEBIT' } }, { status: 400 })
    if (!Number.isSafeInteger(amount) || Number(amount) <= 0) return NextResponse.json({ ok: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be a positive integer' } }, { status: 400 })
    if (typeof description !== 'string' || !description.trim() || description.length > 240) return NextResponse.json({ ok: false, error: { code: 'INVALID_DESCRIPTION', message: 'A valid description is required' } }, { status: 400 })
    if (typeof reference !== 'string' || !reference.trim() || reference.length > 160) return NextResponse.json({ ok: false, error: { code: 'INVALID_REFERENCE', message: 'A unique reference is required' } }, { status: 400 })
    if (workspaceId !== undefined && typeof workspaceId !== 'string') return NextResponse.json({ ok: false, error: { code: 'INVALID_WORKSPACE', message: 'workspaceId must be a string' } }, { status: 400 })

    if (workspaceId) await requireWorkspaceMember(workspaceId)

    if (operation === 'CREDIT' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'Customer credits must be created by an authorized business event' } }, { status: 403 })
    }

    const result = operation === 'CREDIT'
      ? await creditPoints({ userId: user.id, amount: Number(amount), description: description.trim(), reference: reference.trim(), workspace: workspaceId })
      : await debitPoints({ userId: user.id, amount: Number(amount), description: description.trim(), reference: reference.trim(), workspace: workspaceId })

    await prisma.auditLog.create({ data: { userId: user.id, actorId: user.id, workspaceId: workspaceId ?? null, action: `POINT_${operation}`, entity: 'PointLedger', entityId: result.id, result: 'SUCCESS', metadata: { reference: reference.trim(), amount: Number(amount), idempotent: result.idempotent } } })

    return NextResponse.json({ ok: true, data: { transaction: result } }, { status: result.idempotent ? 200 : 201 })
  } catch (error) {
    if (error instanceof PointsError) {
      const status = error.code === 'INSUFFICIENT_POINTS' ? 422 : error.code === 'IDEMPOTENCY_CONFLICT' ? 409 : error.code === 'INVALID_AMOUNT' || error.code === 'INVALID_REFERENCE' ? 400 : 422
      return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ ok: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 })
    const message = error instanceof Error ? error.message : ''
    if (message === 'Authentication required' || message === 'Account suspended') return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED', message } }, { status: 401 })
    if (message.includes('access denied') || message.includes('Insufficient workspace permissions')) return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'Workspace access denied' } }, { status: 403 })
    return NextResponse.json({ ok: false, error: { code: 'TRANSACTION_FAILED', message: 'Unable to process transaction' } }, { status: 500 })
  }
}
