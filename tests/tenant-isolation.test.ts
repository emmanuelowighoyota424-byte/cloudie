import test from 'node:test'
import assert from 'node:assert/strict'

type Identity = { workspaceId: string; role: string }
type Resource = { workspaceId: string; id: string }

function canRead(identity: Identity, resource: Resource) {
  return identity.workspaceId === resource.workspaceId
}

function canWrite(identity: Identity, resource: Resource) {
  return identity.workspaceId === resource.workspaceId && ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'].includes(identity.role)
}

const a: Identity = { workspaceId: 'workspace-a', role: 'WORKSPACE_ADMIN' }
const b: Identity = { workspaceId: 'workspace-b', role: 'WORKSPACE_ADMIN' }
const resources = ['workspace', 'member', 'shipment', 'customer', 'driver', 'warehouse', 'document', 'order', 'notification', 'subscription', 'auditLog']

for (const kind of resources) {
  test(`cross-tenant ${kind} read is denied`, () => {
    assert.equal(canRead(a, { workspaceId: b.workspaceId, id: `${kind}-b` }), false)
  })
  test(`cross-tenant ${kind} write is denied`, () => {
    assert.equal(canWrite(a, { workspaceId: b.workspaceId, id: `${kind}-b` }), false)
  })
}

test('same-tenant manager-level resource operation is allowed', () => {
  assert.equal(canWrite(a, { workspaceId: a.workspaceId, id: 'shipment-a' }), true)
})

test('lower roles cannot escalate through ordinary resource operations', () => {
  for (const role of ['CUSTOMER', 'DRIVER', 'WAREHOUSE_STAFF', 'STAFF', 'VENDOR']) {
    assert.equal(canWrite({ workspaceId: a.workspaceId, role }, { workspaceId: a.workspaceId, id: 'resource-a' }), false)
  }
})
