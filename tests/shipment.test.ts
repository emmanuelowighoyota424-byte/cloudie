import test from 'node:test'
import assert from 'node:assert/strict'
import { ShipmentStatus } from '@prisma/client'
import { canTransitionShipment, generateTrackingNumber } from '../lib/shipment'

test('shipment transitions reject impossible lifecycle changes', () => {
  assert.equal(canTransitionShipment(ShipmentStatus.PENDING, ShipmentStatus.CONFIRMED), true)
  assert.equal(canTransitionShipment(ShipmentStatus.CONFIRMED, ShipmentStatus.DELIVERED), false)
  assert.equal(canTransitionShipment(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT), false)
})

test('tracking numbers are production-safe and match the public format', () => {
  const first = generateTrackingNumber()
  const second = generateTrackingNumber()
  assert.match(first, /^CLD-[A-F0-9]{10}$/)
  assert.match(second, /^CLD-[A-F0-9]{10}$/)
  assert.notEqual(first, second)
})
