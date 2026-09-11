import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { getTestAuth } from './auth-test'

const enabled = Boolean(process.env.E2E_BASE_URL)
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
let testAuth: Awaited<ReturnType<typeof getTestAuth>>
let users: Array<{ id: string }>
let workspaceA: { id: string }
let workspaceB: { id: string }
let shipmentB: { id: string }
let documentB: { id: string }

async function requestAs(headers: Headers, path: string, init: RequestInit = {}) {
  const headersOut = new Headers(init.headers)
  for (const [key, value] of headers.entries()) headersOut.set(key, value)
  const response = await fetch(`${baseURL}${path}`, { ...init, headers: headersOut })
  const body = await response.text()
  return { response, body }
}

async function expectDenied(headers: Headers, path: string, init: RequestInit = {}) {
  const { response } = await requestAs(headers, path, init)
  assert.ok([401, 403, 404].includes(response.status), `${init.method ?? 'GET'} ${path} unexpectedly returned ${response.status}`)
}

before(async () => {
  if (!enabled) return
  testAuth = await getTestAuth()
  const prefix = `cloudie-e2e-${Date.now()}`
  const testUsers = await Promise.all(['admin-a', 'admin-b', 'customer-a', 'customer-b', 'driver-a', 'driver-b', 'warehouse-a', 'warehouse-b'].map((name) => testAuth.createUser({ email: `${prefix}-${name}@example.test`, name: `E2E ${name}`, emailVerified: true })))
  users = testUsers.map((user) => ({ id: user.id }))
  await Promise.all(users.map((user) => testAuth.saveUser(user as never)))

  workspaceA = await prisma.workspace.create({
    data: {
      name: `${prefix} A`, slug: `${prefix}-a`, ownerId: users[0].id,
      members: { create: [{ userId: users[0].id, role: 'WORKSPACE_ADMIN' }, { userId: users[2].id, role: 'CUSTOMER' }, { userId: users[4].id, role: 'DRIVER' }, { userId: users[6].id, role: 'WAREHOUSE_STAFF' }] },
      subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
    },
  })
  workspaceB = await prisma.workspace.create({
    data: {
      name: `${prefix} B`, slug: `${prefix}-b`, ownerId: users[1].id,
      members: { create: [{ userId: users[1].id, role: 'WORKSPACE_ADMIN' }, { userId: users[3].id, role: 'CUSTOMER' }, { userId: users[5].id, role: 'DRIVER' }, { userId: users[7].id, role: 'WAREHOUSE_STAFF' }] },
      subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
    },
  })

  const customerB = await prisma.customer.create({ data: { workspaceId: workspaceB.id, name: 'E2E Customer B', email: `${prefix}-customer-b@example.test` } })
  const driverB = await prisma.driver.create({ data: { workspaceId: workspaceB.id, userId: users[5].id, name: 'E2E Driver B' } })
  const warehouseB = await prisma.warehouse.create({ data: { workspaceId: workspaceB.id, name: 'E2E Warehouse B' } })
  await prisma.warehouseStaffAssignment.create({ data: { workspaceId: workspaceB.id, warehouseId: warehouseB.id, userId: users[7].id } })
  const shipment = await prisma.shipment.create({ data: { workspaceId: workspaceB.id, trackingId: `CLD-E2E-${Date.now()}`, creatorId: users[1].id, customerId: customerB.id, driverId: driverB.id, warehouseId: warehouseB.id, origin: 'E2E Origin B', destination: 'E2E Destination B', status: 'CONFIRMED' } })
  shipmentB = { id: shipment.id }
  documentB = await prisma.document.create({ data: { workspaceId: workspaceB.id, ownerId: users[1].id, shipmentId: shipment.id, customerId: customerB.id, name: 'private-b.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(1), storageKey: 'e2e/nonexistent-private-b.pdf' } })
  const productB = await prisma.product.create({ data: { workspaceId: workspaceB.id, name: 'E2E Product B', sku: `E2E-${Date.now()}`, price: 10, stock: 10, active: true } })
  await prisma.order.create({ data: { workspaceId: workspaceB.id, userId: users[3].id, customerId: customerB.id, status: 'PENDING', paymentStatus: 'PENDING', subtotal: 10, total: 10, commission: 0, idempotencyKey: `${prefix}-order`, items: { create: [{ productId: productB.id, quantity: 1, unitPrice: 10 }] } } })
  await prisma.notification.create({ data: { workspaceId: workspaceB.id, userId: users[1].id, title: 'E2E B', message: 'private B' } })
  await prisma.auditLog.create({ data: { workspaceId: workspaceB.id, actorId: users[1].id, userId: users[1].id, action: 'e2e.private', entity: 'Workspace', entityId: workspaceB.id } })
})

after(async () => {
  if (!enabled || !workspaceA || !workspaceB) return
  await prisma.$transaction([
    prisma.document.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.shipmentEvent.deleteMany({ where: { shipment: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } }),
    prisma.proofOfDelivery.deleteMany({ where: { shipment: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } }),
    prisma.orderItem.deleteMany({ where: { order: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } }),
    prisma.payment.deleteMany({ where: { order: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } }),
    prisma.order.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.product.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.notification.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.warehouseStaffAssignment.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.driver.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.warehouse.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.customer.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.workspaceInvitation.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.subscription.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }),
    prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } }),
  ])
  await Promise.all(users.map((user) => testAuth.deleteUser(user.id)))
  await prisma.$disconnect()
})

