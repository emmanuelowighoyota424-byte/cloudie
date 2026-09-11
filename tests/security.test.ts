import test from 'node:test'
import assert from 'node:assert/strict'
import { roleHasPermission } from '../lib/permissions'
import { sanitizeFilename, validateUpload } from '../lib/storage'
import { canOperateWarehouseShipment } from '../lib/warehouse'

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

test('document filename sanitization removes path/control characters', () => {
  assert.equal(sanitizeFilename('../../private report.pdf'), 'private_report.pdf')
})

test('document validation rejects unsupported types and oversized uploads', () => {
  assert.throws(() => validateUpload('application/x-msdownload', 10))
  assert.throws(() => validateUpload('application/pdf', 5 * 1024 * 1024))
  assert.doesNotThrow(() => validateUpload('application/pdf', 1024))
})
