import test from 'node:test'
import assert from 'node:assert/strict'
import { roleHasPermission } from '../lib/permissions'
import { sanitizeFilename, validateUpload } from '../lib/storage'
import { canOperateWarehouseShipment } from '../lib/warehouse'
import { validPaymentSignature } from '../app/api/webhooks/payments/route'
import { createHmac } from 'node:crypto'

test('permission matrix denies customer global shipment access', () => {
  assert.equal(roleHasPermission('CUSTOMER', 'shipments.read'), false)
  assert.equal(roleHasPermission('CUSTOMER', 'orders.read'), true)
})

test('workspace admin cannot grant platform super-admin permission through workspace RBAC', () => {
  assert.equal(roleHasPermission('WORKSPACE_ADMIN', 'admin.platform'), false)
  assert.equal(roleHasPermission('SUPER_ADMIN', 'admin.platform'), true)
})

test('driver has delivery permission but not member administration', () => {
  assert.equal(roleHasPermission('DRIVER', 'shipments.deliver'), true)
  assert.equal(roleHasPermission('DRIVER', 'members.manage'), false)
})

test('warehouse staff can operate only explicitly assigned warehouses', () => {
  assert.equal(canOperateWarehouseShipment(['warehouse-a'], 'warehouse-a'), true)
  assert.equal(canOperateWarehouseShipment(['warehouse-a'], 'warehouse-b'), false)
  assert.equal(canOperateWarehouseShipment(['warehouse-a', 'warehouse-c'], 'warehouse-b'), false)
  assert.equal(canOperateWarehouseShipment([], 'warehouse-a'), false)
  assert.equal(canOperateWarehouseShipment(['warehouse-a'], null), false)
})

test('payment webhook signature accepts only the exact signed payload', () => {
  const raw = JSON.stringify({ event: 'payment.succeeded', amount: '100.00' })
  const secret = 'test-webhook-secret'
  const signature = createHmac('sha256', secret).update(raw).digest('hex')
  assert.equal(validPaymentSignature(raw, signature, secret), true)
  assert.equal(validPaymentSignature(raw + ' ', signature, secret), false)
  assert.equal(validPaymentSignature(raw, signature.slice(0, -1) + '0', secret), false)
})

test('document filename sanitization removes path/control characters', () => {
  assert.equal(sanitizeFilename('../../private report.pdf'), 'private_report.pdf')
})

test('document validation rejects unsupported types and oversized uploads', () => {
  assert.throws(() => validateUpload('application/x-msdownload', 10))
  assert.throws(() => validateUpload('application/pdf', 5 * 1024 * 1024))
  assert.doesNotThrow(() => validateUpload('application/pdf', 1024))
})