test('authenticated workspace A cannot read workspace B resources', { skip: !enabled }, async () => {
  const headers = await testAuth.getAuthHeaders({ userId: users[0].id })
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/dashboard`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/members`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/shipments`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/orders`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/notifications`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/documents`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/customer/shipments`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/driver/shipments`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/warehouse/shipments`)
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/documents/${documentB.id}`)
})

test('authenticated workspace A cannot mutate workspace B shipment state', { skip: !enabled }, async () => {
  const headers = await testAuth.getAuthHeaders({ userId: users[0].id })
  await expectDenied(headers, `/api/workspaces/${workspaceB.id}/shipments/${shipmentB.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'PICKED_UP' }) })
})

test('customer, driver and warehouse identities remain scoped to their own workspace', { skip: !enabled }, async () => {
  const customerA = await testAuth.getAuthHeaders({ userId: users[2].id })
  const driverA = await testAuth.getAuthHeaders({ userId: users[4].id })
  const warehouseA = await testAuth.getAuthHeaders({ userId: users[6].id })
  await expectDenied(customerA, `/api/workspaces/${workspaceB.id}/customer/shipments`)
  await expectDenied(driverA, `/api/workspaces/${workspaceB.id}/driver/shipments`)
  await expectDenied(warehouseA, `/api/workspaces/${workspaceB.id}/warehouse/shipments`)
})

test('customer, driver and warehouse can operate on authorized workspace B resources', { skip: !enabled }, async () => {
  const customer = await testAuth.getAuthHeaders({ userId: users[3].id })
  const customerResult = await requestAs(customer, `/api/workspaces/${workspaceB.id}/customer/shipments`)
  assert.equal(customerResult.response.status, 200)
  assert.match(customerResult.body, new RegExp(shipmentB.id))

  const warehouse = await testAuth.getAuthHeaders({ userId: users[7].id })
  const warehouseList = await requestAs(warehouse, `/api/workspaces/${workspaceB.id}/warehouse/shipments`)
  assert.equal(warehouseList.response.status, 200)
  assert.match(warehouseList.body, new RegExp(shipmentB.id))
  const received = await requestAs(warehouse, `/api/workspaces/${workspaceB.id}/warehouse/shipments`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shipmentId: shipmentB.id, action: 'RECEIVE' }) })
  assert.equal(received.response.status, 200)

  const driver = await testAuth.getAuthHeaders({ userId: users[5].id })
  for (const status of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']) {
    const result = await requestAs(driver, `/api/workspaces/${workspaceB.id}/driver/shipments`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shipmentId: shipmentB.id, status }) })
    assert.equal(result.response.status, 200)
  }
  const final = await prisma.shipment.findUnique({ where: { id: shipmentB.id }, select: { status: true } })
  assert.equal(final?.status, 'OUT_FOR_DELIVERY')
})
