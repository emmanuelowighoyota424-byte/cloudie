import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { creditPoints, debitPoints, PointsError, getPointBalance } from '../lib/points'
import { prisma } from '../lib/prisma'

test('points rejects non-positive amounts before touching the database', async () => {
  await assert.rejects(
    () => creditPoints({ userId: 'user', amount: 0, description: 'invalid', reference: 'test-invalid-0' }),
    (error: unknown) => error instanceof PointsError && error.code === 'INVALID_AMOUNT',
  )
})

test('points rejects missing idempotency references', async () => {
  await assert.rejects(
    () => debitPoints({ userId: 'user', amount: 10, description: 'missing reference', reference: '   ' }),
    (error: unknown) => error instanceof PointsError && error.code === 'INVALID_REFERENCE',
  )
})

test('points preserves balance under concurrent credits', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const userId = `concurrency-${randomUUID()}`
  const email = `${userId}@example.test`
  await prisma.user.create({ data: { id: userId, name: 'Concurrency Test', email } })

  try {
    const operations = Array.from({ length: 20 }, (_, index) =>
      creditPoints({
        userId,
        amount: 5,
        description: 'concurrency test',
        reference: `${userId}:${index}`,
      }),
    )

    const results = await Promise.all(operations)
    assert.equal(results.filter((entry) => entry.idempotent).length, 0)
    assert.equal(await getPointBalance(userId), 100)
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})

test('points is idempotent under concurrent duplicate references', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const userId = `idempotency-${randomUUID()}`
  const email = `${userId}@example.test`
  await prisma.user.create({ data: { id: userId, name: 'Idempotency Test', email } })

  try {
    const reference = `${userId}:same`
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        creditPoints({ userId, amount: 7, description: 'duplicate reference test', reference }),
      ),
    )

    assert.equal(results.filter((entry) => entry.idempotent).length, 11)
    assert.equal(await getPointBalance(userId), 7)
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})
