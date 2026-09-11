import test from 'node:test'
import assert from 'node:assert/strict'
import { canTransitionShipment, generateTrackingNumber } from '../lib/shipment'

test('shipment lifecycle accepts valid transitions', () => {
  assert.equal(canTransitionShipment('PENDING', 'CONFIRMED'), true)
  assert.equal(canTransitionShipment('CONFIRMED', 'PICKED_UP'), true)
  assert.equal(canTransitionShipment('PICKED_UP', 'IN_TRANSIT'), true)
  assert.equal(canTransitionShipment('IN_TRANSIT', 'OUT_FOR_DELIVERY'), true)
  assert.equal(canTransitionShipment('OUT_FOR_DELIVERY', 'DELIVERED'), true)
})

test('shipment lifecycle rejects impossible transitions', () => {
  assert.equal(canTransitionShipment('PENDING', 'DELIVERED'), false)
  assert.equal(canTransitionShipment('DELIVERED', 'IN_TRANSIT'), false)
  assert.equal(canTransitionShipment('CANCELLED', 'CONFIRMED'), false)
})

test('tracking numbers are production-safe and correctly formatted', () => {
  const tracking = generateTrackingNumber()
  assert.match(tracking, /^CLD-[0-9A-F]{10}$/)
})

test('tracking number generation is collision-resistant across a sample', () => {
  const values = new Set(Array.from({ length: 250 }, generateTrackingNumber))
  assert.equal(values.size, 250)
})
