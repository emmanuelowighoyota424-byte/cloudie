import test from 'node:test'
import assert from 'node:assert/strict'
import { roleHasPermission } from '@/lib/permissions'

type Identity = { workspaceId: string; role: string }
type Resource = { workspaceId: string; id: string }

function sameWorkspace(identity: Identity, resource: Resource) {
  return Boolean(identity.workspaceId) && identity.workspaceId === resource.workspaceId
}

function canRead(identity: Identity, resource: Resource) {
  return sameWorkspace(identity, resource)
}

function canWrite(identity: Identity, resource: Resource) {
  return sameWorkspace(identity, resource) && ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'].includes(identity.role)
}

const a: Identity = { workspaceId: 'workspace-a', role: 'WORKSPACE_ADMIN' }
const b: Identity = { workspaceId: 'workspace-b', role: 'WORKSPACE_ADMIN' }
const resources = ['workspace', 'member', 'shipment', 'customer', 'driver', 'warehouse', 'document', 'order', 'notification', 'subscription', 'auditLog']

for (const kind of resources) {
  test(`cross-tenant ${kind} read is denied`, () => assert.equal(canRead(a, { workspaceId: b.workspaceId, id: `${kind}-b` }), false))
  test(`cross-tenant ${kind} write is denied`, () => assert.equal(canWrite(a, { workspaceId: b.workspaceId, id: `${kind}-b` }), false))
}

test('same-tenant manager-level resource operation is allowed', () => {
  assert.equal(canWrite(a, { workspaceId: a.workspaceId, id: 'shipment-a' }), true)
})

test('lower roles cannot escalate through ordinary resource operations', () => {
  for (const role of ['CUSTOMER', 'DRIVER', 'WAREHOUSE_STAFF', 'STAFF', 'VENDOR']) {
    assert.equal(canWrite({ workspaceId: a.workspaceId, role }, { workspaceId: a.workspaceId, id: 'resource-a' }), false)
  }
})

test('role permissions prevent customer shipment writes and platform escalation', () => {
  assert.equal(roleHasPermission('CUSTOMER', 'shipments.read'), false)
  assert.equal(roleHasPermission('CUSTOMER', 'shipments.update'), false)
  assert.equal(roleHasPermission('CUSTOMER', 'admin.platform'), false)
  assert.equal(roleHasPermission('SUPER_ADMIN', 'admin.platform'), true)
})

test('driver permissions do not grant assignment or generic shipment update', () => {
  assert.equal(roleHasPermission('DRIVER', 'shipments.assign'), false)
  assert.equal(roleHasPermission('DRIVER', 'shipments.update'), false)
  assert.equal(roleHasPermission('DRIVER', 'shipments.deliver'), true)
})

test('warehouse staff cannot manage warehouse configuration', () => {
  assert.equal(roleHasPermission('WAREHOUSE_STAFF', 'warehouse.read'), true)
  assert.equal(roleHasPermission('WAREHOUSE_STAFF', 'warehouse.manage'), false)
})
