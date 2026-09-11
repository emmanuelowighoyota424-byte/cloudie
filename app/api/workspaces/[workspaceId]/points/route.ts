import { NextResponse } from 'next/server'
import { PointEntryType } from '@prisma/client'
import { z } from 'zod'
import { isAuthorizationError, requireWorkspaceMembership } from '@/lib/authz'
import { applyPoints, getPointsBalance, PointsError } from '@/lib/points'

const operationSchema = z.object({
  amount: z.number().int().positive().max(1_000_000_000),
  type: z.enum(['CREDIT', 'DEBIT']),
  description: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().trim().min(8).max(128),
  reference: z.string().trim().max(200).optional(),
})

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMembership(workspaceId)
    const balance = await getPointsBalance(user.id, workspaceId)
    return NextResponse.json({ workspaceId, balance: balance.balance, version: balance.version, updatedAt: balance.updatedAt })
  } catch (error) {
    if (isAuthorizationError(error) || error instanceof PointsError) {
      const status = error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403
      return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status })
    }
    console.error('GET points balance failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMembership(workspaceId)
    const input = operationSchema.parse(await request.json())
    const entry = await applyPoints({
      userId: user.id,
      workspaceId,
      amount: input.amount,
      type: input.type === 'CREDIT' ? PointEntryType.CREDIT : PointEntryType.DEBIT,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      reference: input.reference,
    })
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    if (isAuthorizationError(error)) {
      return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Unauthorized' : 'Forbidden' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 })
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid points payload', issues: error.issues }, { status: 400 })
    if (error instanceof PointsError) {
      const statusMap: Record<string, number> = {
        FORBIDDEN: 403,
        INSUFFICIENT_POINTS: 409,
        IDEMPOTENCY_CONFLICT: 409,
        IDEMPOTENCY_KEY_REQUIRED: 400,
        POINTS_AMOUNT_INVALID: 400,
        DESCRIPTION_REQUIRED: 400,
      }
      return NextResponse.json({ error: error.message }, { status: statusMap[error.message] ?? 409 })
    }
    console.error('POST points operation failed', error)
    return NextResponse.json({ error: 'Unable to apply points operation' }, { status: 500 })
  }
}
