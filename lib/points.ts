import { Prisma, PointEntryType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export class PointsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PointsError'
  }
}

type PointsOperation = {
  userId: string
  workspaceId: string
  amount: number
  type: PointEntryType
  description: string
  idempotencyKey: string
  reference?: string
}

export async function applyPoints(operation: PointsOperation) {
  if (!Number.isSafeInteger(operation.amount) || operation.amount <= 0) {
    throw new PointsError('POINTS_AMOUNT_INVALID')
  }
  if (!operation.idempotencyKey.trim()) throw new PointsError('IDEMPOTENCY_KEY_REQUIRED')
  if (!operation.description.trim()) throw new PointsError('DESCRIPTION_REQUIRED')

  const signedAmount = operation.type === PointEntryType.DEBIT ? -operation.amount : operation.amount

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.pointLedger.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId: operation.workspaceId, idempotencyKey: operation.idempotencyKey } },
        })
        if (existing) {
          if (existing.userId !== operation.userId || existing.amount !== signedAmount || existing.type !== operation.type) {
            throw new PointsError('IDEMPOTENCY_CONFLICT')
          }
          return existing
        }

        const membership = await tx.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId: operation.workspaceId, userId: operation.userId } },
          select: { id: true },
        })
        if (!membership) throw new PointsError('FORBIDDEN')

        const account = await tx.pointAccount.upsert({
          where: { workspaceId_userId: { workspaceId: operation.workspaceId, userId: operation.userId } },
          create: { workspaceId: operation.workspaceId, userId: operation.userId },
          update: {},
        })

        const nextBalance = account.balance + signedAmount
        if (nextBalance < 0) throw new PointsError('INSUFFICIENT_POINTS')

        const updated = await tx.pointAccount.updateMany({
          where: { id: account.id, version: account.version, balance: account.balance },
          data: { balance: nextBalance, version: { increment: 1 } },
        })
        if (updated.count !== 1) throw new Prisma.PrismaClientKnownRequestError('POINTS_RETRY', { code: 'P2034', clientVersion: '6.19.3' })

        return tx.pointLedger.create({
          data: {
            userId: operation.userId,
            workspaceId: operation.workspaceId,
            pointAccountId: account.id,
            type: operation.type,
            amount: signedAmount,
            balance: nextBalance,
            description: operation.description,
            reference: operation.reference,
            idempotencyKey: operation.idempotencyKey,
          },
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (error instanceof PointsError) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.pointLedger.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId: operation.workspaceId, idempotencyKey: operation.idempotencyKey } },
        })
        if (existing) return existing
      }
      throw error
    }
  }

  throw new PointsError('POINTS_RETRY_EXHAUSTED')
}

export async function getPointsBalance(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  })
  if (!membership) throw new PointsError('FORBIDDEN')

  const account = await prisma.pointAccount.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { balance: true, version: true, updatedAt: true },
  })
  return account ?? { balance: 0, version: 0, updatedAt: new Date(0) }
}
