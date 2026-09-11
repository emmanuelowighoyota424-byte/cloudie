import test from 'node:test'
import assert from 'node:assert/strict'
import { creditPoints, debitPoints, PointsError } from '../lib/points'

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
