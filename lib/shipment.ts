import { randomBytes } from 'node:crypto'
import { ShipmentStatus } from '@prisma/client'

export const shipmentTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED', 'RETURNED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'RETURNED'],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: ['IN_TRANSIT', 'RETURNED'],
  RETURNED: [],
}

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus) {
  return shipmentTransitions[from].includes(to)
}

export function generateTrackingNumber() {
  return `CLD-${randomBytes(5).toString('hex').toUpperCase()}`
}
