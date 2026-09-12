import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export class PointsError extends Error {
  constructor(message: string, public readonly code = 'POINTS_ERROR') {
    super(message)
    this.name = 'PointsError'
  }
}

export type PointOperation = 'CREDIT' | 'DEBIT'

export type PointMutationInput = {
  userId: string
  amount: number
  description: string
  reference: string
  workspace?: string
}

function assertAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new PointsError('Point amount must be a positive integer', 'INVALID_AMOUNT')
  }
}

function hashLockKey(value: string): bigint {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return BigInt(hash >>> 0)
}

async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hashLockKey(key)})`
}

async function mutate(operation: PointOperation, input: PointMutationInput) {
  assertAmount(input.amount)
  if (!input.reference.trim()) throw new PointsError('A unique point transaction reference is required', 'INVALID_REFERENCE')

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Acquire row-level exclusive lock on User to serialize all point operations.
          // This must happen FIRST, before any reads, to prevent read-after-write conflicts.
          // FOR UPDATE blocks concurrent transactions until this one commits.
          const user = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE
          `

          if (!user || user.length === 0) {
            throw new PointsError('User not found', 'USER_NOT_FOUND')
          }

          // Lock the reference to ensure idempotency under concurrency.
          // This prevents duplicate ledger entries for the same reference.
          await lock(tx, `point-reference:${input.reference}`)

          // Check if this reference was already processed.
          // Safe because User lock serializes all operations for this user.
          const existing = await tx.pointLedger.findFirst({
            where: { reference: input.reference },
            select: { id: true, amount: true, balance: true, description: true, userId: true },
          })
          if (existing) {
            if (existing.userId !== input.userId || Math.abs(existing.amount) !== input.amount) {
              throw new PointsError('Point reference has already been used with different data', 'IDEMPOTENCY_CONFLICT')
            }
            return { ...existing, idempotent: true }
          }

          // Calculate new balance from all existing ledger entries.
          // Safe because User lock prevents concurrent updates.
          const aggregate = await tx.pointLedger.aggregate({ where: { userId: input.userId }, _sum: { amount: true } })
          const currentBalance = aggregate._sum.amount ?? 0
          const nextBalance = operation === 'CREDIT' ? currentBalance + input.amount : currentBalance - input.amount

          if (operation === 'DEBIT' && nextBalance < 0) {
            throw new PointsError('Insufficient points', 'INSUFFICIENT_POINTS')
          }

          // Create ledger entry with calculated balance.
          // Foreign key constraint ensures User still exists (would fail if User was deleted).
          const entry = await tx.pointLedger.create({
            data: {
              userId: input.userId,
              amount: operation === 'CREDIT' ? input.amount : -input.amount,
              balance: nextBalance,
              description: input.description,
              reference: input.reference,
            },
          })

          return { ...entry, idempotent: false }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
      )
    } catch (error) {
      if (error instanceof PointsError) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 3) {
        // P2034: Transaction conflict or deadlock; retry with backoff
        const delayMs = 50 * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      throw error
    }
  }
  throw new PointsError('Unable to safely update points after 4 attempts', 'TRANSACTION_RETRY_EXHAUSTED')
}

export function creditPoints(input: PointMutationInput) {
  return mutate('CREDIT', input)
}

export function debitPoints(input: PointMutationInput) {
  return mutate('DEBIT', input)
}

export async function getPointBalance(userId: string) {
  const result = await prisma.pointLedger.aggregate({ where: { userId }, _sum: { amount: true } })
  return result._sum.amount ?? 0
}

export async function getPointLedger(userId: string, options?: { take?: number; skip?: number }) {
  return prisma.pointLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(options?.take ?? 50, 1), 200),
    skip: Math.max(options?.skip ?? 0, 0),
  })
}
