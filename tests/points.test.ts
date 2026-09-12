import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { creditPoints, debitPoints, getPointBalance, getPointLedger } from '../lib/points'

// Existing point tests remain unchanged above this section.

test('points handles mixed concurrent operations (+10, +20, -5, +30, -10)', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not configured')
    return
  }

  const userId = `mixed-${randomUUID()}`
  const email = `${userId}@example.test`
  await prisma.user.create({ data: { id: userId, name: 'Mixed Operations Test', email } })

  try {
    // Seed exactly the total possible concurrent debit amount. This makes every
    // valid interleaving safe: either debit may execute first, and both debits
    // remain authorized without relying on scheduler ordering.
    await creditPoints({ userId, amount: 15, description: 'initial debit coverage', reference: `${userId}:seed` })

    // Expected final balance: seed 15 +10 +20 -5 +30 -10 = +60.
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
    assert.equal(ledger.length, 6, 'exactly 6 ledger entries including seed')

    const balance = await getPointBalance(userId)
    const expected = 15 + 10 + 20 - 5 + 30 - 10
    assert.equal(balance, expected, `final balance is ${expected}`)

    const ledgerTotal = ledger.reduce((sum, entry) => sum + entry.amount, 0)
    assert.equal(ledgerTotal, balance, 'ledger total equals balance')
  } finally {
    await prisma.user.delete({ where: { id: userId } })
  }
})
