import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { paystackAmount, validPaystackSignature, createCloudiePaymentReference } from '../lib/paystack'

test('Paystack HMAC signature accepts valid payload and rejects invalid signature', () => {
  const raw = JSON.stringify({ event: 'charge.success', data: { id: 42 } })
  const secret = 'unit-test-secret'
  const signature = createHmac('sha512', secret).update(raw).digest('hex')
  assert.equal(validPaystackSignature(raw, signature, secret), true)
  assert.equal(validPaystackSignature(raw, `${signature}0`, secret), false)
})

test('Paystack amount converts supported currencies to smallest units', () => {
  assert.equal(paystackAmount(new Prisma.Decimal('10000.00'), 'NGN'), 1000000)
  assert.equal(paystackAmount(new Prisma.Decimal('12.50'), 'USD'), 1250)
  assert.equal(paystackAmount(new Prisma.Decimal('10000'), 'XOF'), 10000)
})

test('Cloudie payment references are unique and not order ids', () => {
  const a = createCloudiePaymentReference()
  const b = createCloudiePaymentReference()
  assert.match(a, /^CLD-/)
  assert.notEqual(a, b)
})
