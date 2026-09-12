import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { creditPoints, debitPoints, PointsError, getPointBalance, getPointLedger } from '../lib/points'
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

test('points rejects operations on nonexistent users', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const nonexistentUserId = `nonexistent-${randomUUID()}`
  await assert.rejects(
    () => creditPoints({
      userId: nonexistentUserId,
      amount: 10,
      description: 'test',
      reference: `${nonexistentUserId}:ref`,
    }),
    (error: unknown) => error instanceof PointsError && error.code === 'USER_NOT_FOUND',
  )
})

test('points preserves balance under concurrent credits (20 × +5 = 100)', async (t) => {
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
    
    // Verify all operations succeeded without idempotency
    assert.equal(results.length, 20, 'all operations completed')
    assert.equal(results.filter((entry) => entry.idempotent).length, 0, 'no idempotent duplicates')
    
    // Verify ledger entries
    const ledger = await getPointLedger(userId, { take: 100 })
    assert.equal(ledger.length, 20, 'exactly 20 ledger entries')
    
    // Verify balance
    const balance = await getPointBalance(userId)
    assert.equal(balance, 100, 'final balance is 20 × 5 = 100')
    
    // Verify ledger total equals balance
    const ledgerTotal = ledger.reduce((sum, entry) => sum + entry.amount, 0)
    assert.equal(ledgerTotal, balance, 'ledger total equals balance')
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})

test('points is idempotent under concurrent duplicate references (12 × same ref)', async (t) => {
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

    // Exactly one succeeds, 11 are idempotent duplicates
    assert.equal(results.filter((entry) => entry.idempotent).length, 11, 'exactly 11 idempotent')
    assert.equal(results.filter((entry) => !entry.idempotent).length, 1, 'exactly 1 new entry')
    
    // Only one ledger entry created
    const ledger = await getPointLedger(userId)
    assert.equal(ledger.length, 1, 'exactly 1 ledger entry')
    assert.equal(ledger[0].amount, 7, 'ledger entry has correct amount')
    
    // Balance reflects single operation
    const balance = await getPointBalance(userId)
    assert.equal(balance, 7, 'balance is 7')
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})

test('points handles mixed concurrent operations (+10, +20, -5, +30, -10)', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const userId = `mixed-${randomUUID()}`
  const email = `${userId}@example.test`
  await prisma.user.create({ data: { id: userId, name: 'Mixed Operations Test', email } })

  try {
    // Expected: +10 +20 -5 +30 -10 = +45
    const operations = [
      creditPoints({ userId, amount: 10, description: 'op1', reference: `${userId}:1` }),
      creditPoints({ userId, amount: 20, description: 'op2', reference: `${userId}:2` }),
      debitPoints({ userId, amount: 5, description: 'op3', reference: `${userId}:3` }),
      creditPoints({ userId, amount: 30, description: 'op4', reference: `${userId}:4` }),
      debitPoints({ userId, amount: 10, description: 'op5', reference: `${userId}:5` }),
    ]

    const results = await Promise.all(operations)
    assert.equal(results.length, 5, 'all operations completed')
    assert.equal(results.filter((entry) => entry.idempotent).length, 0, 'no duplicates')
    
    const ledger = await getPointLedger(userId, { take: 100 })
    assert.equal(ledger.length, 5, 'exactly 5 ledger entries')
    
    const balance = await getPointBalance(userId)
    const expected = 10 + 20 - 5 + 30 - 10 // = 45
    assert.equal(balance, expected, `final balance is ${expected}`)
    
    const ledgerTotal = ledger.reduce((sum, entry) => sum + entry.amount, 0)
    assert.equal(ledgerTotal, balance, 'ledger total equals balance')
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})

test('points rejects debit when insufficient points under concurrent operations', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const userId = `insufficient-${randomUUID()}`
  const email = `${userId}@example.test`
  await prisma.user.create({ data: { id: userId, name: 'Insufficient Points Test', email } })

  try {
    // Start with credit of 25
    await creditPoints({ userId, amount: 25, description: 'initial', reference: `${userId}:init` })
    
    // Attempt concurrent operations totaling more than available
    // Two operations each trying to debit 20 (total 40, but only 25 available)
    const operations = [
      debitPoints({ userId, amount: 20, description: 'debit1', reference: `${userId}:d1` }),
      debitPoints({ userId, amount: 20, description: 'debit2', reference: `${userId}:d2` }),
    ]

    const results = await Promise.all(operations.map(op => op.catch(e => e)))
    
    // One succeeds (balance becomes 5), one fails (insufficient points)
    const succeeded = results.filter(r => !(r instanceof Error))
    const failed = results.filter(r => r instanceof Error)
    
    assert.equal(succeeded.length, 1, 'exactly one debit succeeds')
    assert.equal(failed.length, 1, 'exactly one debit fails')
    assert.ok(failed[0] instanceof PointsError && failed[0].code === 'INSUFFICIENT_POINTS')
    
    const balance = await getPointBalance(userId)
    assert.equal(balance, 5, 'final balance is 25 - 20 = 5')
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})

test('points detects idempotency conflicts (same ref, different amounts)', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const userId = `conflict-${randomUUID()}`
  const email = `${userId}@example.test`
  await prisma.user.create({ data: { id: userId, name: 'Conflict Test', email } })

  try {
    const reference = `${userId}:conflict`
    
    // First operation succeeds
    const first = await creditPoints({ userId, amount: 10, description: 'first', reference })
    assert.ok(!first.idempotent)
    
    // Subsequent operation with same ref but different amount fails
    await assert.rejects(
      () => creditPoints({ userId, amount: 20, description: 'different amount', reference }),
      (error: unknown) => error instanceof PointsError && error.code === 'IDEMPOTENCY_CONFLICT',
    )
    
    const balance = await getPointBalance(userId)
    assert.equal(balance, 10, 'only first operation counted')
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})
